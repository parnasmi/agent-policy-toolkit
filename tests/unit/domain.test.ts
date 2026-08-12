import { describe, expect, it } from 'vitest'

import type { ChangePlan } from '../../src/domain/change-plan.js'
import { PolicyError, sortDiagnostics, type Diagnostic } from '../../src/domain/diagnostics.js'
import type { VirtualArtifact } from '../../src/domain/artifacts.js'
import type { Rule } from '../../src/domain/policy.js'

const rule = {
  id: 'core.task-fidelity',
  status: 'active',
  strength: 'required',
  applicability: { domains: ['core'] },
  override: 'forbidden',
  enforcement: 'prompt',
  aliases: ['RULE_TASK_FIDELITY'],
  instruction: 'Implement the explicit task without speculative scope expansion.',
  rationale: 'Speculative scope makes changes harder to review and increases regression risk.',
} satisfies Rule

const artifact = {
  path: '.agents/skills/core/SKILL.md',
  content: '# Core policy\n',
  sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  owner: 'codex',
  operation: 'create',
} satisfies VirtualArtifact

const changePlan = {
  schemaVersion: '1',
  command: 'init',
  toolkitVersion: '0.1.0-alpha.0',
  repositoryRootFingerprint: 'root-fingerprint',
  sourceHashes: { '.agent-policy/policy.yaml': 'source-hash' },
  currentArtifactHashes: {},
  desiredArtifacts: [artifact],
  removals: [],
  diagnostics: [],
  createdAt: '2026-08-12T00:00:00.000Z',
} satisfies ChangePlan

describe('normalized policy domain', () => {
  it('accepts valid normalized Rule, VirtualArtifact, and ChangePlan shapes', () => {
    expect(rule.applicability).toEqual({ domains: ['core'] })
    expect(artifact).toMatchObject({
      path: '.agents/skills/core/SKILL.md',
      content: '# Core policy\n',
      sha256: expect.any(String),
      owner: 'codex',
      operation: 'create',
    })
    expect(changePlan.desiredArtifacts).toEqual([artifact])
  })

  it('sorts diagnostics by path, ruleId, then code independent of input order', () => {
    const diagnostics: Diagnostic[] = [
      { code: 'Z_CODE', severity: 'error', message: 'z', path: 'b/file.md', ruleId: 'z.rule' },
      { code: 'A_CODE', severity: 'warning', message: 'a', path: 'a/file.md' },
      { code: 'B_CODE', severity: 'error', message: 'b', path: 'a/file.md', ruleId: 'a.rule' },
    ]

    const expected = ['a/file.md::A_CODE', 'a/file.md::a.rule::B_CODE', 'b/file.md::z.rule::Z_CODE']
    const keys = (values: readonly Diagnostic[]) =>
      values.map((diagnostic) =>
        [diagnostic.path, diagnostic.ruleId ?? '', diagnostic.code].filter(Boolean).join('::'),
      )

    expect(keys(sortDiagnostics(diagnostics))).toEqual(expected)
    expect(keys(sortDiagnostics([...diagnostics].reverse()))).toEqual(expected)
    expect(keys(new PolicyError([...diagnostics].reverse()).diagnostics)).toEqual(expected)
  })

  it('keeps PolicyError messages free of terminal color codes', () => {
    const error = new PolicyError([
      {
        code: 'INVALID_RULE',
        severity: 'error',
        message: 'invalid rule',
        path: 'catalog/rules/core/task-fidelity.md',
      },
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error.message).not.toMatch(/\u001b\[/)
    expect(error.diagnostics).toHaveLength(1)
  })
})
