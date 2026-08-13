import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { codexAdapter } from '../../src/adapters/codex/project.js'
import {
  MANAGED_REGION_END,
  MANAGED_REGION_START,
  removeManagedRegion,
} from '../../src/adapters/codex/managed-region.js'
import type { Bundle, Rule } from '../../src/domain/policy.js'
import { resolvePolicy } from '../../src/compiler/resolve-policy.js'

const rules = [
  {
    id: 'core.focus',
    status: 'active',
    strength: 'required',
    applicability: {},
    override: 'forbidden',
    enforcement: 'prompt',
    aliases: [],
    instruction: 'Stay focused on the requested task.',
    rationale: 'Focus prevents unrelated changes.',
    verification: 'Inspect the final change set.',
  },
  {
    id: 'typescript.safety',
    status: 'active',
    strength: 'required',
    applicability: { technologies: ['typescript'] },
    override: 'project-overlay',
    enforcement: 'prompt',
    aliases: [],
    instruction: 'Preserve type safety.',
    rationale: 'Unsafe types hide contract errors.',
    exceptions: 'Generated declarations may follow their generator.',
    verification: 'Run the type checker.',
  },
] satisfies readonly Rule[]

const bundles = new Map<string, Bundle>([
  ['core', {
    id: 'core',
    description: 'Compact always-on policy.',
    members: ['core.focus'],
    applicability: {},
    dependencies: [],
  }],
  ['typescript', {
    id: 'typescript',
    description: 'TypeScript type-safety decisions.',
    members: ['typescript.safety'],
    applicability: {
      technologies: ['typescript'],
      filePatterns: ['**/*.ts', '**/*.tsx'],
      taskIntents: ['type-change', 'api-design'],
      exclusions: ['javascript-only', 'documentation-only'],
    },
    dependencies: ['core'],
  }],
])

const resolvedPolicy = resolvePolicy(
  { rules, bundles },
  {
    schemaVersion: 'v1',
    toolkitVersion: '0.1.0-alpha.1',
    bundles: ['typescript'],
    targets: ['codex'],
  },
)

function projectionInput(existingArtifacts: ReadonlyMap<string, string> = new Map()) {
  return {
    toolkitVersion: '0.1.0-alpha.1',
    canonicalSourceHash: '0123456789abcdef',
    resolvedPolicy,
    bundles,
    existingArtifacts,
    repositoryInvariants: ['Use pnpm for repository commands.'],
    scopedProfiles: [{
      id: 'web-app',
      bundleIds: ['typescript'],
      paths: ['apps/web/**'],
      workspaces: ['@example/web'],
    }],
  } as const
}

describe('Codex adapter contract', () => {
  it.each([
    ['non-final-newline', '# Existing instructions'],
    ['newline-only', '\n'],
  ])('removes a projected Managed Region and restores %s AGENTS.md bytes', async (_case, existing) => {
    const [agents] = await codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', existing]])),
    )

    expect(agents).toBeDefined()
    expect(removeManagedRegion(agents?.content ?? '')).toBe(existing)
  })

  it('preserves the unmanaged final newline around a single-boundary Managed Region', () => {
    const existing = `# Existing\n${MANAGED_REGION_START}\npolicy\n${MANAGED_REGION_END}\n`

    expect(removeManagedRegion(existing)).toBe('# Existing\n')
  })

  it('projects a bounded root region in memory while preserving unmanaged bytes', async () => {
    const existing = await readFile(
      new URL('../fixtures/repositories/codex-existing/AGENTS.md', import.meta.url),
      'utf8',
    )
    const artifacts = await codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', existing]])),
    )

    expect(await readFile(
      new URL('../fixtures/repositories/codex-existing/AGENTS.md', import.meta.url),
      'utf8',
    )).toBe(existing)
    const agents = artifacts.find(({ path }) => path === 'AGENTS.md')
    expect(agents).toBeDefined()
    expect(agents?.content.startsWith(existing)).toBe(true)
    expect(agents?.content.slice(0, existing.length)).toBe(existing)
    expect(agents?.content.match(/<!-- agent-policy:start owner=@agent-policy\/agent-policy-toolkit -->/g)).toHaveLength(1)
    expect(agents?.content.match(/<!-- agent-policy:end -->/g)).toHaveLength(1)
    expect(agents?.operation).toBe('managed-region')
  })

  it('projects domain guidance as root-discoverable ordinary skills with semantic boundaries', async () => {
    const artifacts = await codexAdapter.project(projectionInput())

    expect(codexAdapter.capabilities).toMatchObject({
      harness: 'codex',
      adapterKnowledgeVersion: 'codex-2026-08-12',
      instructionDiscovery: ['AGENTS.md'],
      skillDiscovery: ['.agents/skills/*/SKILL.md'],
    })
    expect(artifacts.map(({ path }) => path)).toEqual([
      'AGENTS.md',
      '.agents/skills/typescript/SKILL.md',
    ])
    const agents = artifacts[0]!
    const skill = artifacts[1]!

    expect(skill.operation).toBe('replace')
    expect(skill).not.toHaveProperty('linkTarget')
    expect(skill.content).toContain('name: typescript')
    expect(skill.content).toContain('TypeScript type-safety decisions.')
    expect(skill.content).toContain('type-change')
    expect(skill.content).toContain('Do not use for javascript-only, documentation-only.')
    expect(skill.content).toContain('Requires the core policy bundle.')
    expect(skill.content).toContain('Scoped profile web-app applies to paths apps/web/** and workspaces @example/web.')
    expect(skill.content).toContain('Toolkit version: 0.1.0-alpha.1')
    expect(skill.content).toContain('Adapter knowledge version: codex-2026-08-12')
    expect(skill.content).toContain('Canonical source hash: 0123456789abcdef')
    expect(skill.content).toContain('Do not edit; change `.agent-policy/` and regenerate.')
    expect(skill.content).toContain('Preserve type safety.')
    expect(skill.content).toContain('Unsafe types hide contract errors.')

    expect(agents.content).toContain('Stay focused on the requested task.')
    expect(agents.content).toContain('Use pnpm for repository commands.')
    expect(agents.content).toContain('Capability routing')
    expect(agents.content).not.toContain('Preserve type safety.')
    expect(agents.content).not.toContain('Unsafe types hide contract errors.')
    expect(agents.content).not.toContain('Run the type checker.')
    expect(agents.content).not.toContain('Migration Provenance')
    expect(agents.content).not.toContain('workflow')
    expect(agents.content).not.toContain('role body')
  })

  it.each([
    ['duplicate', '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->\na\n<!-- agent-policy:end -->\n<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->\nb\n<!-- agent-policy:end -->'],
    ['nested', '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->\n<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->\n<!-- agent-policy:end -->\n<!-- agent-policy:end -->'],
    ['unmatched start', '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->'],
    ['unmatched end', '<!-- agent-policy:end -->'],
    ['foreign owner', '<!-- agent-policy:start owner=@another/toolkit -->\n<!-- agent-policy:end -->'],
    ['truncated start', '<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit'],
    ['malformed end', '<!-- agent-policy:end --'],
    ['startowner sentinel', '<!-- agent-policy:startowner=@agent-policy/agent-policy-toolkit -->'],
  ])('rejects %s Managed Region markers as drift', async (_case, agentsSource) => {
    await expect(codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', agentsSource]])),
    )).rejects.toThrow(/Invalid agent-policy Managed Region/)
  })

  it('is byte-for-byte idempotent when projected from its own virtual output', async () => {
    const first = await codexAdapter.project(projectionInput())
    const current = new Map(first.map(({ path, content }) => [path, content]))
    const second = await codexAdapter.project(projectionInput(current))

    expect(second).toEqual(first)
  })

  it('updates an owned region without changing bytes on either side', async () => {
    const before = '# Before\n\n'
    const after = '\n\n# After\n'
    const existing = `${before}<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->\nold\n<!-- agent-policy:end -->${after}`

    const [agents] = await codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', existing]])),
    )

    expect(agents?.content.startsWith(before)).toBe(true)
    expect(agents?.content.endsWith(after)).toBe(true)
    expect(agents?.content).not.toContain('\nold\n')
  })

  it('matches the deterministic Codex projection snapshot', async () => {
    const existing = await readFile(
      new URL('../fixtures/repositories/codex-existing/AGENTS.md', import.meta.url),
      'utf8',
    )
    const artifacts = await codexAdapter.project(
      projectionInput(new Map([['AGENTS.md', existing]])),
    )
    const rendered = artifacts
      .map(({ path, operation, owner, sha256, content }) => [
        `[${path}]`,
        `operation=${operation}`,
        `owner=${owner}`,
        `sha256=${sha256}`,
        content,
      ].join('\n'))
      .join('\n')

    expect(rendered.trimEnd()).toBe(
      (await readFile(new URL('../snapshots/codex-projection.snap', import.meta.url), 'utf8')).trimEnd(),
    )
  })
})
