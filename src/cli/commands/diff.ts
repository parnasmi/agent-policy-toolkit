import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import { formatChangePlanDiff } from '../format-diff.js'
import {
  formatError,
  readChangePlan,
  type CommandContext,
} from './common.js'

async function snapshot(context: CommandContext, paths: readonly string[]): Promise<ReadonlyMap<string, string | undefined>> {
  const values = new Map<string, string | undefined>()
  for (const path of paths) {
    try {
      values.set(path, await readFile(resolve(context.repositoryRoot, ...path.split('/')), 'utf8'))
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
  if (args.target.length > 0 || args.bundles.length > 0 || args.yes || args.generated) {
    throw new Error('diff accepts only one Change Plan path')
  }
  if (args.positionals.length !== 1 || args.positionals[0] === undefined || args.plan !== undefined) {
    throw new Error('diff requires exactly one Change Plan path')
  }
  try {
    const plan = await readChangePlan(args.positionals[0])
    const paths = [
      ...Object.keys(plan.sourceHashes),
      ...plan.desiredArtifacts.map(({ path }) => path),
      ...plan.removals,
    ]
    const contents = await snapshot(context, paths)
    io.stdout += formatChangePlanDiff(plan, {
      repositoryRoot: context.repositoryRoot,
      contents,
    })
    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
