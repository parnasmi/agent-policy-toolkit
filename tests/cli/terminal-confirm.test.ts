import { PassThrough } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { confirmInTerminal } from '../../src/cli/terminal-confirm.js'

describe('terminal confirmation', () => {
  it('does not confirm when either stream is non-interactive', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    expect(await confirmInTerminal('Confirm?', { input, output })).toBe(false)
  })

  it('accepts an explicit yes from an interactive terminal', async () => {
    const input = new PassThrough() as PassThrough & { isTTY?: boolean }
    const output = new PassThrough() as PassThrough & { isTTY?: boolean }
    input.isTTY = true
    output.isTTY = true
    const confirmation = confirmInTerminal('Confirm?', { input, output })
    input.end('yes\n')
    expect(await confirmation).toBe(true)
  })
})
