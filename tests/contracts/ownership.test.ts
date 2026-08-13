import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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

const owner = '@agent-policy/agent-policy-toolkit'
const toolkitVersion = '0.1.0-alpha.0'
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

const scopedBundles = new Map<string, Bundle>([
  ['core', bundles.get('core')!],
  ['typescript', bundles.get('typescript')!],
  ['react', {
    id: 'react',
    description: 'React policy.',
    members: [],
    applicability: { technologies: ['react'] },
    dependencies: ['core'],
  }],
])

const scopedResolvedPolicy = {
  rules: [],
  bundles: [
    { id: 'core', description: 'Always-on policy.', applicability: {}, rules: [] },
    { id: 'typescript', description: 'TypeScript policy.', applicability: { technologies: ['typescript'] }, rules: [] },
    { id: 'react', description: 'React policy.', applicability: { technologies: ['react'] }, rules: [] },
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

  it('keeps two workspace profiles root-discoverable with explicit path descriptions', async () => {
    const manifest = await readFile(join(scopedFixture, '.agent-policy/policy.yaml'), 'utf8')
    expect(manifest).toContain('profiles:')
    expect(manifest).toContain('paths: [apps/web/**]')
    expect(manifest).toContain('paths: [apps/admin/**]')

    const artifacts = await codexAdapter.project({
      toolkitVersion,
      canonicalSourceHash: 'scoped-profile-source',
      resolvedPolicy: scopedResolvedPolicy,
      bundles: scopedBundles,
      scopedProfiles: [
        {
          id: 'web',
          bundleIds: ['typescript'],
          paths: ['apps/web/**'],
          workspaces: ['@example/web'],
        },
        {
          id: 'admin',
          bundleIds: ['react'],
          paths: ['apps/admin/**'],
          workspaces: ['@example/admin'],
        },
      ],
    })

    expect(artifacts.map(({ path }) => path)).toEqual([
      'AGENTS.md',
      '.agents/skills/typescript/SKILL.md',
      '.agents/skills/react/SKILL.md',
    ])
    const react = artifacts.find(({ path }) => path === '.agents/skills/react/SKILL.md')
    const typescript = artifacts.find(({ path }) => path === '.agents/skills/typescript/SKILL.md')
    expect(react?.content).toContain('Scoped profile admin applies to paths apps/admin/** and workspaces @example/admin.')
    expect(typescript?.content).toContain('Scoped profile web applies to paths apps/web/** and workspaces @example/web.')
    expect(react?.content).not.toContain('apps/web/**')
    expect(typescript?.content).not.toContain('apps/admin/**')

    const paths = artifacts.map(({ path }) => path)
    expect(paths.filter((path) => path === 'AGENTS.md')).toHaveLength(1)
    expect(paths.some((path) => path.endsWith('/AGENTS.md'))).toBe(false)
    expect(paths.some((path) => path.startsWith('apps/'))).toBe(false)
  })
})
