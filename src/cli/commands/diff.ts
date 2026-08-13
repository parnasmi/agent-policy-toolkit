import { readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

import type { CliIo } from '../main.js'
import { CliUsageError, type CliArguments } from '../arguments.js'
import { detectChangePlanDrift, formatChangePlanDiff } from '../format-diff.js'
import { resolveConfinedPath } from '../../planner/inspect.js'
import {
  formatError,
  readChangePlan,
  type CommandContext,
} from './common.js'

async function snapshot(context: CommandContext, paths: readonly string[]): Promise<ReadonlyMap<string, string | undefined>> {
  const values = new Map<string, string | undefined>()
  for (const path of paths) {
    const target = await resolveConfinedPath(context.repositoryRoot, path)
    try {
      values.set(path, await readFile(target.path, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      values.set(path, undefined)
    }
  }
  return values
}

export async function runDiff(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  if (args.target.length > 0 || args.bundles.length > 0 || args.yes || args.generated || args.reconcile !== undefined) {
    throw new Error('diff accepts only one Change Plan path')
  }
  if (args.positionals.length !== 1 || args.positionals[0] === undefined || args.plan !== undefined) {
    throw new Error('diff requires exactly one Change Plan path')
  }
  if (!isAbsolute(args.positionals[0])) {
    throw new CliUsageError('Change Plan path must be an explicit absolute path outside the consumer worktree')
  }
  try {
    const plan = await readChangePlan(context.repositoryRoot, args.positionals[0])
    const paths = [
      ...Object.keys(plan.sourceHashes),
      ...(plan.sourceChanges ?? []).map(({ path }) => path),
      ...plan.desiredArtifacts.map(({ path }) => path),
      ...plan.removals,
    ]
    const contents = await snapshot(context, paths)
    io.stdout += formatChangePlanDiff(plan, {
      repositoryRoot: context.repositoryRoot,
      contents,
    })
    return detectChangePlanDrift(plan, contents).length === 0 ? 0 : 1
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
