import { access, constants, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli, type CliIo } from '../../src/cli/main.js'
import { parseYamlDocument } from '../../src/schema/frontmatter.js'

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
  it('projects selected Repository Invariants in order and supports an empty selection', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-invariants-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'invariants-plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: []\ntargets: [codex]\n',
    )
    await writeFile(
      join(root, '.agent-policy/invariants.yaml'),
      [
        'rules:',
        '  - id: repository.package-manager',
        '    instruction: Use pnpm for repository commands.',
        '  - id: repository.review-diff',
        '    instruction: Review the complete diff before committing.',
        '',
      ].join('\n'),
    )

    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core',
        '--plan', planPath,
      ], realIo())).resolves.toBe(0)
      const initialPlan = JSON.parse(await readFile(planPath, 'utf8')) as { sourceHashes: Record<string, string> }
      expect(initialPlan.sourceHashes['.agent-policy/invariants.yaml']).toMatch(/^[0-9a-f]{64}$/)
      await expect(runCli(['apply', planPath, '--yes'], realIo())).resolves.toBe(0)

      const agents = await readFile(join(root, 'AGENTS.md'), 'utf8')
      expect(agents.indexOf('Use pnpm for repository commands.')).toBeGreaterThanOrEqual(0)
      expect(agents.indexOf('Review the complete diff before committing.')).toBeGreaterThan(
        agents.indexOf('Use pnpm for repository commands.'),
      )

      await writeFile(join(root, '.agent-policy/invariants.yaml'), 'rules: []\n')
      const emptyPlanPath = join(parent, 'empty-invariants-plan.json')
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core',
        '--plan', emptyPlanPath,
      ], realIo())).resolves.toBe(0)
      await expect(runCli(['apply', emptyPlanPath, '--yes'], realIo())).resolves.toBe(0)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).not.toContain('Use pnpm for repository commands.')
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).not.toContain('Review the complete diff before committing.')
    } finally {
      process.chdir(previousCwd)
    }
  })

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

      await writeFile(join(root, 'AGENTS.md'), 'externally created\n')
      const artifactDriftDiff = realIo(root)
      await expect(runCli(['diff', planPath], artifactDriftDiff)).resolves.toBe(1)
      expect(artifactDriftDiff.stdout).toContain(`! ${join(process.cwd(), 'AGENTS.md')}`)
      await rm(join(root, 'AGENTS.md'))

      await writeFile(
        join(root, '.agent-policy/policy.yaml'),
        [
          'schemaVersion: v1',
          'toolkitVersion: 0.1.0-alpha.0',
          'bundles: [typescript]',
          'targets: [codex]',
          '# changed after review',
          '',
        ].join('\n'),
      )
      const driftDiff = realIo(root)
      await expect(runCli(['diff', planPath], driftDiff)).resolves.toBe(1)
      expect(driftDiff.stdout).toContain('Drift:')
      expect(driftDiff.stdout).toContain(`! ${join(process.cwd(), '.agent-policy/policy.yaml')}`)
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

  it('persists an explicit Bundle Selection in the reviewed source and check output', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-selection-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'selection-plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: [typescript]\ntargets: [codex]\n',
    )
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      const init = realIo(root)
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,react',
        '--plan', planPath,
      ], init)).resolves.toBe(0)
      expect(await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).toContain('bundles: [typescript]')
      const savedPlan = JSON.parse(await readFile(planPath, 'utf8')) as {
        readonly sourceChanges?: readonly { readonly path: string; readonly content: string }[]
      }
      expect(savedPlan.sourceChanges).toEqual([
        expect.objectContaining({ path: '.agent-policy/policy.yaml' }),
      ])
      expect(parseYamlDocument(savedPlan.sourceChanges?.[0]?.content ?? '', '.agent-policy/policy.yaml')).toMatchObject({
        bundles: ['react'],
      })

      await expect(runCli(['apply', planPath, '--yes'], realIo(root))).resolves.toBe(0)
      expect(parseYamlDocument(
        await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8'),
        '.agent-policy/policy.yaml',
      )).toMatchObject({ bundles: ['react'] })
      await expect(runCli(['check'], realIo(root))).resolves.toBe(0)
      expect(await exists(join(root, '.agents/skills/react/SKILL.md'))).toBe(true)
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(false)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it.each([
    [
      'block sequence with a comment',
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: # select carefully\n  - typescript\n  # keep this note\n  - react\ntargets: [codex]\n',
      '# select carefully',
    ],
    [
      'multiline flow sequence',
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: [\n  typescript,\n  react,\n]\ntargets: [codex]\n',
      undefined,
    ],
    [
      'quoted bundles key',
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\n"bundles": [typescript, react]\ntargets: [codex]\n',
      undefined,
    ],
  ])('updates an explicit selection in valid YAML for %s', async (_form, policySource, preservedComment) => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-yaml-selection-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'selection-plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(join(root, '.agent-policy/policy.yaml'), policySource)
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,react',
        '--plan', planPath,
      ], realIo(root))).resolves.toBe(0)
      expect(await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')).toBe(policySource)

      await expect(runCli(['apply', planPath, '--yes'], realIo(root))).resolves.toBe(0)
      const appliedSource = await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')
      const parsed = parseYamlDocument(appliedSource, '.agent-policy/policy.yaml') as {
        readonly bundles: readonly string[]
      }
      expect(parsed.bundles).toEqual(['react'])
      expect(appliedSource).toContain('targets: [codex]')
      if (preservedComment !== undefined) expect(appliedSource).toContain(preservedComment)
      await expect(runCli(['check'], realIo(root))).resolves.toBe(0)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('preserves CRLF line endings when replacing a block Bundle Selection', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-crlf-selection-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'selection-plan.json')
    const policySource = [
      'schemaVersion: v1',
      'toolkitVersion: 0.1.0-alpha.0',
      'bundles: # keep this comment',
      '  - typescript',
      '  - react',
      'targets: [codex]',
      '',
    ].join('\r\n')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(join(root, '.agent-policy/policy.yaml'), policySource)
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,react',
        '--plan', planPath,
      ], realIo(root))).resolves.toBe(0)
      await expect(runCli(['apply', planPath, '--yes'], realIo(root))).resolves.toBe(0)
      const appliedSource = await readFile(join(root, '.agent-policy/policy.yaml'), 'utf8')
      expect(appliedSource.endsWith('\r\n')).toBe(true)
      expect(appliedSource.replace(/\r\n/g, '')).not.toContain('\n')
      expect(appliedSource).toContain('# keep this comment')
      expect(parseYamlDocument(appliedSource, '.agent-policy/policy.yaml')).toMatchObject({
        bundles: ['react'],
      })
      await expect(runCli(['check'], realIo(root))).resolves.toBe(0)
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('prints complete unchanged policy text in a generated diff', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-full-diff-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: []\ntargets: [codex]\n',
    )
    await writeFile(join(root, 'AGENTS.md'), '# Existing team instructions\n')
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core',
        '--plan', planPath,
      ], realIo(root))).resolves.toBe(0)
      const diff = realIo(root)
      await expect(runCli(['diff', planPath], diff)).resolves.toBe(0)
      expect(diff.stdout).toContain('# Existing team instructions')
      expect(diff.stdout).toContain('Implement the explicit task without speculative scope expansion.')
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('rejects relative, in-worktree, and symlinked plan paths for diff and apply', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-plan-paths-'))
    const root = join(parent, 'consumer')
    const planPath = join(parent, 'plan.json')
    await mkdir(join(root, '.agent-policy'), { recursive: true })
    await writeFile(
      join(root, '.agent-policy/policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: []\ntargets: [codex]\n',
    )
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core',
        '--plan', planPath,
      ], realIo(root))).resolves.toBe(0)
      const relativePlan = '../plan.json'
      await expect(runCli(['diff', relativePlan], realIo(root))).resolves.toBe(2)
      await expect(runCli(['apply', relativePlan, '--yes'], realIo(root))).resolves.toBe(2)

      const inWorktreePlan = join(root, 'inside-plan.json')
      await cp(planPath, inWorktreePlan)
      await expect(runCli(['diff', inWorktreePlan], realIo(root))).resolves.toBe(1)
      await expect(runCli(['apply', inWorktreePlan, '--yes'], realIo(root))).resolves.toBe(1)

      const symlinkedPlan = join(parent, 'symlinked-plan.json')
      await symlink(planPath, symlinkedPlan)
      await expect(runCli(['diff', symlinkedPlan], realIo(root))).resolves.toBe(1)
      await expect(runCli(['apply', symlinkedPlan, '--yes'], realIo(root))).resolves.toBe(1)
    } finally {
      process.chdir(previousCwd)
    }
  })
})
