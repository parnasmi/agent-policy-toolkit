import { fileURLToPath } from 'node:url'
import { parseCliArguments, requireCommand, type CliArguments, type ReconciliationChoice } from './arguments.js'
import { runApply } from './commands/apply.js'
import { runCheck } from './commands/check.js'
import { runDiff } from './commands/diff.js'
import { runInit } from './commands/init.js'
import { runRemove } from './commands/remove.js'
import { runAuditCommand } from './commands/audit.js'
import { runValidateReportCommand } from './commands/validate-report.js'
import { runStageSourceCommand } from './commands/stage-source.js'
import { runStageInvariantCommand } from './commands/stage-invariant.js'
import { runExportProposalCommand } from './commands/export-proposal.js'
import { formatError, type CommandContext } from './commands/common.js'

export interface FileSystemPorts {
  readonly readFile: (path: string) => Promise<string>
  readonly writeFile: (path: string, contents: string) => Promise<void>
  readonly exists: (path: string) => Promise<boolean>
}

export interface CliIo {
  stdout: string
  stderr: string
  readonly confirm: (message: string) => Promise<boolean>
  /** Present an explicit drift choice in interactive clients. */
  readonly choose?: (message: string, choices: readonly ReconciliationChoice[]) => Promise<ReconciliationChoice>
  readonly fs: FileSystemPorts
}

const helpText = `Agent Policy Toolkit

Usage:
  agent-policy <command>
  agent-policy init --target codex [--bundles <id,...>] --plan <absolute-path>
  agent-policy diff <absolute-plan-path>
  agent-policy apply <absolute-plan-path> --yes
  agent-policy check
  agent-policy remove --target codex --plan <absolute-plan-path>
  agent-policy remove --generated --plan <absolute-plan-path>
  agent-policy audit [--path <glob>] [--format json|text]
  agent-policy validate-report <path/to/report.json>
  agent-policy stage-source [--scope project|upstream] --spec <spec.yaml|json> --plan <absolute-plan-path>
  agent-policy stage-invariant --add <ruleId> [--spec <spec.yaml|json>] --plan <absolute-plan-path>
  agent-policy stage-invariant --remove <ruleId> --plan <absolute-plan-path>
  agent-policy export-proposal --spec <spec.yaml|json> [--output <path/to/proposal.yaml>]

Drift reconciliation: add --reconcile adopt|regenerate|abort, or choose interactively when supported.

Commands create read-only reviewed plans until apply crosses the mutation boundary.
When .agent-policy/policy.yaml is absent, init stages a minimal consumer-owned manifest; only applying its reviewed plan creates it.
--yes confirms reviewed application; it never confirms advisory Bundle Selection.
`

function context(): CommandContext {
  return {
    repositoryRoot: process.cwd(),
    toolkitRoot: fileURLToPath(new URL('../../', import.meta.url)),
    toolkitVersion: '0.1.0-alpha.3',
  }
}

function usageMessage(error: unknown): string {
  return `CLI usage error: ${formatError(error)}\nRun agent-policy --help for usage.\n`
}

async function dispatch(args: CliArguments, io: CliIo, commandContext: CommandContext): Promise<number> {
  switch (requireCommand(args.command)) {
    case 'init': return runInit(args, io, commandContext)
    case 'diff': return runDiff(args, io, commandContext)
    case 'apply': return runApply(args, io, commandContext)
    case 'check': return runCheck(args, io, commandContext)
    case 'remove': return runRemove(args, io, commandContext)
    case 'audit': return runAuditCommand(args, io, commandContext)
    case 'validate-report': return runValidateReportCommand(args, io, commandContext)
    case 'stage-source': return runStageSourceCommand(args, io, commandContext)
    case 'stage-invariant': return runStageInvariantCommand(args, io, commandContext)
    case 'export-proposal': return runExportProposalCommand(args, io, commandContext)
  }
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  let args: CliArguments
  try {
    args = parseCliArguments(argv)
  } catch (error) {
    io.stderr += usageMessage(error)
    return 2
  }

  if (args.help) {
    io.stdout += helpText
    return 0
  }

  try {
    return await dispatch(args, io, context())
  } catch (error) {
    io.stderr += `${usageMessage(error)}`
    return 2
  }
}
