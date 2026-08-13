import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import type { VirtualArtifact } from '../../domain/artifacts.js'
import { PolicyError } from '../../domain/diagnostics.js'
import { hasValidArtifactHash } from '../../planner/hash.js'
import { hasValidPolicyLockHash, POLICY_LOCK_PATH } from '../../planner/policy-lock.js'
import { MANAGED_REGION_END, MANAGED_REGION_START } from '../../adapters/codex/managed-region.js'
import {
  compileCodex,
  ArtifactDriftError,
  chooseReconciliation,
  findGeneratedFiles,
  formatError,
  hasManagedRegion,
  managedRemovalArtifact,
  readText,
  reconciliationPlanPath,
  saveProjectionPlan,
  type CommandContext,
} from './common.js'

function assertCanonicalArtifact(path: string, current: string, canonical: VirtualArtifact): void {
  if (current === canonical.content) return
  if (path === POLICY_LOCK_PATH && !hasValidPolicyLockHash(current)) {
    throw new ArtifactDriftError(path, current, `Generated artifact drift at ${path}; reconcile before planning removal`)
  }
  const integrityContent = canonical.operation === 'managed-region'
    ? current.slice(
      current.indexOf(MANAGED_REGION_START),
      current.indexOf(MANAGED_REGION_END) + MANAGED_REGION_END.length,
    )
    : current
  if (hasValidArtifactHash(integrityContent)) return
  throw new ArtifactDriftError(path, current, `Generated artifact drift at ${path}; reconcile before planning removal`)
}

function sourceUnavailable(error: unknown): boolean {
  return error instanceof PolicyError
    && error.diagnostics.length > 0
    && error.diagnostics.every(({ code }) => code === 'MISSING_MANIFEST_REFERENCE' || code === 'MISSING_POLICY_SOURCE')
}

function assertSourceLessArtifact(path: string, content: string, managedRegion: boolean): void {
  if (path === POLICY_LOCK_PATH) {
    if (!hasValidPolicyLockHash(content)) {
      throw new ArtifactDriftError(path, content, `Generated artifact drift or missing integrity metadata at ${path}; reconcile before planning removal`)
    }
    return
  }
  const integrityContent = managedRegion
    ? content.slice(
      content.indexOf(MANAGED_REGION_START),
      content.indexOf(MANAGED_REGION_END) + MANAGED_REGION_END.length,
    )
    : content
  if (!hasValidArtifactHash(integrityContent)) {
    throw new ArtifactDriftError(path, content, `Generated artifact drift or missing integrity metadata at ${path}; reconcile before planning removal`)
  }
}

async function targetRemoval(
  context: CommandContext,
): Promise<{ readonly sourcePaths: readonly string[]; readonly desired: readonly VirtualArtifact[]; readonly removals: readonly string[] }> {
  const compilation = await compileCodex(context)
  const generated = await findGeneratedFiles(context.repositoryRoot)
  const codexGenerated = generated.filter(({ path }) =>
    path === 'AGENTS.md' || /^\.agents\/skills\/[^/]+\/SKILL\.md$/.test(path),
  )
  const expectedPaths = new Set(compilation.artifacts.map(({ path }) => path))
  const desired: VirtualArtifact[] = []
  const removals: string[] = []
  for (const artifact of compilation.artifacts) {
    const current = await readText(context.repositoryRoot, artifact.path)
    if (current === undefined) continue
    if (artifact.operation === 'managed-region') {
      if (!hasManagedRegion(current)) continue
      assertCanonicalArtifact(artifact.path, current, artifact)
      const removal = managedRemovalArtifact({ path: artifact.path, content: current, kind: 'managed-region' })
      if (removal !== undefined) desired.push(removal)
    } else {
      assertCanonicalArtifact(artifact.path, current, artifact)
      removals.push(artifact.path)
    }
  }
  for (const file of codexGenerated) {
    if (expectedPaths.has(file.path)) continue
    assertSourceLessArtifact(file.path, file.content, file.kind === 'managed-region')
    if (file.kind === 'managed-region') {
      const removal = managedRemovalArtifact(file)
      if (removal !== undefined) desired.push(removal)
    } else {
      removals.push(file.path)
    }
  }
  return { sourcePaths: compilation.sourcePaths, desired, removals }
}

async function generatedRemoval(
  context: CommandContext,
): Promise<{ readonly sourcePaths: readonly string[]; readonly desired: readonly VirtualArtifact[]; readonly removals: readonly string[] }> {
  let compilation: Awaited<ReturnType<typeof compileCodex>> | undefined
  try {
    compilation = await compileCodex(context)
  } catch (error) {
    if (!sourceUnavailable(error)) throw error
  }
  const canonical = new Map(compilation?.artifacts.map((artifact) => [artifact.path, artifact]) ?? [])
  const generated = await findGeneratedFiles(context.repositoryRoot)
  const desired: VirtualArtifact[] = []
  const removals: string[] = []
  for (const file of generated) {
    const expected = canonical.get(file.path)
    if (expected === undefined) assertSourceLessArtifact(file.path, file.content, file.kind === 'managed-region')
    else assertCanonicalArtifact(file.path, file.content, expected)
    if (file.kind === 'managed-region') {
      const artifact = managedRemovalArtifact(file)
      if (artifact !== undefined) desired.push(artifact)
    } else {
      removals.push(file.path)
    }
  }
  const lock = await readText(context.repositoryRoot, '.agent-policy/policy.lock.json')
  if (lock !== undefined) {
    const expected = canonical.get('.agent-policy/policy.lock.json')
    if (expected !== undefined) assertCanonicalArtifact('.agent-policy/policy.lock.json', lock, expected)
    else assertSourceLessArtifact('.agent-policy/policy.lock.json', lock, false)
    removals.push('.agent-policy/policy.lock.json')
  }
  return { sourcePaths: compilation?.sourcePaths ?? [], desired, removals }
}

export async function runRemove(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  if (args.positionals.length > 0 || args.bundles.length > 0 || args.yes) {
    throw new Error('remove accepts a selector and --plan; use apply to mutate')
  }
  if (args.target.length > 0 && args.generated) throw new Error('Choose either --target codex or --generated')
  if (args.target.length > 0 && (args.target.length !== 1 || args.target[0] !== 'codex')) {
    throw new Error('remove supports only --target codex')
  }
  if (args.target.length === 0 && !args.generated) throw new Error('remove requires --target codex or --generated')
  if (args.plan === undefined) throw new Error('remove requires --plan')

  try {
    const selected = args.generated
      ? await generatedRemoval(context)
      : await targetRemoval(context)
    const plan = await saveProjectionPlan(
      context,
      args.generated ? 'remove-generated' : 'remove-codex',
      args.plan,
      selected.sourcePaths,
      selected.desired,
      selected.removals,
    )
    io.stdout += `Removal Change Plan saved: ${resolve(args.plan)}\n`
    io.stdout += `Planned removal of ${plan.desiredArtifacts.length + plan.removals.length} generated path(s).\n`
    return 0
  } catch (error) {
    if (error instanceof ArtifactDriftError) {
      const choice = await chooseReconciliation(args, io, `Drift detected at ${error.artifactPath}; choose reconciliation`)
      if (choice === 'abort') {
        io.stderr += 'Drift reconciliation aborted; no plan was created.\n'
        return 1
      }
      if (choice === 'regenerate') {
        try {
          const compilation = await compileCodex(context)
          const regenerated = await saveProjectionPlan(
            context,
            'regenerate',
            reconciliationPlanPath(args.plan),
            compilation.sourcePaths,
            compilation.artifacts,
          )
          io.stdout += `Regeneration Change Plan saved: ${resolve(reconciliationPlanPath(args.plan))}\n`
          io.stdout += `Planned ${regenerated.desiredArtifacts.length} generated artifact(s). Apply this reviewed plan before retrying removal.\n`
          return 1
        } catch (regenerationError) {
          io.stderr += `${formatError(regenerationError)}\n`
          return 1
        }
      }
      if (choice === undefined) {
        io.stderr += 'Drift remains unresolved; choose adopt, regenerate, or abort before planning removal.\n'
        return 1
      }
      io.stderr += 'Adoption is available only when the adapter can represent the edited intent as canonical source; no plan was created.\n'
      return 1
    }
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
