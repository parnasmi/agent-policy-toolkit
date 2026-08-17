import { access, constants, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli, type CliIo } from '../../src/cli/main.js'

const start = '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->'
const end = '<!-- agent-policy:end -->'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function io(confirm = false): CliIo {
  return {
    stdout: '',
    stderr: '',
    confirm: async () => confirm,
    fs: {
      readFile: async (path) => readFile(path, 'utf8'),
      writeFile: async (path, contents) => writeFile(path, contents),
      exists,
    },
  }
}

async function consumer(): Promise<{ readonly parent: string; readonly root: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'agent-policy-marker-quoting-'))
  const root = join(parent, 'consumer')
  await mkdir(join(root, '.agent-policy'), { recursive: true })
  await writeFile(
    join(root, '.agent-policy/policy.yaml'),
    [
      'schemaVersion: v1',
      'toolkitVersion: 0.1.0-alpha.3',
      'bundles: [typescript]',
      'targets: [codex]',
      '',
    ].join('\n'),
  )
  await writeFile(join(root, 'package.json'), '{"name":"consumer"}\n')
  return { parent, root }
}

const quotingDoc = [
  '# How the managed region works',
  '',
  'The CLI owns only this bounded region:',
  '',
  '```md',
  start,
  '...',
  end,
  '```',
  '',
].join('\n')

async function install(root: string, parent: string, bundles = 'core,typescript'): Promise<void> {
  const planPath = join(parent, 'init-plan.json')
  await runCli(['init', '--target', 'codex', '--bundles', bundles, '--plan', planPath], io())
  await runCli(['apply', planPath, '--yes'], io())
}

describe('marker-quoting documentation is never treated as toolkit-owned', () => {
  it('ignores a Markdown document that quotes the exact marker pair in check and generated removal', async () => {
    const { parent, root } = await consumer()
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await install(root, parent)
      await mkdir(join(root, 'docs'), { recursive: true })
      await writeFile(join(root, 'docs/quoting.md'), quotingDoc)

      const check = io()
      await expect(runCli(['check'], check)).resolves.toBe(0)

      const removePlanPath = join(parent, 'remove-generated-plan.json')
      await expect(runCli(['remove', '--generated', '--plan', removePlanPath], io())).resolves.toBe(0)
      const plan = JSON.parse(await readFile(removePlanPath, 'utf8')) as {
        readonly desiredArtifacts: readonly { readonly path: string }[]
        readonly removals: readonly string[]
      }
      const allPaths = [...plan.desiredArtifacts.map(({ path }) => path), ...plan.removals]
      expect(allPaths).not.toContain('docs/quoting.md')
      expect(allPaths).toContain('AGENTS.md')
      expect(allPaths).toContain('.agents/skills/typescript/SKILL.md')

      await expect(runCli(['apply', removePlanPath, '--yes'], io())).resolves.toBe(0)
      expect(await readFile(join(root, 'docs/quoting.md'), 'utf8')).toBe(quotingDoc)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('still detects a real managed AGENTS.md region', async () => {
    const { parent, root } = await consumer()
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await install(root, parent)
      const agentsPath = join(root, 'AGENTS.md')
      const agents = await readFile(agentsPath, 'utf8')
      await writeFile(agentsPath, agents.replace('## Core policy', '## Human edit inside managed policy'))

      const check = io()
      await expect(runCli(['check'], check)).resolves.toBe(1)
      expect(check.stdout).toMatch(/AGENTS|Core policy|drift|changed/i)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('still detects stale owned generated artifacts after their bundle leaves the manifest', async () => {
    const { parent, root } = await consumer()
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await install(root, parent)
      const policyPath = join(root, '.agent-policy/policy.yaml')
      await writeFile(policyPath, [
        'schemaVersion: v1',
        'toolkitVersion: 0.1.0-alpha.3',
        'bundles: []',
        'targets: [codex]',
        '',
      ].join('\n'))

      const check = io()
      await expect(runCli(['check'], check)).resolves.toBe(1)
      expect(check.stdout).toMatch(/Unexpected generated artifacts/)
      expect(check.stdout).toContain('.agents/skills/typescript/SKILL.md')
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('remove --generated still removes owned projections while preserving a quoting doc and a foreign file', async () => {
    const { parent, root } = await consumer()
    const previousCwd = process.cwd()
    process.chdir(root)
    try {
      await install(root, parent)
      const quotingPath = join(root, 'docs', 'quoting.md')
      await mkdir(join(root, 'docs'), { recursive: true })
      await writeFile(quotingPath, quotingDoc)
      const foreignPath = join(root, '.agents/skills/foreign/SKILL.md')
      await mkdir(join(root, '.agents/skills/foreign'), { recursive: true })
      const foreign = '<!--\nGenerated by @foreign/policy-toolkit.\n-->\nForeign guidance.\n'
      await writeFile(foreignPath, foreign)

      const removePlanPath = join(parent, 'remove-generated-plan.json')
      await expect(runCli(['remove', '--generated', '--plan', removePlanPath], io())).resolves.toBe(0)
      await expect(runCli(['apply', removePlanPath, '--yes'], io())).resolves.toBe(0)

      expect(await readFile(quotingPath, 'utf8')).toBe(quotingDoc)
      expect(await readFile(foreignPath, 'utf8')).toBe(foreign)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).not.toContain(start)
      expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).not.toContain(end)
      expect(await exists(join(root, '.agents/skills/typescript/SKILL.md'))).toBe(false)
      expect(await exists(join(root, '.agent-policy/policy.lock.json'))).toBe(false)
    } finally {
      process.chdir(previousCwd)
      await rm(parent, { recursive: true, force: true })
    }
  })
})
