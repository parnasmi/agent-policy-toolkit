import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'
import { parseRuleMarkdown } from '../../src/schema/frontmatter.js'
import { loadProjectPolicy } from '../../src/schema/load-project.js'
import { validateDocument } from '../../src/schema/validator.js'

const validRule = {
  id: 'core.task-fidelity',
  status: 'active',
  strength: 'required',
  applicability: { languages: ['typescript'], futureConstraint: { enabled: true } },
  override: 'forbidden',
  enforcement: 'prompt',
  aliases: ['RULE_TASK_FIDELITY'],
}

const markdown = (frontmatter: Record<string, unknown>, body = '## Instruction\n\nDo the task.\n\n## Rationale\n\nScope stays reviewable.\n') =>
  `---\n${Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n${body}`

function diagnosticsFrom(action: () => unknown): readonly { path: string; message: string }[] {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(PolicyError)
    return (error as PolicyError).diagnostics
  }

  throw new Error('Expected PolicyError')
}

describe('canonical source schema validation', () => {
  it('reports missing id in JSON-pointer order', () => {
    const diagnostics = diagnosticsFrom(() =>
      validateDocument('rule-v1', { ...validRule, id: undefined }, 'catalog/rules/core/task-fidelity.md'),
    )

    expect(diagnostics.map(({ message }) => message.split(':', 1)[0])).toEqual(['/id'])
  })

  it('rejects non-namespaced rule ids, duplicate aliases, unknown required fields, and scalar applicability', () => {
    const diagnostics = diagnosticsFrom(() =>
      validateDocument(
        'rule-v1',
        {
          ...validRule,
          id: 'task-fidelity',
          aliases: ['RULE_TASK_FIDELITY', 'RULE_TASK_FIDELITY'],
          applicability: 'core',
          unknownRequiredField: true,
        },
        'catalog/rules/core/task-fidelity.md',
      ),
    )

    expect(diagnostics.map(({ message }) => message.split(':', 1)[0])).toEqual([
      '/aliases',
      '/applicability',
      '/id',
      '/unknownRequiredField',
    ])
  })

  it('accepts extensible applicability objects while keeping the rule envelope strict', () => {
    expect(validateDocument('rule-v1', validRule, 'catalog/rules/core/task-fidelity.md')).toEqual(validRule)
  })

  it('requires exactly one Instruction and Rationale Markdown section', () => {
    expect(() =>
      parseRuleMarkdown(markdown(validRule, '## Instruction\n\nDo the task.\n'), 'catalog/rules/core/task-fidelity.md'),
    ).toThrow(PolicyError)
    expect(() =>
      parseRuleMarkdown(
        markdown(validRule, '## Instruction\n\nDo the task.\n\n## Rationale\n\nWhy.\n\n## Instruction\n\nAgain.\n'),
        'catalog/rules/core/task-fidelity.md',
      ),
    ).toThrow(PolicyError)
  })

  it('does not treat a later fence as frontmatter', () => {
    expect(() => parseRuleMarkdown(`# Heading\n\n---\n${markdown(validRule)}`, 'catalog/rules/core/task-fidelity.md')).toThrow(
      PolicyError,
    )
  })

  it('rejects YAML custom tags', () => {
    const taggedRule = markdown(validRule).replace(
      'id: "core.task-fidelity"',
      'id: !custom core.task-fidelity',
    )

    expect(() => parseRuleMarkdown(taggedRule, 'catalog/rules/core/task-fidelity.md')).toThrow(PolicyError)
  })

  it('loads only declared project files and does not create missing references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-schema-'))
    const policyDir = join(root, '.agent-policy')
    await mkdir(policyDir)
    await writeFile(
      join(policyDir, 'policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: [core]\ntargets: [codex]\noverlays: [missing-overlay.yaml]\n',
    )

    await expect(loadProjectPolicy(root)).rejects.toBeInstanceOf(PolicyError)
    await expect(readFile(join(policyDir, 'missing-overlay.yaml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects declared files that escape the project policy directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-schema-'))
    const policyDir = join(root, '.agent-policy')
    await mkdir(policyDir)
    await writeFile(
      join(policyDir, 'policy.yaml'),
      'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.0\nbundles: [core]\ntargets: [codex]\noverlays: [../outside.yaml]\n',
    )

    await expect(loadProjectPolicy(root)).rejects.toBeInstanceOf(PolicyError)
  })
})
