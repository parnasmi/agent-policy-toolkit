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

const originalAliases = [
  'RULE_TASK_FIDELITY', 'RULE_MINIMAL_CHANGE', 'RULE_NAME_STABILITY', 'RULE_STYLE_CONSISTENCY',
  'RULE_INSPECT_BEFORE_CHANGE', 'RULE_ARCHITECTURE_CONSISTENCY', 'RULE_REUSE_EXISTING',
  'RULE_ABSTRACTION_RESTRAINT', 'RULE_SIMPLICITY', 'RULE_TYPE_SAFETY', 'RULE_TYPE_REUSE',
  'RULE_RUNTIME_VALIDATION', 'RULE_REACT_DATA_FLOW', 'RULE_DERIVED_STATE', 'RULE_EFFECT_DISCIPLINE',
  'RULE_REACT_OPTIMIZATION', 'RULE_COMPONENT_RESPONSIBILITY', 'RULE_HOOK_SAFETY', 'RULE_EVENT_LOGIC',
  'RULE_NEXT_BOUNDARIES', 'RULE_SERVER_SECRETS', 'RULE_NEXT_PRIMITIVES', 'RULE_URL_STATE',
  'RULE_DATA_FETCHING', 'RULE_ASYNC_SAFETY', 'RULE_ERROR_HANDLING', 'RULE_ASYNC_UI',
  'RULE_API_STABILITY', 'RULE_BOUNDARY_NORMALIZATION', 'RULE_ACCESSIBILITY', 'RULE_SECURITY_INPUT',
  'RULE_AUTHORIZATION', 'RULE_DEPENDENCY_RESTRAINT', 'RULE_TEST_BEHAVIOR', 'RULE_TEST_CHANGES',
  'RULE_SIDE_EFFECTS', 'RULE_COMMENTS', 'RULE_DEAD_CODE', 'RULE_VERIFICATION', 'RULE_DIFF_REVIEW',
  'RULE_NO_GUESSING', 'RULE_ASSUMPTIONS', 'RULE_ROOT_CAUSE', 'RULE_NO_OPPORTUNISTIC_REFACTOR',
] as const

const laterSliceNumbers = new Set([20, 21, 22, 23, 24, 30, 31, 32, 43])
const retiredNumbers = new Set([37, 38])
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
    expect(catalog.provenance.sourceRules.map(({ number }) => number)).toEqual(
      Array.from({ length: 44 }, (_, index) => index + 1),
    )
    expect(catalog.provenance.sourceRules.map(({ alias }) => alias)).toEqual(originalAliases)

    for (const sourceRule of catalog.provenance.sourceRules) {
      const expectedDisposition = laterSliceNumbers.has(sourceRule.number)
        ? 'later-slice'
        : retiredNumbers.has(sourceRule.number)
          ? 'retired'
          : 'active-slice-a'
      expect(sourceRule.disposition).toBe(expectedDisposition)
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
