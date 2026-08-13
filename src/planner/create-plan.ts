import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { VirtualArtifact } from '../domain/artifacts.js'
import type { ChangePlan } from '../domain/change-plan.js'
import { sortDiagnostics, type Diagnostic } from '../domain/diagnostics.js'
import { sha256Utf8 } from './hash.js'
import {
  inspectArtifact,
  normalizeArtifactPath,
  resolveConfinedPath,
} from './inspect.js'
import { computePlanHash, serializeChangePlan } from './serialize-plan.js'

export interface PlanRequest {
  readonly command: string
  readonly toolkitVersion: string
  readonly repositoryRoot: string
  /** Explicit absolute destination outside repositoryRoot. */
  readonly planPath: string
  /** Canonical source files, relative to repositoryRoot. */
  readonly sourcePaths?: readonly string[]
  /** Reviewed virtual output from an adapter. */
  readonly desiredArtifacts: readonly VirtualArtifact[]
  readonly removals?: readonly string[]
  readonly diagnostics?: readonly Diagnostic[]
  readonly createdAt?: string
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function isOutside(root: string, candidate: string): boolean {
  const offset = relative(root, candidate)
  return offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)
}

async function nearestExistingDirectory(
  input: string,
): Promise<{ readonly lexical: string; readonly real: string }> {
  let cursor = input
  while (true) {
    try {
      const metadata = await lstat(cursor)
      if (!metadata.isDirectory()) throw new Error(`Plan parent is not a directory: ${cursor}`)
      return { lexical: cursor, real: await realpath(cursor) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(cursor)
      if (parent === cursor) throw error
      cursor = parent
    }
  }
}

async function validatePlanPath(repositoryRoot: string, planPath: string): Promise<string> {
  if (planPath.length === 0 || !isAbsolute(planPath)) {
    throw new Error('Plan path must be an explicit absolute path outside the consumer worktree')
  }
  const rootLexical = resolve(repositoryRoot)
  const rootReal = await realpath(repositoryRoot)
  const target = resolve(planPath)
  if (!isOutside(rootLexical, target) || !isOutside(rootReal, target)) {
    throw new Error('Plan path must be outside the consumer worktree')
  }

  const parent = dirname(target)
  const existingParent = await nearestExistingDirectory(parent)
  const suffix = relative(existingParent.lexical, parent)
  const resolvedParent = resolve(existingParent.real, suffix)
  const resolvedTarget = resolve(resolvedParent, basename(target))
  if (!isOutside(rootReal, resolvedTarget)) {
    throw new Error('Plan path resolves inside the consumer worktree')
  }
  try {
    const metadata = await lstat(target)
    if (metadata.isSymbolicLink()) throw new Error('Plan path must not be a symbolic link')
    if (metadata.isDirectory()) throw new Error('Plan path must name a file')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return target
}

function assertUnique(paths: readonly string[], category: string): void {
  const seen = new Set<string>()
  for (const path of paths) {
    if (seen.has(path)) throw new Error(`Duplicate target ${path} in ${category}`)
    seen.add(path)
  }
}

async function savePlanAtomically(planPath: string, contents: string): Promise<void> {
  const parent = dirname(planPath)
  await mkdir(parent, { recursive: true })
  const temporaryPath = join(parent, `.${basename(planPath)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' })
    await rename(temporaryPath, planPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

async function stageAndValidateArtifact(
  stagingRoot: string,
  artifact: VirtualArtifact,
): Promise<void> {
  const target = join(stagingRoot, ...artifact.path.split('/'))
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, artifact.content, 'utf8')
  const staged = await readFile(target, 'utf8')
  const actualHash = sha256Utf8(staged)
  if (actualHash !== artifact.sha256) {
    throw new Error(`Virtual artifact hash mismatch for ${artifact.path}`)
  }
}

/** Inspect sources and virtual artifacts, then save a hash-bound plan without mutating the repository. */
export async function createChangePlan(request: PlanRequest): Promise<ChangePlan> {
  const repositoryRoot = await realpath(request.repositoryRoot)
  const planPath = await validatePlanPath(repositoryRoot, request.planPath)
  const stagingRoot = await mkdtemp(join(tmpdir(), 'agent-policy-plan-'))
  let plan!: ChangePlan

  try {
    const sourcePaths = (request.sourcePaths ?? []).map(normalizeArtifactPath)
    assertUnique(sourcePaths, 'canonical sources')

    const desired = request.desiredArtifacts.map((candidate) => ({
      ...candidate,
      path: normalizeArtifactPath(candidate.path),
    }))
    const explicitRemovals = (request.removals ?? []).map(normalizeArtifactPath)
    const deleteArtifacts = desired.filter(({ operation }) => operation === 'delete')
    const projectedArtifacts = desired.filter(({ operation }) => operation !== 'delete')
    const removals = [...explicitRemovals, ...deleteArtifacts.map(({ path }) => path)]
    const targets = [...projectedArtifacts.map(({ path }) => path), ...removals]
    assertUnique(targets, 'plan targets')

    for (const path of [...sourcePaths, ...targets]) {
      await resolveConfinedPath(repositoryRoot, path)
    }
    for (const artifact of projectedArtifacts) {
      await stageAndValidateArtifact(stagingRoot, artifact)
    }

    const sourceHashes: Record<string, string> = {}
    for (const sourcePath of [...sourcePaths].sort(compareStrings)) {
      const target = await resolveConfinedPath(repositoryRoot, sourcePath)
      sourceHashes[sourcePath] = sha256Utf8(await readFile(target.path, 'utf8'))
    }

    const currentArtifactHashes: Record<string, string> = {}
    const currentManagedRegionHashes: Record<string, string> = {}
    const plannedArtifacts: VirtualArtifact[] = []
    for (const artifact of [...projectedArtifacts].sort((left, right) =>
      compareStrings(left.path, right.path))) {
      const inspection = await inspectArtifact(repositoryRoot, artifact)
      if (inspection.state === 'invalid-marker') {
        throw new Error(`Invalid Managed Region markers in current artifact: ${artifact.path}`)
      }
      if (inspection.state === 'clean' && artifact.operation !== 'managed-region-remove') continue
      if (inspection.state === 'missing' && artifact.operation === 'managed-region-remove') continue
      if (inspection.currentSha256 !== undefined) {
        currentArtifactHashes[artifact.path] = inspection.currentSha256
      }
      if (inspection.managedRegionSha256 !== undefined) {
        currentManagedRegionHashes[artifact.path] = inspection.managedRegionSha256
      }
      plannedArtifacts.push({
        ...artifact,
        operation: artifact.operation === 'managed-region'
          ? 'managed-region'
          : artifact.operation === 'managed-region-remove'
            ? 'managed-region-remove'
            : inspection.state === 'missing' ? 'create' : 'replace',
      })
    }

    const plannedRemovals: string[] = []
    for (const removal of [...removals].sort(compareStrings)) {
      const target = await resolveConfinedPath(repositoryRoot, removal)
      try {
        const content = await readFile(target.path, 'utf8')
        currentArtifactHashes[removal] = sha256Utf8(content)
        plannedRemovals.push(removal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }

    const partialPlan = {
      schemaVersion: '1',
      command: request.command,
      toolkitVersion: request.toolkitVersion,
      repositoryRootFingerprint: sha256Utf8(repositoryRoot),
      sourceHashes,
      currentArtifactHashes,
      currentManagedRegionHashes,
      desiredArtifacts: plannedArtifacts,
      removals: plannedRemovals,
      diagnostics: sortDiagnostics(request.diagnostics ?? []),
      createdAt: request.createdAt ?? new Date().toISOString(),
    } satisfies Omit<ChangePlan, 'planHash'>
    plan = { ...partialPlan, planHash: computePlanHash(partialPlan) }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }

  await savePlanAtomically(planPath, serializeChangePlan(plan))
  return plan
}
