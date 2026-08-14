import { describe, expect, it } from 'vitest'

import { runCli } from '../../src/cli/main.js'
import { memoryIo } from '../helpers/memory-io.js'

describe('agent-policy --help', () => {
  it('prints product help without touching the filesystem', async () => {
    const io = memoryIo()

    await expect(runCli(['--help'], io)).resolves.toBe(0)

    expect(io.stdout).toContain('Agent Policy Toolkit')
    expect(io.stdout).toContain('agent-policy <command>')
    expect(io.stdout).toContain('When .agent-policy/policy.yaml is absent, init stages a minimal consumer-owned manifest; only applying its reviewed plan creates it.')
    expect(io.writes).toEqual([])
  })
})
