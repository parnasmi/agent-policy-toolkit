import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import type { VirtualArtifact } from '../../domain/artifacts.js'
import { PolicyError } from '../../domain/diagnostics.js'
import { hasValidArtifactHash } from '../../planner/hash.js'
import { MANAGED_REGION_END, MANAGED_REGION_START } from '../../adapters/codex/managed-region.js'
import {
  compileCodex,
  findGeneratedFiles,
  formatError,
  hasManagedRegion,
  managedRemovalArtifact,
  readText,
  saveProjectionPlan,
  type CommandContext,
} from './common.js'

function assertCanonicalArtifact(path: string, current: string, canonical: VirtualArtifact): void {
  if (current === canonical.content) return
  throw new Error(`Generated artifact drift at ${path}; reconcile before planning removal`)
}

function sourceUnavailable(error: unknown): boolean {
  return error instanceof PolicyError
    && error.diagnostics.length > 0
    && error.diagnostics.every(({ code }) => code === 'MISSING_MANIFEST_REFERENCE' || code === 'MISSING_POLICY_SOURCE')
}

function assertSourceLessArtifact(path: string, content: string, managedRegion: boolean): void {
  const integrityContent = managedRegion
    ? content.slice(
      content.indexOf(MANAGED_REGION_START),
      content.indexOf(MANAGED_REGION_END) + MANAGED_REGION_END.length,
    )
    : content
  if (!hasValidArtifactHash(integrityContent)) {
    throw new Error(`Generated artifact drift or missing integrity metadata at ${path}; reconcile before planning removal`)
  }
}

async function targetRemoval(
  context: CommandContext,
): Promise<{ readonly sourcePaths: readonly string[]; readonly desired: readonly VirtualArtifact[]; readonly removals: readonly string[] }> {
  const compilation = await compileCodex(context)
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
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
