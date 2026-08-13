import { fileURLToPath } from 'node:url'
import { parseCliArguments, requireCommand, type CliArguments, type ReconciliationChoice } from './arguments.js'
import { runApply } from './commands/apply.js'
import { runCheck } from './commands/check.js'
import { runDiff } from './commands/diff.js'
import { runInit } from './commands/init.js'
import { runRemove } from './commands/remove.js'
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

Drift reconciliation: add --reconcile adopt|regenerate|abort, or choose interactively when supported.

Commands create read-only reviewed plans until apply crosses the mutation boundary.
--yes confirms reviewed application; it never confirms advisory Bundle Selection.
`

function context(): CommandContext {
  return {
    repositoryRoot: process.cwd(),
    toolkitRoot: fileURLToPath(new URL('../../', import.meta.url)),
    toolkitVersion: '0.1.0-alpha.1',
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
