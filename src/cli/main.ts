import { parseArgs } from 'node:util'

export interface FileSystemPorts {
  readonly readFile: (path: string) => Promise<string>
  readonly writeFile: (path: string, contents: string) => Promise<void>
  readonly exists: (path: string) => Promise<boolean>
}

export interface CliIo {
  stdout: string
  stderr: string
  readonly confirm: (message: string) => Promise<boolean>
  readonly fs: FileSystemPorts
}

const helpText = `Agent Policy Toolkit

Usage:
  agent-policy <command>

Commands:
  init
  remove
  diff
  apply
  check
`

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: true,
  })

  if (values.help) {
    io.stdout += helpText
    return 0
  }

  io.stderr += 'Run agent-policy --help for usage.\n'
  return 1
}
