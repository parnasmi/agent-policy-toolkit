import { access, constants, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli, type CliIo } from '../../src/cli/main.js'
import { loadPolicyLock } from '../../src/schema/load-project.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function io(confirm = false, choose?: CliIo['choose']): CliIo {
  return {
    stdout: '',
    stderr: '',
    confirm: async () => confirm,
    ...(choose === undefined ? {} : { choose }),
    fs: {
      readFile: async (path) => readFile(path, 'utf8'),
      writeFile: async (path, contents) => writeFile(path, contents),
      exists,
    },
  }
}

async function consumer(): Promise<{ readonly parent: string; readonly root: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'agent-policy-final-fixes-'))
  const root = join(parent, 'consumer')
  await mkdir(join(root, '.agent-policy/overlays'), { recursive: true })
  await writeFile(
    join(root, '.agent-policy/policy.yaml'),
    [
      'schemaVersion: v1',
      'toolkitVersion: 0.1.0-alpha.0',
      'bundles: [react]',
      'targets: []',
      'overlays: [overlays/react.yaml]',
      '',
    ].join('\n'),
  )
  await writeFile(
    join(root, '.agent-policy/overlays/react.yaml'),
    [
      'ruleId: RULE_EVENT_LOGIC',
      'operation: addendum',
      'reason: The repository requires explicit event boundaries.',
      'content: Keep event transitions at the public boundary.',
      '',
    ].join('\n'),
  )
  return { parent, root }
}

describe('final foundation lifecycle contracts', () => {
  it('accepts a legacy alias overlay and updates targets through an init plan', async () => {
    const { parent, root } = await consumer()
    const planPath = join(parent, 'init-plan.json')
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      const init = io()
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,react',
        '--plan', planPath,
      ], init)).resolves.toBe(0)

      const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
        readonly sourceChanges?: readonly { readonly path: string; readonly content: string }[]
      }
      expect(plan.sourceChanges).toEqual([
        expect.objectContaining({ path: '.agent-policy/policy.yaml' }),
      ])
      const manifestChange = plan.sourceChanges?.[0]?.content ?? ''
      expect(manifestChange).toMatch(/targets:\s*\[\s*codex\s*\]/)
      expect(await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).toContain('targets: []')

      await expect(runCli(['apply', planPath, '--yes'], io())).resolves.toBe(0)
      expect(await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).toMatch(/targets:\s*\[\s*codex\s*\]/)
      expect(await readFile(join(root, '.agents/skills/react/SKILL.md'), 'utf8')).toContain(
        'Keep event transitions at the public boundary.',
      )
      expect(await exists(join(root, 'AGENTS.md'))).toBe(true)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('fails check and target removal when Codex is not selected', async () => {
    const { parent, root } = await consumer()
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      const check = io()
      await expect(runCli(['check'], check)).resolves.toBe(1)
      expect(check.stderr).toMatch(/codex.*target|target.*codex/i)

      const remove = io()
      await expect(runCli([
        'remove',
        '--target', 'codex',
        '--plan', join(parent, 'remove-plan.json'),
      ], remove)).resolves.toBe(1)
      expect(remove.stderr).toMatch(/codex.*target|target.*codex/i)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('creates, checks, and removes a deterministic generated policy lock', async () => {
    const { parent, root } = await consumer()
    const initPlanPath = join(parent, 'lock-init-plan.json')
    const removePlanPath = join(parent, 'lock-remove-plan.json')
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', initPlanPath,
      ], io())).resolves.toBe(0)
      const initPlan = JSON.parse(await readFile(initPlanPath, 'utf8')) as {
        readonly desiredArtifacts: readonly { readonly path: string }[]
      }
      expect(initPlan.desiredArtifacts.map(({ path }) => path)).toContain('.agent-policy/policy.lock.json')
      await expect(runCli(['apply', initPlanPath, '--yes'], io())).resolves.toBe(0)

      const lock = await loadPolicyLock(root)
      expect(lock).toMatchObject({
        schemaVersion: 'v1',
        toolkitVersion: '0.1.0-alpha.0',
        adapterKnowledgeVersion: 'codex-2026-08-12',
      })
      expect(Object.keys(lock?.managedArtifactHashes ?? {})).toEqual([
        '.agents/skills/react/SKILL.md',
        'AGENTS.md',
      ])
      const check = io()
      await expect(runCli(['check'], check)).resolves.toBe(0)

      await expect(runCli([
        'remove', '--target', 'codex', '--plan', removePlanPath,
      ], io())).resolves.toBe(0)
      const removePlan = JSON.parse(await readFile(removePlanPath, 'utf8')) as {
        readonly removals: readonly string[]
      }
      expect(removePlan.removals).toContain('.agent-policy/policy.lock.json')
      await expect(runCli(['apply', removePlanPath, '--yes'], io())).resolves.toBe(0)
      expect(await exists(join(root, '.agent-policy/policy.lock.json'))).toBe(false)
      expect(await exists(join(root, '.agent-policy/policy.yaml'))).toBe(true)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('offers regeneration for interactive apply drift and writes only a new external plan', async () => {
    const { parent, root } = await consumer()
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      (await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).replace('targets: []', 'targets: [codex]'),
    )
    const initPlanPath = join(parent, 'drift-init-plan.json')
    const regeneratePlanPath = `${initPlanPath}.regenerated.json`
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', initPlanPath,
      ], io())).resolves.toBe(0)
      await expect(runCli(['apply', initPlanPath, '--yes'], io())).resolves.toBe(0)
      await writeFile(join(root, 'AGENTS.md'), 'manual replacement\n')
      const applied = io(false, async () => 'regenerate')
      await expect(runCli(['apply', initPlanPath, '--yes'], applied)).resolves.toBe(1)
      expect(applied.stdout).toContain(regeneratePlanPath)
      expect(await exists(regeneratePlanPath)).toBe(true)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe('manual replacement\n')
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('keeps planning drift unresolved until an explicit regeneration choice', async () => {
    const { parent, root } = await consumer()
    const initialPlanPath = join(parent, 'planning-drift-initial.json')
    const driftPlanPath = join(parent, 'planning-drift.json')
    const regeneratedPath = `${driftPlanPath}.regenerated.json`
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', initialPlanPath,
      ], io())).resolves.toBe(0)
      await expect(runCli(['apply', initialPlanPath, '--yes'], io())).resolves.toBe(0)
      await writeFile(join(root, '.agents/skills/react/SKILL.md'), 'manual skill edit\n')

      const unresolved = io()
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', driftPlanPath,
      ], unresolved)).resolves.toBe(1)
      expect(unresolved.stderr).toMatch(/drift|reconcile/i)
      expect(await exists(driftPlanPath)).toBe(false)

      const regenerated = io()
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', driftPlanPath,
        '--reconcile', 'regenerate',
      ], regenerated)).resolves.toBe(1)
      expect(regenerated.stdout).toContain(regeneratedPath)
      expect(await exists(regeneratedPath)).toBe(true)
      expect(await readFile(join(root, '.agents/skills/react/SKILL.md'), 'utf8')).toBe('manual skill edit\n')
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('regenerates from current canonical sources when apply sees source drift', async () => {
    const { parent, root } = await consumer()
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      (await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).replace('targets: []', 'targets: [codex]'),
    )
    const planPath = join(parent, 'source-drift-plan.json')
    const regeneratedPath = `${planPath}.regenerated.json`
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', planPath,
      ], io())).resolves.toBe(0)
      await writeFile(
        join(root, '.agent-policy/policy.yaml'),
        (await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).replace('bundles: [react]', 'bundles: []'),
      )

      const applied = io(false)
      await expect(runCli([
        'apply', planPath, '--yes', '--reconcile', 'regenerate',
      ], applied)).resolves.toBe(1)
      expect(applied.stdout).toContain(regeneratedPath)
      expect(await exists(regeneratedPath)).toBe(true)
      expect(await exists(join(root, 'AGENTS.md'))).toBe(false)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('removes a stale owned Codex skill after the bundle leaves the manifest', async () => {
    const { parent, root } = await consumer()
    const initPlanPath = join(parent, 'stale-init-plan.json')
    const removePlanPath = join(parent, 'stale-remove-plan.json')
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', initPlanPath,
      ], io())).resolves.toBe(0)
      await expect(runCli(['apply', initPlanPath, '--yes'], io())).resolves.toBe(0)
      await writeFile(
        join(root, '.agent-policy/policy.yaml'),
        [
          'schemaVersion: v1',
          'toolkitVersion: 0.1.0-alpha.0',
          'bundles: []',
          'targets: [codex]',
          'overlays: [overlays/react.yaml]',
          '',
        ].join('\n'),
      )
      await expect(runCli([
        'remove', '--target', 'codex', '--plan', removePlanPath,
      ], io())).resolves.toBe(0)
      const removePlan = JSON.parse(await readFile(removePlanPath, 'utf8')) as {
        readonly removals: readonly string[]
      }
      expect(removePlan.removals).toContain('.agents/skills/react/SKILL.md')
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('recognizes and safely removes a CRLF generated skill with a valid self-hash', async () => {
    const { parent, root } = await consumer()
    const initPlanPath = join(parent, 'crlf-init-plan.json')
    const removePlanPath = join(parent, 'crlf-remove-plan.json')
    const skillPath = join(root, '.agents/skills/react/SKILL.md')
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init', '--target', 'codex', '--bundles', 'core,react', '--plan', initPlanPath,
      ], io())).resolves.toBe(0)
      await expect(runCli(['apply', initPlanPath, '--yes'], io())).resolves.toBe(0)
      const skill = await readFile(skillPath, 'utf8')
      await writeFile(skillPath, skill.replace(/\n/g, '\r\n'))

      await expect(runCli(['check'], io())).resolves.toBe(0)

      await expect(runCli([
        'remove', '--target', 'codex', '--plan', removePlanPath,
      ], io())).resolves.toBe(0)
      const removePlan = JSON.parse(await readFile(removePlanPath, 'utf8')) as {
        readonly removals: readonly string[]
      }
      expect(removePlan.removals).toContain('.agents/skills/react/SKILL.md')
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })
})
