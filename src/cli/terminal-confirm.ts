import { createInterface } from 'node:readline/promises'
import { stdin as terminalInput, stdout as terminalOutput } from 'node:process'

export interface TerminalConfirmationPorts {
  readonly input: NodeJS.ReadableStream & { readonly isTTY?: boolean }
  readonly output: NodeJS.WritableStream & { readonly isTTY?: boolean }
}

const defaultPorts: TerminalConfirmationPorts = {
  input: terminalInput,
  output: terminalOutput,
}

/** Confirm only when both terminal ends are interactive; piped invocations default to no. */
export async function confirmInTerminal(
  message: string,
  ports: TerminalConfirmationPorts = defaultPorts,
): Promise<boolean> {
  if (ports.input.isTTY !== true || ports.output.isTTY !== true) return false
  const readline = createInterface({ input: ports.input, output: ports.output })
  try {
    const answer = await readline.question(`${message} [y/N] `)
    return /^(?:y|yes)$/i.test(answer.trim())
  } finally {
    readline.close()
  }
}
