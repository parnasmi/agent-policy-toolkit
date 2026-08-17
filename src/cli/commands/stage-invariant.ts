import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { stageAddInvariant, stageRemoveInvariant } from '../../planner/stage-invariants.js'
import { CliUsageError, requirePlan, type CliArguments } from '../arguments.js'
import type { CliIo } from '../main.js'
import { absolutePlanPath, formatError, type CommandContext } from './common.js'

export async function runStageInvariantCommand(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  const planPath = absolutePlanPath(context.repositoryRoot, requirePlan(args))

  if (args.add !== undefined && args.remove !== undefined) {
    throw new CliUsageError('Cannot specify both --add and --remove')
  }

  try {
    if (args.add !== undefined) {
      let spec: string | undefined
      if (args.spec !== undefined) {
        const specPath = isAbsolute(args.spec)
          ? resolve(args.spec)
          : resolve(context.repositoryRoot, args.spec)
        spec = await readFile(specPath, 'utf8')
      }

      const plan = await stageAddInvariant({
        repositoryRoot: context.repositoryRoot,
        toolkitRoot: context.toolkitRoot,
        toolkitVersion: context.toolkitVersion,
        planPath,
        ruleId: args.add,
        spec,
      })

      io.stdout += `Staged invariant addition for ${args.add}. Change plan written to ${planPath} (hash: ${plan.planHash.slice(0, 12)}).\n`
      return 0
    }

    if (args.remove !== undefined) {
      const plan = await stageRemoveInvariant({
        repositoryRoot: context.repositoryRoot,
        toolkitRoot: context.toolkitRoot,
        toolkitVersion: context.toolkitVersion,
        planPath,
        ruleId: args.remove,
      })

      io.stdout += `Staged invariant removal for ${args.remove}. Change plan written to ${planPath} (hash: ${plan.planHash.slice(0, 12)}).\n`
      return 0
    }

    throw new CliUsageError('Either --add <ruleId> or --remove <ruleId> must be specified')
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
