import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import { applyPlan } from '../../applier/apply-plan.js'
import {
  formatError,
  readChangePlan,
  type CommandContext,
} from './common.js'

export async function runApply(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  if (args.positionals.length !== 1 || args.positionals[0] === undefined || args.plan !== undefined) {
    throw new Error('apply requires exactly one Change Plan path')
  }
  if (args.target.length > 0 || args.bundles.length > 0 || args.generated) {
    throw new Error('apply accepts only a Change Plan path and --yes')
  }
  try {
    const plan = await readChangePlan(args.positionals[0])
    if (!args.yes && !(await io.confirm('Apply this reviewed Change Plan?'))) {
      io.stderr += 'Application was not confirmed. Pass --yes for non-interactive application.\n'
      return 1
    }
    const result = await applyPlan(plan, {
      repositoryRoot: context.repositoryRoot,
      toolkitVersion: context.toolkitVersion,
    })
    if (!result.ok) {
      io.stderr += `Apply failed (${result.code}): ${result.message}\n`
      if (result.paths.length > 0) io.stderr += `Paths: ${result.paths.join(', ')}\n`
      return 1
    }
    io.stdout += `Applied ${result.appliedPaths.length} path(s) from ${resolve(args.positionals[0])}.\n`
    if (result.warnings !== undefined) {
      for (const warning of result.warnings) io.stderr += `Warning: ${warning}\n`
    }
    io.stdout += 'Ready to commit. The CLI did not commit changes.\n'
    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
