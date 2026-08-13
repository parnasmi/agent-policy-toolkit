import { describe, expect, it } from 'vitest'

import type { Rule } from '../../src/domain/policy.js'
import { applyOverlays } from '../../src/compiler/overlays.js'

const rules = [
  {
    id: 'core.task-fidelity',
    status: 'active',
    strength: 'required',
    applicability: { domains: ['core'] },
    override: 'forbidden',
    enforcement: 'prompt',
    aliases: ['RULE_TASK_FIDELITY'],
    instruction: 'Honor the task.',
    rationale: 'Scope stays bounded.',
  },
  {
    id: 'example.configurable',
    status: 'active',
    strength: 'recommended',
    applicability: { domains: ['example'] },
    override: 'project-overlay',
    enforcement: 'prompt',
    aliases: ['RULE_CONFIGURABLE'],
    instruction: 'Use the shared guidance.',
    rationale: 'Shared guidance stays aligned.',
  },
  {
    id: 'example.explicit-task-only',
    status: 'active',
    strength: 'required',
    applicability: { domains: ['example'] },
    override: 'explicit-task',
    enforcement: 'prompt',
    aliases: [],
    instruction: 'Keep the durable constraint.',
    rationale: 'The constraint prevents a known failure.',
  },
] satisfies readonly Rule[]

describe('overlay resolution', () => {
  it('resolves aliases before applying ordered directives and retains canonical provenance', () => {
    const result = applyOverlays(rules, [
      {
        path: '.agent-policy/overlays/first.yaml',
        ruleId: 'RULE_CONFIGURABLE',
        operation: 'addendum',
        reason: 'Repository convention.',
        content: 'Prefer the repository configuration helper.',
      },
      {
        path: '.agent-policy/overlays/second.yaml',
        ruleId: 'example.configurable',
        operation: 'replace-with',
        reason: 'The local contract is stricter.',
        content: 'Use the repository configuration helper.',
      },
      {
        path: '.agent-policy/overlays/third.yaml',
        ruleId: 'RULE_CONFIGURABLE',
        operation: 'disable',
        reason: 'This project has no runtime configuration.',
      },
    ])

    expect(result.diagnostics).toEqual([])
    expect(result.rules).not.toBe(rules)
    expect(result.rules[1]).toMatchObject({
      id: 'example.configurable',
      canonicalId: 'example.configurable',
      disabled: true,
      replacement: 'Use the repository configuration helper.',
      addenda: ['Prefer the repository configuration helper.'],
      provenance: [
        { path: '.agent-policy/overlays/first.yaml', canonicalId: 'example.configurable', operation: 'addendum' },
        { path: '.agent-policy/overlays/second.yaml', canonicalId: 'example.configurable', operation: 'replace-with' },
        { path: '.agent-policy/overlays/third.yaml', canonicalId: 'example.configurable', operation: 'disable' },
      ],
    })
  })

  it('does not mutate the catalog rules while applying an allowed directive', () => {
    const original = structuredClone(rules)

    const result = applyOverlays(rules, [{
      path: '.agent-policy/overlays/rules.yaml',
      ruleId: 'example.configurable',
      operation: 'replace-with',
      reason: 'Repository convention.',
      content: 'Use the repository configuration helper.',
    }])

    expect(result.diagnostics).toEqual([])
    expect(rules).toEqual(original)
    expect(result.rules[1]?.replacement).toBe('Use the repository configuration helper.')
  })

  it('reports missing reasons and unknown targets at the directive path', () => {
    const result = applyOverlays(rules, [
      {
        path: '.agent-policy/overlays/missing-reason.yaml',
        ruleId: 'example.configurable',
        operation: 'disable',
        reason: ' ',
      },
      {
        path: '.agent-policy/overlays/unknown.yaml',
        ruleId: 'missing.rule',
        operation: 'disable',
        reason: 'No matching rule.',
      },
    ])

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MISSING_OVERLAY_REASON',
        path: '.agent-policy/overlays/missing-reason.yaml',
        ruleId: 'example.configurable',
      }),
      expect.objectContaining({
        code: 'UNKNOWN_OVERLAY_TARGET',
        path: '.agent-policy/overlays/unknown.yaml',
        ruleId: 'missing.rule',
      }),
    ])
  })

  it('reports a runtime-invalid omitted reason at the directive path', () => {
    const result = applyOverlays(rules, [{
      path: '.agent-policy/overlays/omitted-reason.yaml',
      ruleId: 'example.configurable',
      operation: 'disable',
    } as never])

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MISSING_OVERLAY_REASON',
        path: '.agent-policy/overlays/omitted-reason.yaml',
        ruleId: 'example.configurable',
      }),
    ])
  })

  it.each(['addendum', 'replace-with'] as const)('reports runtime-invalid empty %s content', (operation) => {
    const result = applyOverlays(rules, [{
      path: `.agent-policy/overlays/empty-${operation}.yaml`,
      ruleId: 'RULE_CONFIGURABLE',
      operation,
      reason: 'The local contract is explicit.',
      content: '   ',
    }])

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'MISSING_OVERLAY_CONTENT',
        path: `.agent-policy/overlays/empty-${operation}.yaml`,
        ruleId: 'example.configurable',
      }),
    ])
  })

  it.each(['disable', 'addendum', 'replace-with'] as const)(
    'rejects %s when the target policy excludes project overlays',
    (operation) => {
      const result = applyOverlays(rules, [{
        path: '.agent-policy/overlays/blocked.yaml',
        ruleId: 'RULE_TASK_FIDELITY',
        operation,
        reason: 'Attempt an override.',
        ...(operation === 'disable' ? {} : { content: 'Replacement text.' }),
      }])

      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: 'OVERLAY_OVERRIDE_FORBIDDEN',
          path: '.agent-policy/overlays/blocked.yaml',
          ruleId: 'core.task-fidelity',
        }),
      ])
      expect(result.rules[0]).toMatchObject({ disabled: false, addenda: [], replacement: undefined, provenance: [] })
    },
  )

  it('rejects project overlays for explicit-task-only rules', () => {
    const result = applyOverlays(rules, [{
      path: '.agent-policy/overlays/blocked.yaml',
      ruleId: 'example.explicit-task-only',
      operation: 'disable',
      reason: 'Attempt an override.',
    }])

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'OVERLAY_OVERRIDE_FORBIDDEN',
        path: '.agent-policy/overlays/blocked.yaml',
        ruleId: 'example.explicit-task-only',
      }),
    ])
  })
})
