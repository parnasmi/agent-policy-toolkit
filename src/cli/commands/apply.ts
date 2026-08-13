import { isAbsolute, resolve } from 'node:path'

import type { CliIo } from '../main.js'
import { CliUsageError, type CliArguments } from '../arguments.js'
import { applyPlan } from '../../applier/apply-plan.js'
import {
  chooseReconciliation,
  formatError,
  reconciliationPlanPath,
  readChangePlan,
  saveRegenerationPlan,
  type CommandContext,
} from './common.js'
import { reconcileDrift } from '../../applier/reconcile.js'

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
  if (!isAbsolute(args.positionals[0])) {
    throw new CliUsageError('Change Plan path must be an explicit absolute path outside the consumer worktree')
  }
  try {
    const plan = await readChangePlan(context.repositoryRoot, args.positionals[0])
    if (!args.yes && !(await io.confirm('Apply this reviewed Change Plan?'))) {
      io.stderr += 'Application was not confirmed. Pass --yes for non-interactive application.\n'
      return 1
    }
    const result = await applyPlan(plan, {
      repositoryRoot: context.repositoryRoot,
      toolkitVersion: context.toolkitVersion,
    })
    if (!result.ok) {
      if (result.code === 'source-drift' || result.code === 'artifact-drift' || result.code === 'ownership-drift') {
        const artifactPath = result.paths[0] ?? 'unknown artifact'
        const choice = await chooseReconciliation(
          args,
          io,
          `Drift detected at ${artifactPath}; choose reconciliation`,
        )
        const proposal = reconcileDrift(choice, {
          artifactPath,
          currentContent: '',
        })
        if (proposal.kind === 'abort') {
          io.stderr += 'Drift reconciliation aborted; no files were changed.\n'
          return 1
        }
        if (proposal.kind === 'replan' && proposal.choice === 'regenerate') {
          try {
            const regeneratedPath = reconciliationPlanPath(args.positionals[0])
            await saveRegenerationPlan(context, plan, regeneratedPath, result.code !== 'source-drift')
            io.stdout += `Regeneration Change Plan saved: ${regeneratedPath}\n`
            io.stdout += 'No files were changed. Apply this reviewed plan, then retry the original operation.\n'
          } catch (regenerationError) {
            io.stderr += `${formatError(regenerationError)}\n`
          }
          return 1
        }
        io.stderr += proposal.kind === 'unresolved'
          ? 'Drift remains unresolved; no files were changed.\n'
          : 'Adoption requires a representable canonical-source proposal; no files were changed.\n'
        return 1
      }
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
