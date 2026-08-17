import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'
import type { UpstreamProposal } from '../../src/domain/proposal.js'
import { exportProposalDocument } from '../../src/proposal/export.js'
import { validateDocument } from '../../src/schema/validator.js'

describe('Upstream proposal export (src/proposal/export.ts)', () => {
  const validRuleProposal: UpstreamProposal = {
    schemaVersion: 'v1',
    origin: {
      findingId: 'finding-1',
      sourcePath: 'AGENTS.md',
      sourceSha256: 'a'.repeat(64),
      lineRange: { start: 10, end: 20 },
    },
    behavioralRole: 'shared-domain-policy',
    proposedDestination: {
      kind: 'rule',
      targetId: 'domain.react-patterns',
      targetBundle: 'react',
    },
    semanticChange: {
      summary: 'Propose React useEffect guidance rule',
      instruction: 'Do not trigger state updates synchronously inside useEffect without dependencies.',
      rationale: 'Prevents infinite render loops in React applications.',
      exceptions: 'When initializing local state from external non-reactive subscription.',
      examples: 'useEffect(() => { setValue(compute()); }, []);',
      verification: 'Run React Testing Library render tests.',
    },
    ruleMetadata: {
      strength: 'required',
      applicability: { domain: 'react', framework: 'react-19' },
      override: 'forbidden',
      enforcement: 'prompt',
      aliases: ['RULE_REACT_EFFECTS'],
    },
    evidence: {
      type: 'domain-failure',
      summary: 'Observed multiple infinite loops in dogfood project.',
      references: ['https://react.dev/learn/synchronizing-with-effects', 'issue #42'],
    },
    proposer: {
      repository: 'paynet/infokiosk/tms-frontend',
      context: 'Dogfood audit of unmanaged AGENTS.md instructions.',
    },
  }

  it('exports a valid rule proposal to portable YAML with header comment and preserves all metadata', async () => {
    const result = await exportProposalDocument(validRuleProposal)

    expect(result.proposal).toEqual(validRuleProposal)
    expect(result.content).toMatch(/^# Upstream Policy Proposal\n# Schema: proposal-v1\n\n/)

    // Content should contain key sections
    expect(result.content).toContain('schemaVersion: v1')
    expect(result.content).toContain('behavioralRole: shared-domain-policy')
    expect(result.content).toContain('findingId: finding-1')
    expect(result.content).toContain('sourcePath: AGENTS.md')
    expect(result.content).toContain('targetId: domain.react-patterns')
    expect(result.content).toContain('strength: required')
    expect(result.content).toContain('RULE_REACT_EFFECTS')
    expect(result.content).toContain('repository: paynet/infokiosk/tms-frontend')

    // Validates that written output parses back and satisfies proposal-v1
    const parsed = parse(result.content) as UpstreamProposal
    const validated = validateDocument<UpstreamProposal>('proposal-v1', parsed, 'proposal.yaml')
    expect(validated).toEqual(validRuleProposal)
  })

  it('exports non-rule proposal (canonical-workflow-skill) without ruleMetadata', async () => {
    const skillProposal: UpstreamProposal = {
      schemaVersion: 'v1',
      origin: {
        findingId: 'finding-skill-1',
        sourcePath: 'docs/testing.md',
        sourceSha256: 'b'.repeat(64),
        lineRange: { start: 1, end: 15 },
      },
      behavioralRole: 'canonical-workflow-skill',
      proposedDestination: {
        kind: 'skill',
        targetId: 'skills/vitest-unit-testing',
      },
      semanticChange: {
        summary: 'Add vitest unit testing workflow skill',
        rationale: 'Shared unit testing workflow across TypeScript repositories.',
      },
      evidence: {
        type: 'domain-failure',
        summary: 'Engineers struggled with inconsistent test setups.',
      },
      proposer: {
        context: 'Audit of testing documentation.',
      },
    }

    const result = await exportProposalDocument(skillProposal)

    expect(result.proposal).toEqual(skillProposal)
    expect(result.content).toMatch(/^# Upstream Policy Proposal\n# Schema: proposal-v1\n\n/)
    expect(result.content).not.toContain('ruleMetadata')

    const parsed = parse(result.content) as UpstreamProposal
    const validated = validateDocument<UpstreamProposal>('proposal-v1', parsed, 'proposal.yaml')
    expect(validated).toEqual(skillProposal)
  })

  it('exports non-rule proposal (mechanical-control) without ruleMetadata', async () => {
    const mechanicalProposal: UpstreamProposal = {
      schemaVersion: 'v1',
      behavioralRole: 'mechanical-control',
      proposedDestination: {
        kind: 'mechanical-control',
        targetId: 'eslint/no-var',
      },
      semanticChange: {
        summary: 'Mechanize var ban via ESLint',
        rationale: 'ESLint rule eslint/no-var enforces const/let deterministically.',
      },
      evidence: {
        type: 'primary-source',
        summary: 'Standard JavaScript / TypeScript linting rule.',
      },
      proposer: {
        repository: 'paynet/infokiosk/tms-frontend',
        context: 'Discovered prompt-based instruction that should be mechanical.',
      },
    }

    const result = await exportProposalDocument(mechanicalProposal)

    expect(result.proposal).toEqual(mechanicalProposal)
    expect(result.content).not.toContain('ruleMetadata')

    const parsed = parse(result.content) as UpstreamProposal
    const validated = validateDocument<UpstreamProposal>('proposal-v1', parsed, 'proposal.yaml')
    expect(validated).toEqual(mechanicalProposal)
  })

  it('accepts input spec as a JSON or YAML string and parses/validates it', async () => {
    const jsonString = JSON.stringify(validRuleProposal)
    const jsonResult = await exportProposalDocument(jsonString)
    expect(jsonResult.proposal).toEqual(validRuleProposal)

    const yamlResult = await exportProposalDocument(jsonResult.content)
    expect(yamlResult.proposal).toEqual(validRuleProposal)
  })

  it('rejects when spec is missing required fields or has incompatible destination/role', async () => {
    // Missing required fields
    const incomplete = {
      schemaVersion: 'v1',
      behavioralRole: 'shared-domain-policy',
    }

    await expect(exportProposalDocument(incomplete)).rejects.toThrow(PolicyError)

    // Incompatible destination: shared-core with kind: skill
    const incompatibleRole = {
      ...validRuleProposal,
      behavioralRole: 'shared-core',
      proposedDestination: { kind: 'skill' },
    }

    await expect(exportProposalDocument(incompatibleRole)).rejects.toThrow(PolicyError)

    // Rule proposal missing ruleMetadata
    const { ruleMetadata: _, ...ruleWithoutMetadata } = validRuleProposal
    await expect(exportProposalDocument(ruleWithoutMetadata)).rejects.toThrow(PolicyError)

    // Invalid string content (malformed YAML/JSON)
    await expect(exportProposalDocument('{ invalid json')).rejects.toThrow(PolicyError)
  })

  it('writes to specified outputPath atomically if path provided', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-policy-export-'))
    try {
      const outputPath = join(tempDir, 'nested', 'export-proposal.yaml')
      const result = await exportProposalDocument(validRuleProposal, outputPath)

      const writtenContent = await readFile(outputPath, 'utf8')
      expect(writtenContent).toBe(result.content)

      const parsed = parse(writtenContent) as UpstreamProposal
      const validated = validateDocument<UpstreamProposal>('proposal-v1', parsed, outputPath)
      expect(validated).toEqual(validRuleProposal)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
