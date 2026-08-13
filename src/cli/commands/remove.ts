import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import type { VirtualArtifact } from '../../domain/artifacts.js'
import {
  compileCodex,
  findGeneratedFiles,
  formatError,
  managedRemovalArtifact,
  readText,
  saveProjectionPlan,
  type CommandContext,
} from './common.js'

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
      const removal = managedRemovalArtifact({ path: artifact.path, content: current, kind: 'managed-region' })
      if (removal !== undefined) desired.push(removal)
    } else {
      removals.push(artifact.path)
    }
  }
  return { sourcePaths: compilation.sourcePaths, desired, removals }
}

async function generatedRemoval(
  context: CommandContext,
): Promise<{ readonly sourcePaths: readonly string[]; readonly desired: readonly VirtualArtifact[]; readonly removals: readonly string[] }> {
  const generated = await findGeneratedFiles(context.repositoryRoot)
  const desired: VirtualArtifact[] = []
  const removals: string[] = []
  for (const file of generated) {
    if (file.kind === 'managed-region') {
      const artifact = managedRemovalArtifact(file)
      if (artifact !== undefined) desired.push(artifact)
    } else {
      removals.push(file.path)
    }
  }
  let sourcePaths: readonly string[] = []
  try {
    sourcePaths = (await compileCodex(context)).sourcePaths
  } catch {
    // Generated cleanup remains available if canonical sources have already been removed.
  }
  return { sourcePaths, desired, removals }
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
