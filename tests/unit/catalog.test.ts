import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'

const expectedIds = [
  'async-control-flow.explicit-failure-behavior',
  'async-control-flow.overlap-safety',
  'async-control-flow.user-visible-states',
  'core.architecture-consistency',
  'core.inspect-before-change',
  'core.minimal-change',
  'core.name-stability',
  'core.style-consistency',
  'core.task-fidelity',
  'core.verify-before-completion',
  'data-boundaries.normalize-external-data',
  'data-boundaries.public-contract-stability',
  'data-boundaries.runtime-validation',
  'implementation-design.abstraction-restraint',
  'implementation-design.dependency-restraint',
  'implementation-design.localized-side-effects',
  'implementation-design.reuse-before-creation',
  'implementation-design.simplicity',
  'react.component-responsibility',
  'react.derived-state',
  'react.effect-discipline',
  'react.event-logic',
  'react.hook-safety',
  'react.optimization-restraint',
  'react.unidirectional-data-flow',
  'testing.behavior-over-implementation',
  'testing.change-driven-coverage',
  'typescript.preserve-type-safety',
  'typescript.reuse-source-types',
] as const

const expectedRuleAliases = {
  'async-control-flow.explicit-failure-behavior': ['RULE_ERROR_HANDLING'],
  'async-control-flow.overlap-safety': ['RULE_ASYNC_SAFETY'],
  'async-control-flow.user-visible-states': ['RULE_ASYNC_UI'],
  'core.architecture-consistency': ['RULE_ARCHITECTURE_CONSISTENCY'],
  'core.inspect-before-change': ['RULE_INSPECT_BEFORE_CHANGE', 'RULE_NO_GUESSING', 'RULE_ASSUMPTIONS'],
  'core.minimal-change': ['RULE_MINIMAL_CHANGE', 'RULE_NO_OPPORTUNISTIC_REFACTOR'],
  'core.name-stability': ['RULE_NAME_STABILITY'],
  'core.style-consistency': ['RULE_STYLE_CONSISTENCY'],
  'core.task-fidelity': ['RULE_TASK_FIDELITY'],
  'core.verify-before-completion': ['RULE_VERIFICATION', 'RULE_DIFF_REVIEW'],
  'data-boundaries.normalize-external-data': ['RULE_BOUNDARY_NORMALIZATION'],
  'data-boundaries.public-contract-stability': ['RULE_API_STABILITY'],
  'data-boundaries.runtime-validation': ['RULE_RUNTIME_VALIDATION'],
  'implementation-design.abstraction-restraint': ['RULE_ABSTRACTION_RESTRAINT'],
  'implementation-design.dependency-restraint': ['RULE_DEPENDENCY_RESTRAINT'],
  'implementation-design.localized-side-effects': ['RULE_SIDE_EFFECTS'],
  'implementation-design.reuse-before-creation': ['RULE_REUSE_EXISTING'],
  'implementation-design.simplicity': ['RULE_SIMPLICITY'],
  'react.component-responsibility': ['RULE_COMPONENT_RESPONSIBILITY'],
  'react.derived-state': ['RULE_DERIVED_STATE'],
  'react.effect-discipline': ['RULE_EFFECT_DISCIPLINE'],
  'react.event-logic': ['RULE_EVENT_LOGIC'],
  'react.hook-safety': ['RULE_HOOK_SAFETY'],
  'react.optimization-restraint': ['RULE_REACT_OPTIMIZATION'],
  'react.unidirectional-data-flow': ['RULE_REACT_DATA_FLOW'],
  'testing.behavior-over-implementation': ['RULE_TEST_BEHAVIOR'],
  'testing.change-driven-coverage': ['RULE_TEST_CHANGES'],
  'typescript.preserve-type-safety': ['RULE_TYPE_SAFETY'],
  'typescript.reuse-source-types': ['RULE_TYPE_REUSE'],
} as const

const expectedProvenance = [
  { number: 1, alias: 'RULE_TASK_FIDELITY', destination: 'core.task-fidelity', disposition: 'active-slice-a' },
  { number: 2, alias: 'RULE_MINIMAL_CHANGE', destination: 'core.minimal-change', disposition: 'active-slice-a' },
  { number: 3, alias: 'RULE_NAME_STABILITY', destination: 'core.name-stability', disposition: 'active-slice-a' },
  { number: 4, alias: 'RULE_STYLE_CONSISTENCY', destination: 'core.style-consistency', disposition: 'active-slice-a' },
  { number: 5, alias: 'RULE_INSPECT_BEFORE_CHANGE', destination: 'core.inspect-before-change', disposition: 'active-slice-a' },
  { number: 6, alias: 'RULE_ARCHITECTURE_CONSISTENCY', destination: 'core.architecture-consistency', disposition: 'active-slice-a' },
  { number: 7, alias: 'RULE_REUSE_EXISTING', destination: 'implementation-design.reuse-before-creation', disposition: 'active-slice-a' },
  { number: 8, alias: 'RULE_ABSTRACTION_RESTRAINT', destination: 'implementation-design.abstraction-restraint', disposition: 'active-slice-a' },
  { number: 9, alias: 'RULE_SIMPLICITY', destination: 'implementation-design.simplicity', disposition: 'active-slice-a' },
  { number: 10, alias: 'RULE_TYPE_SAFETY', destination: 'typescript.preserve-type-safety', disposition: 'active-slice-a' },
  { number: 11, alias: 'RULE_TYPE_REUSE', destination: 'typescript.reuse-source-types', disposition: 'active-slice-a' },
  { number: 12, alias: 'RULE_RUNTIME_VALIDATION', destination: 'data-boundaries.runtime-validation', disposition: 'active-slice-a' },
  { number: 13, alias: 'RULE_REACT_DATA_FLOW', destination: 'react.unidirectional-data-flow', disposition: 'active-slice-a' },
  { number: 14, alias: 'RULE_DERIVED_STATE', destination: 'react.derived-state', disposition: 'active-slice-a' },
  { number: 15, alias: 'RULE_EFFECT_DISCIPLINE', destination: 'react.effect-discipline', disposition: 'active-slice-a' },
  { number: 16, alias: 'RULE_REACT_OPTIMIZATION', destination: 'react.optimization-restraint', disposition: 'active-slice-a' },
  { number: 17, alias: 'RULE_COMPONENT_RESPONSIBILITY', destination: 'react.component-responsibility', disposition: 'active-slice-a' },
  { number: 18, alias: 'RULE_HOOK_SAFETY', destination: 'react.hook-safety', disposition: 'active-slice-a' },
  { number: 19, alias: 'RULE_EVENT_LOGIC', destination: 'react.event-logic', disposition: 'active-slice-a' },
  { number: 20, alias: 'RULE_NEXT_BOUNDARIES', destination: 'nextjs.server-client-boundaries', disposition: 'later-slice' },
  { number: 21, alias: 'RULE_SERVER_SECRETS', destination: 'security.server-secrets', disposition: 'later-slice' },
  { number: 22, alias: 'RULE_NEXT_PRIMITIVES', destination: 'nextjs.framework-primitives', disposition: 'later-slice' },
  { number: 23, alias: 'RULE_URL_STATE', destination: 'nextjs.url-state', disposition: 'later-slice' },
  { number: 24, alias: 'RULE_DATA_FETCHING', destination: 'nextjs.data-fetching-boundaries', disposition: 'later-slice' },
  { number: 25, alias: 'RULE_ASYNC_SAFETY', destination: 'async-control-flow.overlap-safety', disposition: 'active-slice-a' },
  { number: 26, alias: 'RULE_ERROR_HANDLING', destination: 'async-control-flow.explicit-failure-behavior', disposition: 'active-slice-a' },
  { number: 27, alias: 'RULE_ASYNC_UI', destination: 'async-control-flow.user-visible-states', disposition: 'active-slice-a' },
  { number: 28, alias: 'RULE_API_STABILITY', destination: 'data-boundaries.public-contract-stability', disposition: 'active-slice-a' },
  { number: 29, alias: 'RULE_BOUNDARY_NORMALIZATION', destination: 'data-boundaries.normalize-external-data', disposition: 'active-slice-a' },
  { number: 30, alias: 'RULE_ACCESSIBILITY', destination: 'accessibility.web-baseline', disposition: 'later-slice' },
  { number: 31, alias: 'RULE_SECURITY_INPUT', destination: 'security.untrusted-input', disposition: 'later-slice' },
  { number: 32, alias: 'RULE_AUTHORIZATION', destination: 'security.authorization-boundary', disposition: 'later-slice' },
  { number: 33, alias: 'RULE_DEPENDENCY_RESTRAINT', destination: 'implementation-design.dependency-restraint', disposition: 'active-slice-a' },
  { number: 34, alias: 'RULE_TEST_BEHAVIOR', destination: 'testing.behavior-over-implementation', disposition: 'active-slice-a' },
  { number: 35, alias: 'RULE_TEST_CHANGES', destination: 'testing.change-driven-coverage', disposition: 'active-slice-a' },
  { number: 36, alias: 'RULE_SIDE_EFFECTS', destination: 'implementation-design.localized-side-effects', disposition: 'active-slice-a' },
  { number: 37, alias: 'RULE_COMMENTS', destination: 'ordinary-or-project-documentation', disposition: 'retired' },
  { number: 38, alias: 'RULE_DEAD_CODE', destination: 'mechanical-controls-and-core.verify-before-completion', disposition: 'retired' },
  { number: 39, alias: 'RULE_VERIFICATION', destination: 'core.verify-before-completion', disposition: 'active-slice-a' },
  { number: 40, alias: 'RULE_DIFF_REVIEW', destination: 'core.verify-before-completion', disposition: 'active-slice-a' },
  { number: 41, alias: 'RULE_NO_GUESSING', destination: 'core.inspect-before-change', disposition: 'active-slice-a' },
  { number: 42, alias: 'RULE_ASSUMPTIONS', destination: 'core.inspect-before-change', disposition: 'active-slice-a' },
  { number: 43, alias: 'RULE_ROOT_CAUSE', destination: 'debugging.root-cause-discipline', disposition: 'later-slice' },
  { number: 44, alias: 'RULE_NO_OPPORTUNISTIC_REFACTOR', destination: 'core.minimal-change', disposition: 'active-slice-a' },
] as const
const requiredDomainIds = new Set([
  'async-control-flow.explicit-failure-behavior',
  'async-control-flow.overlap-safety',
  'data-boundaries.public-contract-stability',
  'react.effect-discipline',
  'react.hook-safety',
  'react.unidirectional-data-flow',
  'typescript.preserve-type-safety',
])
const coreInstructions = new Map([
  ['core.architecture-consistency', 'Respect the existing technology-independent architecture; keep concrete repository contracts in project policy.'],
  ['core.inspect-before-change', 'Inspect discoverable code, consumers, types, tests, and configuration before acting; label only genuinely unverifiable assumptions.'],
  ['core.minimal-change', 'Make the smallest correct change and exclude unrelated cleanup.'],
  ['core.name-stability', 'Preserve existing identifiers and public names unless the task or correctness requires a rename.'],
  ['core.style-consistency', 'Follow surrounding repository conventions without unrelated reformatting.'],
  ['core.task-fidelity', 'Implement the explicit task without speculative scope expansion.'],
  ['core.verify-before-completion', 'Inspect the final diff and report only verification that actually ran successfully.'],
])
const toolkitRoot = new URL('../..', import.meta.url).pathname

describe('canonical Slice A catalog', () => {
  it('loads the exact active rules and complete migration provenance', async () => {
    const { loadCatalog } = await import('../../src/catalog/load-catalog.js')
    const catalog = await loadCatalog(toolkitRoot)
    const ids = catalog.rules.map(({ id }) => id)
    const paths = catalog.rules.map(({ path }) => path)
    const aliases = catalog.rules.flatMap(({ aliases }) => aliases)

    expect(catalog.rules).toHaveLength(29)
    expect(ids).toEqual(expectedIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(aliases).size).toBe(aliases.length)
    expect(aliases).toHaveLength(33)
    expect(Object.fromEntries(catalog.rules.map(({ id, aliases: ruleAliases }) => [id, ruleAliases]))).toEqual(
      expectedRuleAliases,
    )
    expect(paths).toEqual([...paths].sort())
    expect(catalog.rules.every(({ status, rationale }) => status === 'active' && rationale.trim())).toBe(true)

    for (const rule of catalog.rules) {
      if (rule.id.startsWith('core.')) {
        expect(rule).toMatchObject({
          strength: 'required',
          enforcement: 'prompt',
          instruction: coreInstructions.get(rule.id),
          override: rule.id === 'core.task-fidelity' ? 'forbidden' : 'explicit-task',
          applicability: { domains: ['core'] },
        })
      } else {
        expect(rule.strength).toBe(requiredDomainIds.has(rule.id) ? 'required' : 'recommended')
        expect(rule.override).toBe(
          requiredDomainIds.has(rule.id) ? 'explicit-task' : 'project-overlay-or-explicit-task',
        )
        expect(rule.enforcement).toBe('prompt')
        expect(rule.applicability).toEqual({ domains: [rule.id.split('.')[0]] })
        expect(rule.instruction).toMatch(/^[^\n]+[.!?]$/)
      }
    }

    expect(catalog.rules.find(({ id }) => id === 'core.inspect-before-change')?.aliases).toEqual([
      'RULE_INSPECT_BEFORE_CHANGE', 'RULE_NO_GUESSING', 'RULE_ASSUMPTIONS',
    ])
    expect(catalog.rules.find(({ id }) => id === 'core.minimal-change')?.aliases).toEqual([
      'RULE_MINIMAL_CHANGE', 'RULE_NO_OPPORTUNISTIC_REFACTOR',
    ])
    expect(catalog.rules.find(({ id }) => id === 'core.verify-before-completion')?.aliases).toEqual([
      'RULE_VERIFICATION', 'RULE_DIFF_REVIEW',
    ])

    expect(catalog.provenance.sourceDocument).toBe(
      'docs/refs/React & Next.js — Universal LLM Development Rules.md',
    )
    expect(
      catalog.provenance.sourceRules.map(({ number, alias, destination, disposition }) => ({
        number,
        alias,
        destination,
        disposition,
      })),
    ).toEqual(expectedProvenance)

    for (const sourceRule of catalog.provenance.sourceRules) {
      const expectedDisposition = expectedProvenance[sourceRule.number - 1]!.disposition
      const expectedMergeMembers = [2, 44].includes(sourceRule.number)
        ? [2, 44]
        : [5, 41, 42].includes(sourceRule.number)
          ? [5, 41, 42]
          : [39, 40].includes(sourceRule.number)
            ? [39, 40]
            : [sourceRule.number]
      expect(sourceRule.mergeMembers).toEqual(expectedMergeMembers)
      expect(sourceRule.rationale.trim()).not.toBe('')
      if (expectedDisposition === 'active-slice-a') {
        expect(ids).toContain(sourceRule.destination)
        expect(catalog.rules.find(({ id }) => id === sourceRule.destination)?.aliases).toContain(sourceRule.alias)
      } else expect(ids).not.toContain(sourceRule.destination)
    }

    expect(catalog.provenance.editorial).toEqual([
      expect.objectContaining({ section: 'Priority Order', disposition: 'reviewed-editorial' }),
      expect.objectContaining({ section: 'Core Principle', disposition: 'reviewed-editorial' }),
    ])
  })

  it('rejects duplicate rule ids and aliases', async () => {
    const { loadCatalog } = await import('../../src/catalog/load-catalog.js')
    const catalog = await loadCatalog(toolkitRoot)
    const sourceRule = catalog.rules[0]!

    for (const duplicateKind of ['id', 'alias'] as const) {
      const root = await mkdtemp(join(tmpdir(), `agent-policy-${duplicateKind}-`))
      await cp(join(toolkitRoot, 'catalog'), join(root, 'catalog'), { recursive: true })
      const source = await readFile(join(root, sourceRule.path), 'utf8')
      const duplicate = duplicateKind === 'id'
        ? source.replace(sourceRule.aliases[0]!, 'RULE_UNIQUE_DUPLICATE')
        : source.replace(sourceRule.id, 'duplicate.unique-rule')
      await writeFile(join(root, 'catalog/rules/duplicate.md'), duplicate)

      await expect(loadCatalog(root)).rejects.toBeInstanceOf(PolicyError)
    }
  })
})
