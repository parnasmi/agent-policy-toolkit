import { parseArgs } from 'node:util'

export type CliCommand = 'init' | 'diff' | 'apply' | 'check' | 'remove'

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export interface CliArguments {
  readonly command?: string
  readonly positionals: readonly string[]
  readonly help: boolean
  readonly target: readonly string[]
  readonly bundles: readonly string[]
  readonly plan?: string
  readonly yes: boolean
  readonly generated: boolean
}

function strings(value: unknown): string[] {
  if (value === undefined) return []
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/** Parse the complete command line with Node's strict option parser. */
export function parseCliArguments(argv: readonly string[]): CliArguments {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h' },
        target: { type: 'string', multiple: true },
        bundles: { type: 'string', multiple: true },
        plan: { type: 'string' },
        yes: { type: 'boolean' },
        generated: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    })
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error))
  }

  const command = parsed.positionals[0]
  return {
    command,
    positionals: parsed.positionals.slice(command === undefined ? 0 : 1),
    help: parsed.values.help === true,
    target: unique(strings(parsed.values.target)),
    bundles: unique(strings(parsed.values.bundles)),
    plan: typeof parsed.values.plan === 'string' ? parsed.values.plan : undefined,
    yes: parsed.values.yes === true,
    generated: parsed.values.generated === true,
  }
}

export function requireCommand(value: string | undefined): CliCommand {
  if (value === 'init' || value === 'diff' || value === 'apply' || value === 'check' || value === 'remove') {
    return value
  }
  throw new CliUsageError(value === undefined ? 'A command is required' : `Unknown command: ${value}`)
}

export function requireNoPositionals(args: CliArguments): void {
  if (args.positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional argument: ${args.positionals[0]}`)
  }
}

export function requirePlan(args: CliArguments): string {
  if (args.plan === undefined || args.plan.trim().length === 0) {
    throw new CliUsageError('--plan requires an explicit path')
  }
  if (args.positionals.length > 0) {
    throw new CliUsageError(`Unexpected positional argument: ${args.positionals[0]}`)
  }
  return args.plan
}

export function requirePlanPositional(args: CliArguments): string {
  if (args.plan !== undefined) throw new CliUsageError('--plan is not valid for this command')
  if (args.positionals.length !== 1 || args.positionals[0] === undefined) {
    throw new CliUsageError('Exactly one Change Plan path is required')
  }
  return args.positionals[0]
}
