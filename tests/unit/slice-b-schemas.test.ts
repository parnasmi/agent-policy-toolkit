import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'
import { validateDocument } from '../../src/schema/validator.js'

describe('Slice B schemas validation', () => {
  describe('audit-output-v1', () => {
    const validAuditOutput = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md', 'docs/agents/issue-tracker.md'],
      unmanagedBlocks: [
        {
          id: 'block-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: 'a'.repeat(64),
          lineRange: {
            start: 1,
            end: 10,
          },
          content: '## Issue tracker\nIssues are tracked in .scratch/',
        },
      ],
    }

    it('validates a valid audit-output-v1 document', () => {
      expect(
        validateDocument('audit-output-v1', validAuditOutput, 'audit-output.json'),
      ).toEqual(validAuditOutput)
    })

    it('rejects audit-output-v1 missing required fields or with invalid sha256', () => {
      expect(() =>
        validateDocument(
          'audit-output-v1',
          {
            schemaVersion: 'v1',
            scannedFiles: ['AGENTS.md'],
            unmanagedBlocks: [
              {
                id: 'block-1',
                sourcePath: 'AGENTS.md',
                sourceSha256: 'invalid-sha',
                lineRange: { start: 1, end: 10 },
                content: 'Some text',
              },
            ],
          },
          'audit-output.json',
        ),
      ).toThrow(PolicyError)

      expect(() =>
        validateDocument(
          'audit-output-v1',
          {
            schemaVersion: 'v2',
            scannedFiles: ['AGENTS.md'],
            unmanagedBlocks: [],
          },
          'audit-output.json',
        ),
      ).toThrow(PolicyError)
    })
  })

  describe('classification-report-v1', () => {
    const validReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: 'b'.repeat(64),
          lineRange: { start: 5, end: 12 },
          snippet: 'Use pnpm instead of npm.',
          classification: 'repository-invariant',
          rationale: 'Repository consistency requirement.',
          suggestedAction: 'stage-invariant',
          suggestedDestination: '.agent-policy/rules/repository/package-manager.md',
          evidence: {
            type: 'architecture-decision',
            summary: 'Documented in ADR-0010.',
            references: ['docs/adr/0010.md'],
          },
        },
        {
          id: 'finding-2',
          sourcePath: 'AGENTS.md',
          sourceSha256: 'b'.repeat(64),
          lineRange: { start: 15, end: 20 },
          snippet: 'Make the smallest correct change.',
          classification: 'shared-core',
          rationale: 'Fundamental cross-project instruction.',
          suggestedAction: 'export-upstream-proposal',
          evidence: {
            type: 'cross-project-failure',
            summary: 'Observed scope creep across multiple repos.',
          },
        },
      ],
    }

    it('validates a valid classification-report-v1 document', () => {
      expect(
        validateDocument('classification-report-v1', validReport, 'report.json'),
      ).toEqual(validReport)
    })

    it('rejects invalid classification -> action mappings', () => {
      // shared-core cannot map to stage-invariant (only export-upstream-proposal, discard)
      const invalidActionReport = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        findings: [
          {
            id: 'finding-1',
            sourcePath: 'AGENTS.md',
            sourceSha256: 'b'.repeat(64),
            lineRange: { start: 15, end: 20 },
            snippet: 'Make the smallest correct change.',
            classification: 'shared-core',
            rationale: 'Cross-project rule.',
            suggestedAction: 'stage-invariant',
            evidence: {
              type: 'cross-project-failure',
              summary: 'Observed across multiple repos.',
            },
          },
        ],
      }

      expect(() =>
        validateDocument('classification-report-v1', invalidActionReport, 'report.json'),
      ).toThrow(PolicyError)

      // repository-invariant cannot map to create-project-rule or export-upstream-proposal
      const invalidRepoActionReport = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        findings: [
          {
            id: 'finding-1',
            sourcePath: 'AGENTS.md',
            sourceSha256: 'b'.repeat(64),
            lineRange: { start: 5, end: 12 },
            snippet: 'Local repo invariant.',
            classification: 'repository-invariant',
            rationale: 'Local invariant.',
            suggestedAction: 'export-upstream-proposal',
            evidence: {
              type: 'local-contract',
              summary: 'Local contract.',
            },
          },
        ],
      }

      expect(() =>
        validateDocument('classification-report-v1', invalidRepoActionReport, 'report.json'),
      ).toThrow(PolicyError)
    })

    it('rejects invalid classification -> evidence mappings', () => {
      // shared-core requires cross-project-failure evidence
      const invalidEvidenceReport = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        findings: [
          {
            id: 'finding-1',
            sourcePath: 'AGENTS.md',
            sourceSha256: 'b'.repeat(64),
            lineRange: { start: 15, end: 20 },
            snippet: 'Make the smallest correct change.',
            classification: 'shared-core',
            rationale: 'Cross-project rule.',
            suggestedAction: 'export-upstream-proposal',
            evidence: {
              type: 'local-contract',
              summary: 'Local contract evidence is not enough for shared-core.',
            },
          },
        ],
      }

      expect(() =>
        validateDocument('classification-report-v1', invalidEvidenceReport, 'report.json'),
      ).toThrow(PolicyError)

      // shared-domain-policy requires domain-failure, primary-source, or standard-contract
      const invalidDomainEvidenceReport = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        findings: [
          {
            id: 'finding-1',
            sourcePath: 'AGENTS.md',
            sourceSha256: 'b'.repeat(64),
            lineRange: { start: 15, end: 20 },
            snippet: 'React useEffect pattern.',
            classification: 'shared-domain-policy',
            rationale: 'Domain guideline.',
            suggestedAction: 'export-upstream-proposal',
            evidence: {
              type: 'local-contract',
              summary: 'Local contract instead of domain source.',
            },
          },
        ],
      }

      expect(() =>
        validateDocument('classification-report-v1', invalidDomainEvidenceReport, 'report.json'),
      ).toThrow(PolicyError)
    })
  })

  describe('proposal-v1', () => {
    const validProposal = {
      schemaVersion: 'v1',
      origin: {
        findingId: 'finding-1',
        sourcePath: 'AGENTS.md',
        sourceSha256: 'c'.repeat(64),
        lineRange: { start: 1, end: 10 },
      },
      behavioralRole: 'shared-core',
      proposedDestination: {
        kind: 'rule',
        targetId: 'core.small-changes',
      },
      semanticChange: {
        summary: 'Propose small changes rule',
        instruction: 'Make the smallest correct change.',
        rationale: 'Keep changes reviewable.',
      },
      ruleMetadata: {
        strength: 'required',
        applicability: { languages: ['typescript'] },
        override: 'forbidden',
        enforcement: 'prompt',
        aliases: ['RULE_SMALL_CHANGES'],
      },
      evidence: {
        type: 'cross-project-failure',
        summary: 'Recorded failures in repos A and B.',
        references: ['https://example.com/issue/1'],
      },
      proposer: {
        repository: 'paynet/infokiosk/tms-frontend',
        context: 'Found during dogfood audit.',
      },
    }

    it('validates a valid proposal-v1 document with origin metadata', () => {
      expect(
        validateDocument('proposal-v1', validProposal, 'proposal.json'),
      ).toEqual(validProposal)
    })

    it('rejects proposal-v1 with kind "rule" missing ruleMetadata', () => {
      const { ruleMetadata: _, ...proposalWithoutRuleMetadata } = validProposal

      expect(() =>
        validateDocument('proposal-v1', proposalWithoutRuleMetadata, 'proposal.json'),
      ).toThrow(PolicyError)
    })

    it('rejects proposal-v1 with kind "rule" missing semanticChange.instruction', () => {
      const proposalWithoutInstruction = {
        ...validProposal,
        semanticChange: {
          summary: 'Propose small changes rule',
          rationale: 'Keep changes reviewable.',
        },
      }

      expect(() =>
        validateDocument('proposal-v1', proposalWithoutInstruction, 'proposal.json'),
      ).toThrow(PolicyError)
    })

    it('rejects proposal-v1 with inconsistent behavioralRole and proposedDestination kind', () => {
      const invalidKindProposal = {
        ...validProposal,
        behavioralRole: 'shared-core',
        proposedDestination: {
          kind: 'skill',
        },
      }

      expect(() =>
        validateDocument('proposal-v1', invalidKindProposal, 'proposal.json'),
      ).toThrow(PolicyError)
    })
  })
})
