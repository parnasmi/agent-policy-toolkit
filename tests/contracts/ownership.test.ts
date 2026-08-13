import { createHash } from 'node:crypto'
import { access, constants, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { codexAdapter } from '../../src/adapters/codex/project.js'
import type { Bundle } from '../../src/domain/policy.js'
import type { ResolvedPolicy } from '../../src/compiler/resolve-policy.js'
import type { VirtualArtifact } from '../../src/domain/artifacts.js'
import { applyPlan } from '../../src/applier/apply-plan.js'
import { createChangePlan } from '../../src/planner/create-plan.js'
import { runCli, type CliIo } from '../../src/cli/main.js'

const owner = '@agent-policy/agent-policy-toolkit'
const toolkitVersion = '0.1.0-alpha.1'
const start = `<!-- agent-policy:start owner=${owner} -->`
const end = '<!-- agent-policy:end -->'
const fixture = fileURLToPath(new URL('../fixtures/repositories/unmanaged-agents', import.meta.url))
const scopedFixture = fileURLToPath(new URL('../fixtures/repositories/scoped-profile', import.meta.url))

function hash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function artifact(
  path: string,
  content: string,
  operation: VirtualArtifact['operation'],
): VirtualArtifact {
  return { path, content, sha256: hash(content), owner, operation }
}

const bundles = new Map<string, Bundle>([
  ['core', {
    id: 'core',
    description: 'Always-on policy.',
    members: [],
    applicability: {},
    dependencies: [],
  }],
  ['typescript', {
    id: 'typescript',
    description: 'TypeScript policy.',
    members: [],
    applicability: { technologies: ['typescript'] },
    dependencies: ['core'],
  }],
])

const resolvedPolicy = {
  rules: [],
  bundles: [
    { id: 'core', description: 'Always-on policy.', applicability: {}, rules: [] },
    { id: 'typescript', description: 'TypeScript policy.', applicability: { technologies: ['typescript'] }, rules: [] },
  ],
  diagnostics: [],
} satisfies ResolvedPolicy

function projectionInput(existingArtifacts: ReadonlyMap<string, string>) {
  return {
    toolkitVersion,
    canonicalSourceHash: 'source-hash',
    resolvedPolicy,
    bundles,
    existingArtifacts,
  } as const
}

async function copiedFixture(): Promise<{ readonly parent: string; readonly root: string }> {
  const parent = await mkdtemp(join(tmpdir(), 'agent-policy-ownership-contract-'))
  const root = join(parent, 'consumer')
  await cp(fixture, root, { recursive: true })
  return { parent, root }
}

function realIo(): CliIo {
  return {
    stdout: '',
    stderr: '',
    confirm: async () => false,
    fs: {
      readFile: async (path) => readFile(path, 'utf8'),
      writeFile: async (path, contents) => writeFile(path, contents),
      exists: async (path) => access(path, constants.F_OK).then(() => true).catch(() => false),
    },
  }
}

async function withWorkingDirectory<T>(root: string, action: () => Promise<T>): Promise<T> {
  const previous = process.cwd()
  process.chdir(root)
  try {
    return await action()
  } finally {
    process.chdir(previous)
  }
}

describe('ownership and unmanaged-content contracts', () => {
  it('updates and removes only the owned region while preserving surrounding fixture bytes', async () => {
    const { parent, root } = await copiedFixture()
    const existing = await readFile(join(root, 'AGENTS.md'), 'utf8')
    const before = existing.slice(0, existing.indexOf(start))
    const after = existing.slice(existing.indexOf(end) + end.length)

    const [projected] = await codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', existing]])),
    )
    if (projected === undefined) throw new Error('Codex adapter did not return AGENTS.md')
    expect(projected.path).toBe('AGENTS.md')
    expect(projected.operation).toBe('managed-region')
    expect(projected.content.slice(0, before.length)).toBe(before)
    expect(projected.content.slice(projected.content.length - after.length)).toBe(after)
    const previousBody = existing.slice(before.length, existing.length - after.length)
    const projectedBody = projected.content.slice(before.length, projected.content.length - after.length)
    expect(projectedBody).not.toBe(previousBody)
    expect(projectedBody).toContain('# Agent Policy')
    expect(projectedBody).toContain('## Capability routing')

    const updatePlan = await createChangePlan({
      command: 'update',
      toolkitVersion,
      repositoryRoot: root,
      planPath: join(parent, 'update-plan.json'),
      desiredArtifacts: [projected],
      createdAt: '2026-08-13T00:00:00.000Z',
    })
    await expect(applyPlan(updatePlan, { repositoryRoot: root, toolkitVersion })).resolves.toMatchObject({ ok: true })

    const removalContent = `${before}${after}`
    const removalPlan = await createChangePlan({
      command: 'remove',
      toolkitVersion,
      repositoryRoot: root,
      planPath: join(parent, 'remove-plan.json'),
      desiredArtifacts: [artifact('AGENTS.md', removalContent, 'managed-region-remove')],
      createdAt: '2026-08-13T00:00:00.000Z',
    })
    await expect(applyPlan(removalPlan, { repositoryRoot: root, toolkitVersion })).resolves.toMatchObject({ ok: true })
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe(removalContent)
  })

  it.each([
    ['duplicate', `${start}\nfirst\n${end}\n${start}\nsecond\n${end}\n`],
    ['foreign owner', '<!-- agent-policy:start owner=@foreign/policy-toolkit -->\nforeign\n<!-- agent-policy:end -->\n'],
  ])('refuses to claim %s Managed Region content', async (_case, content) => {
    const existing = new Map([['AGENTS.md', content]])
    await expect(codexAdapter.project(projectionInput(existing))).rejects.toThrow(/Invalid agent-policy Managed Region/)
  })

  it('refuses an existing foreign-managed generated file without changing its bytes', async () => {
    const { parent, root } = await copiedFixture()
    const foreign = '<!--\nGenerated by @foreign/policy-toolkit.\n-->\nForeign guidance.\n'
    const desired = '<!--\nGenerated by @agent-policy/agent-policy-toolkit.\n-->\nReviewed guidance.\n'
    const path = '.agents/skills/foreign/SKILL.md'
    await mkdir(join(root, '.agents/skills/foreign'), { recursive: true })
    await writeFile(join(root, path), foreign)

    const reviewed = await createChangePlan({
      command: 'update',
      toolkitVersion,
      repositoryRoot: root,
      planPath: join(parent, 'foreign-plan.json'),
      sourcePaths: ['.agent-policy/policy.yaml'],
      desiredArtifacts: [artifact(path, desired, 'replace')],
      createdAt: '2026-08-13T00:00:00.000Z',
    })

    await expect(applyPlan(reviewed, { repositoryRoot: root, toolkitVersion })).resolves.toMatchObject({
      ok: false,
      code: 'ownership-drift',
    })
    expect(await readFile(join(root, path), 'utf8')).toBe(foreign)
  })

  it('loads two workspace profiles through the root manifest and projects them through CLI', async () => {
    const manifest = await readFile(join(scopedFixture, '.agent-policy/policy.yaml'), 'utf8')
    expect(manifest).toContain('profiles:')
    expect(manifest).toContain('paths: [apps/web/**]')
    expect(manifest).toContain('paths: [apps/admin/**]')

    const parent = await mkdtemp(join(tmpdir(), 'agent-policy-scoped-cli-contract-'))
    const root = join(parent, 'consumer')
    await cp(scopedFixture, root, { recursive: true })
    const planPath = join(parent, 'scoped-plan.json')

    await withWorkingDirectory(root, async () => {
      await expect(runCli([
        'init',
        '--target', 'codex',
        '--bundles', 'core,typescript,react',
        '--plan', planPath,
      ], realIo())).resolves.toBe(0)
      await expect(runCli(['apply', planPath, '--yes'], realIo())).resolves.toBe(0)
    })

    const react = await readFile(join(root, '.agents/skills/react/SKILL.md'), 'utf8')
    const typescript = await readFile(join(root, '.agents/skills/typescript/SKILL.md'), 'utf8')
    expect(react).toContain('Scoped profile admin applies to paths apps/admin/** and workspaces @example/admin.')
    expect(typescript).toContain('Scoped profile web applies to paths apps/web/** and workspaces @example/web.')
    expect(react).not.toContain('apps/web/**')
    expect(typescript).not.toContain('apps/admin/**')

    const paths = await readdir(root, { recursive: true })
    expect(paths.filter((path) => path.endsWith('AGENTS.md'))).toEqual(['AGENTS.md'])
  })
})
