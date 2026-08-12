import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import type { Bundle, ProjectPolicy, Rule } from '../../src/domain/policy.js'
import { renderBundle } from '../../src/compiler/render-bundle.js'
import { renderRule } from '../../src/compiler/render-rule.js'
import { resolvePolicy } from '../../src/compiler/resolve-policy.js'

const rules = [
  {
    id: 'shared.rule',
    status: 'active',
    strength: 'required',
    applicability: { domains: ['shared'] },
    override: 'project-overlay-or-explicit-task',
    enforcement: 'prompt',
    aliases: ['RULE_SHARED'],
    title: 'Shared rule',
    instruction: 'Use the canonical instruction.',
    rationale: 'The canonical rationale explains the risk.',
    exceptions: 'Exception text stays verbatim.',
    examples: 'Example text stays verbatim.',
    verification: 'Verify the observable result.',
    sections: [
      { title: 'Instruction', source: '\nUse the canonical instruction.\n' },
      { title: 'Rationale', source: '\nThe canonical rationale explains the risk.\n' },
      { title: 'Exceptions', source: '\nException text stays verbatim.\n' },
      { title: 'Examples', source: '\nExample text stays verbatim.\n' },
      { title: 'Verification', source: '\nVerify the observable result.\n' },
      { title: 'Operational notes', source: '\nThis canonical section is maintainer-only.\n' },
    ],
  },
  {
    id: 'feature.rule',
    status: 'active',
    strength: 'recommended',
    applicability: { domains: ['feature'] },
    override: 'explicit-task',
    enforcement: 'prompt',
    aliases: [],
    title: 'Feature rule',
    instruction: 'Keep the feature behavior explicit.',
    rationale: 'Explicit behavior avoids accidental coupling.',
    verification: 'Exercise the changed behavior.',
  },
] satisfies readonly (Rule & { readonly sections: readonly { readonly title: string; readonly source: string }[] })[]

const bundles = new Map<string, Bundle>([
  ['feature', {
    id: 'feature',
    description: 'Feature guidance.',
    members: ['RULE_SHARED', 'feature.rule'],
    applicability: { technologies: ['typescript'] },
    dependencies: ['base'],
  }],
  ['base', {
    id: 'base',
    description: 'Base guidance.',
    members: ['shared.rule'],
    applicability: {},
    dependencies: [],
  }],
])

const project = {
  schemaVersion: 'v1',
  toolkitVersion: '0.1.0-alpha.0',
  bundles: ['feature'],
  targets: ['codex'],
  overlays: [{
    path: '.agent-policy/overlays/shared.yaml',
    ruleId: 'RULE_SHARED',
    operation: 'addendum',
    reason: 'Repository convention.',
    content: 'Use the repository helper where it exists.',
  }],
} satisfies ProjectPolicy & { readonly overlays: readonly { readonly path: string; readonly ruleId: string; readonly operation: 'addendum'; readonly reason: string; readonly content: string }[] }

describe('policy compiler', () => {
  it('resolves aliases before ordered overlays and expands dependencies without duplicating members', () => {
    const resolved = resolvePolicy({ rules, bundles }, project)

    expect(resolved.diagnostics).toEqual([])
    expect(resolved.bundles.map(({ id }) => id)).toEqual(['base', 'feature'])
    expect(resolved.rules.map(({ id }) => id)).toEqual(['shared.rule', 'feature.rule'])
    expect(resolved.rules[0]).toMatchObject({
      canonicalId: 'shared.rule',
      addenda: ['Use the repository helper where it exists.'],
      provenance: [{
        path: '.agent-policy/overlays/shared.yaml',
        target: 'RULE_SHARED',
        canonicalId: 'shared.rule',
        operation: 'addendum',
      }],
      scopes: [
        { bundleId: 'base', applicability: {} },
        { bundleId: 'feature', applicability: { technologies: ['typescript'] } },
      ],
    })
    expect(resolved.bundles[1]?.rules.map(({ id }) => id)).toEqual(['shared.rule', 'feature.rule'])
  })

  it('preserves manifest order even when bundle storage order differs', () => {
    const resolved = resolvePolicy({ rules, bundles }, {
      ...project,
      bundles: ['feature', 'base'],
      overlays: [],
    })

    expect(resolved.bundles.map(({ id }) => id)).toEqual(['base', 'feature'])
    expect(resolved.bundles[1]?.rules.map(({ id }) => id)).toEqual(['shared.rule', 'feature.rule'])
  })

  it('includes the declared always-on core bundle before project-selected bundles', () => {
    const catalogBundles = new Map(bundles)
    catalogBundles.set('core', {
      id: 'core',
      description: 'Always-on guidance.',
      members: ['shared.rule'],
      applicability: {},
      dependencies: [],
    })

    const resolved = resolvePolicy({ rules, bundles: catalogBundles }, { ...project, overlays: [] })

    expect(resolved.bundles.map(({ id }) => id)).toEqual(['core', 'base', 'feature'])
  })

  it('selects only the profile sections and preserves their canonical text', async () => {
    const resolved = resolvePolicy({ rules, bundles }, project)
    const shared = resolved.rules[0]!
    const rendered = [
      '[core]',
      renderRule(shared, 'core'),
      '[domain-skill]',
      renderRule(shared, 'domain-skill'),
      '[code-review]',
      renderRule(shared, 'code-review'),
      '[maintainer]',
      renderRule(shared, 'maintainer'),
      '[bundle]',
      renderBundle(bundles.get('feature')!, resolved, 'domain-skill'),
    ].join('\n\n')

    expect(rendered).toBe((await readFile(new URL('../snapshots/render-profiles.snap', import.meta.url), 'utf8')).trimEnd())
    expect(renderRule(shared, 'core')).not.toContain('The canonical rationale')
    expect(renderRule(shared, 'code-review')).not.toContain('Exception text')
    expect(renderRule(shared, 'maintainer')).toContain('Example text stays verbatim.')
    expect(renderRule(shared, 'maintainer')).toContain('This canonical section is maintainer-only.')
    expect(rendered).toContain('Use the repository helper where it exists.')
  })
})
