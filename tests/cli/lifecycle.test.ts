import { access, constants, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli, type CliIo } from '../../src/cli/main.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function realIo(root: string, confirm = false, confirmFn?: () => Promise<boolean>): CliIo {
  return {
    stdout: '',
    stderr: '',
    confirm: confirmFn ?? (async () => confirm),
    fs: {
      readFile: async (path) => readFile(path, 'utf8'),
      writeFile: async (path, contents) => writeFile(path, contents),
      exists,
    },
  }
}

describe('policy lifecycle commands', () => {
  it('plans, reviews, applies, checks, and removes Codex projections without source writes', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-lifecycle-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'init-plan.json')
    const removePlanPath = join(parent, 'remove-plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      [
        'schemaVersion: v1',
        'toolkitVersion: 0.1.0-alpha.0',
        'bundles: [typescript]',
        'targets: [codex]',
        '',
      ].join('\n'),
    )
    const packageSource = JSON.stringify({
      name: 'consumer',
      scripts: { test: 'vitest' },
      dependencies: { '@agent-policy/agent-policy-toolkit': 'workspace:*' },
    }, null, 2) + '\n'
    await writeFile(join(root, 'package.json'), packageSource)

    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      const init = realIo(root)
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,typescript',
        '--plan', planPath,
      ], init)).resolves.toBe(0)
      expect(await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).toContain('bundles: [typescript]')
      expect(await exists(join(root, 'AGENTS.md'))).toBe(false)
      expect(await exists(planPath)).toBe(true)

      const diff = realIo(root)
      await expect(runCli(['diff', planPath], diff)).resolves.toBe(0)
      const resolvedRoot = process.cwd()
      expect(diff.stdout).toContain(`Repository: ${resolvedRoot}`)
      expect(diff.stdout.indexOf(join(resolvedRoot, 'AGENTS.md'))).toBeGreaterThanOrEqual(0)
      expect(diff.stdout.indexOf(join(resolvedRoot, 'AGENTS.md'))).toBeLessThan(diff.stdout.indexOf('+++'))
      expect(diff.stdout).toContain('Implement the explicit task without speculative scope expansion.')
      expect(await exists(join(root, 'AGENTS.md'))).toBe(false)

      const apply = realIo(root)
      await expect(runCli(['apply', planPath, '--yes'], apply)).resolves.toBe(0)
      expect(apply.stdout).toContain('Ready to commit')
      expect(await exists(join(root, 'AGENTS.md'))).toBe(true)
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(true)

      const beforeCheck = await readdir(root, { recursive: true })
      const check = realIo(root)
      await expect(runCli(['check'], check)).resolves.toBe(0)
      expect(await readdir(root, { recursive: true })).toEqual(beforeCheck)

      const remove = realIo(root)
      await expect(runCli([
        'remove',
        '--target', 'codex',
        '--plan', removePlanPath,
      ], remove)).resolves.toBe(0)
      expect(await exists(join(root, 'AGENTS.md'))).toBe(true)
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(true)

      const removeApply = realIo(root)
      await expect(runCli(['apply', removePlanPath, '--yes'], removeApply)).resolves.toBe(0)
      expect(await exists(join(root, '.agent-policy/policy.yaml'))).toBe(true)
      expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageSource)
      expect(await exists(join(root, 'AGENTS.md'))).toBe(true)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('\n')
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(false)

      const generatedPlanPath = join(parent, 'generated-plan.json')
      const reinit = realIo(root)
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,typescript',
        '--plan', generatedPlanPath,
      ], reinit)).resolves.toBe(0)
      await expect(runCli(['apply', generatedPlanPath, '--yes'], realIo(root))).resolves.toBe(0)
      const generatedRemovePlanPath = join(parent, 'generated-remove-plan.json')
      await expect(runCli([
        'remove',
        '--generated',
        '--plan', generatedRemovePlanPath,
      ], realIo(root))).resolves.toBe(0)
      await expect(runCli(['apply', generatedRemovePlanPath, '--yes'], realIo(root))).resolves.toBe(0)
      expect(await exists(join(root, '.agent-policy/policy.yaml'))).toBe(true)
      expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageSource)
      expect(await exists(join(root, 'AGENTS.md'))).toBe(true)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).not.toContain('agent-policy:start')
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(false)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('does not let --yes silently confirm advisory Bundle Selection', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-detection-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: []\ntargets: [codex]\n',
    )
    let confirmed = false
    const io = realIo(root, false, async () => {
      confirmed = true
      return false
    })
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--plan', planPath,
        '--yes',
      ], io)).resolves.toBe(1)
      expect(confirmed).toBe(true)
      expect(io.stdout).toContain('Bundle Selection')
      expect(await exists(planPath)).toBe(false)
    } finally {
      process.chdir(previousCwd)
    }
  })
})
