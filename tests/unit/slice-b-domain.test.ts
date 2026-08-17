import { describe, expect, it } from 'vitest'

import {
  CLASSIFICATION_CATEGORIES,
  EVIDENCE_TYPES,
  MAINTAINER_ACTIONS,
  isClassificationCategory,
  isEvidenceType,
  isMaintainerAction,
  type AuditOutput,
  type ClassificationCategory,
  type ClassificationReport,
  type EvidenceType,
  type Finding,
  type FindingEvidence,
  type LineRange,
  type MaintainerAction,
  type UnmanagedBlock,
} from '../../src/domain/audit.js'
import {
  BEHAVIORAL_ROLES,
  DESTINATION_KINDS,
  PROPOSAL_EVIDENCE_TYPES,
  isBehavioralRole,
  isDestinationKind,
  type BehavioralRole,
  type DestinationKind,
  type ProposalDestination,
  type ProposalEvidence,
  type ProposalEvidenceType,
  type ProposalOrigin,
  type ProposalProposer,
  type ProposalSemanticChange,
  type RuleMetadataProposal,
  type UpstreamProposal,
} from '../../src/domain/proposal.js'
import type { RepositoryInvariantsConfig, Rule } from '../../src/domain/policy.js'

describe('Slice B domain models', () => {
  describe('audit domain (src/domain/audit.ts)', () => {
    it('exports complete constant arrays for categories, actions, and evidence types', () => {
      expect(CLASSIFICATION_CATEGORIES).toEqual([
        'mechanical-control',
        'shared-core',
        'repository-invariant',
        'shared-domain-policy',
        'project-policy',
        'canonical-workflow-skill',
        'agent-role-candidate',
        'documentation',
        'speculative-guidance',
        'insufficient-evidence',
      ])

      expect(MAINTAINER_ACTIONS).toEqual([
        'recommend-mechanical-control',
        'stage-invariant',
        'create-project-rule',
        'create-overlay',
        'export-upstream-proposal',
        'retain-as-project-skill',
        'retain-documentation',
        'discard',
      ])

      expect(EVIDENCE_TYPES).toEqual([
        'cross-project-failure',
        'domain-failure',
        'primary-source',
        'standard-contract',
        'local-contract',
        'architecture-decision',
        'local-failure',
        'speculative',
        'none',
      ])
    })

    it('correctly guards ClassificationCategory with isClassificationCategory', () => {
      for (const cat of CLASSIFICATION_CATEGORIES) {
        expect(isClassificationCategory(cat)).toBe(true)
      }
      expect(isClassificationCategory('unknown-category')).toBe(false)
      expect(isClassificationCategory(null)).toBe(false)
      expect(isClassificationCategory(123)).toBe(false)
      expect(isClassificationCategory({})).toBe(false)
      expect(isClassificationCategory(undefined)).toBe(false)
    })

    it('correctly guards MaintainerAction with isMaintainerAction', () => {
      for (const act of MAINTAINER_ACTIONS) {
        expect(isMaintainerAction(act)).toBe(true)
      }
      expect(isMaintainerAction('unknown-action')).toBe(false)
      expect(isMaintainerAction(null)).toBe(false)
      expect(isMaintainerAction(true)).toBe(false)
      expect(isMaintainerAction([])).toBe(false)
    })

    it('correctly guards EvidenceType with isEvidenceType', () => {
      for (const ev of EVIDENCE_TYPES) {
        expect(isEvidenceType(ev)).toBe(true)
      }
      expect(isEvidenceType('unknown-evidence')).toBe(false)
      expect(isEvidenceType(null)).toBe(false)
      expect(isEvidenceType({})).toBe(false)
    })

    it('satisfies AuditOutput and UnmanagedBlock interface shapes', () => {
      const lineRange: LineRange = { start: 1, end: 10 }
      const unmanagedBlock: UnmanagedBlock = {
        id: 'block-1',
        sourcePath: 'AGENTS.md',
        sourceSha256: 'a'.repeat(64),
        lineRange,
        content: '## Unmanaged section\nContent here',
      }
      const auditOutput: AuditOutput = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        unmanagedBlocks: [unmanagedBlock],
      }

      expect(auditOutput.schemaVersion).toBe('v1')
      expect(auditOutput.scannedFiles).toContain('AGENTS.md')
      expect(auditOutput.unmanagedBlocks[0].lineRange.start).toBe(1)
      expect(auditOutput.unmanagedBlocks[0].lineRange.end).toBe(10)
    })

    it('satisfies ClassificationReport, Finding, and FindingEvidence interface shapes', () => {
      const evidence: FindingEvidence = {
        type: 'architecture-decision',
        summary: 'Decided in ADR 0010',
        references: ['docs/adr/0010.md'],
      }

      const finding: Finding = {
        id: 'finding-1',
        sourcePath: 'AGENTS.md',
        sourceSha256: 'b'.repeat(64),
        lineRange: { start: 5, end: 15 },
        snippet: 'Never propose cd command.',
        classification: 'repository-invariant',
        rationale: 'Subshell context preservation.',
        suggestedAction: 'stage-invariant',
        suggestedDestination: '.agent-policy/rules/tms/shell-conventions.md',
        evidence,
      }

      const report: ClassificationReport = {
        schemaVersion: 'v1',
        scannedFiles: ['AGENTS.md'],
        findings: [finding],
      }

      expect(report.schemaVersion).toBe('v1')
      expect(report.findings[0].classification).toBe('repository-invariant')
      expect(report.findings[0].suggestedAction).toBe('stage-invariant')
      expect(report.findings[0].evidence.type).toBe('architecture-decision')
    })
  })

  describe('proposal domain (src/domain/proposal.ts)', () => {
    it('exports complete constant arrays for roles, destination kinds, and proposal evidence types', () => {
      expect(BEHAVIORAL_ROLES).toEqual([
        'mechanical-control',
        'shared-core',
        'shared-domain-policy',
        'canonical-workflow-skill',
        'agent-role-candidate',
        'shared-documentation',
      ])

      expect(DESTINATION_KINDS).toEqual([
        'rule',
        'bundle',
        'skill',
        'role',
        'mechanical-control',
        'documentation',
      ])

      expect(PROPOSAL_EVIDENCE_TYPES).toEqual([
        'cross-project-failure',
        'domain-failure',
        'primary-source',
        'standard-contract',
        'speculative',
      ])
    })

    it('correctly guards BehavioralRole with isBehavioralRole', () => {
      for (const role of BEHAVIORAL_ROLES) {
        expect(isBehavioralRole(role)).toBe(true)
      }
      expect(isBehavioralRole('invalid-role')).toBe(false)
      expect(isBehavioralRole(null)).toBe(false)
      expect(isBehavioralRole({})).toBe(false)
    })

    it('correctly guards DestinationKind with isDestinationKind', () => {
      for (const kind of DESTINATION_KINDS) {
        expect(isDestinationKind(kind)).toBe(true)
      }
      expect(isDestinationKind('invalid-kind')).toBe(false)
      expect(isDestinationKind(null)).toBe(false)
      expect(isDestinationKind(42)).toBe(false)
    })

    it('satisfies UpstreamProposal and sub-interface shapes', () => {
      const origin: ProposalOrigin = {
        findingId: 'finding-1',
        sourcePath: 'AGENTS.md',
        sourceSha256: 'c'.repeat(64),
        lineRange: { start: 1, end: 10 },
      }

      const destination: ProposalDestination = {
        kind: 'rule',
        targetId: 'core.task-fidelity',
        targetBundle: 'core',
      }

      const semanticChange: ProposalSemanticChange = {
        summary: 'Add task fidelity rule',
        instruction: 'Implement the explicit task without speculative scope expansion.',
        rationale: 'Prevent hallucinated work.',
        exceptions: 'When explicitly requested by the user.',
        examples: 'Do not refactor surrounding files.',
        verification: 'Check git diff for unrequested changes.',
      }

      const ruleMetadata: RuleMetadataProposal = {
        strength: 'required',
        applicability: { domains: ['core'] },
        override: 'forbidden',
        enforcement: 'prompt',
        aliases: ['RULE_TASK_FIDELITY'],
      }

      const evidence: ProposalEvidence = {
        type: 'cross-project-failure',
        summary: 'Recorded recurring scope creep across multiple repositories.',
        references: ['https://github.com/org/repo/issues/123'],
      }

      const proposer: ProposalProposer = {
        repository: 'paynet/infokiosk/tms-frontend',
        context: 'Audit of legacy AGENTS.md rules.',
      }

      const proposal: UpstreamProposal = {
        schemaVersion: 'v1',
        origin,
        behavioralRole: 'shared-core',
        proposedDestination: destination,
        semanticChange,
        ruleMetadata,
        evidence,
        proposer,
      }

      expect(proposal.schemaVersion).toBe('v1')
      expect(proposal.origin?.findingId).toBe('finding-1')
      expect(proposal.proposedDestination.kind).toBe('rule')
      expect(proposal.semanticChange.instruction).toContain('explicit task')
      expect(proposal.ruleMetadata?.enforcement).toBe('prompt')
      expect(proposal.evidence.type).toBe('cross-project-failure')
      expect(proposal.proposer.repository).toBe('paynet/infokiosk/tms-frontend')
    })
  })

  describe('policy domain invariant rule alignment (src/domain/policy.ts)', () => {
    it('supports RepositoryInvariantsConfig interface shape', () => {
      const config: RepositoryInvariantsConfig = {
        rules: ['tms.issue-tracker', 'tms.triage-labels'],
      }
      expect(config.rules).toHaveLength(2)
      expect(config.rules[0]).toBe('tms.issue-tracker')
    })

    it('preserves existing Rule structure for invariant rules stored under .agent-policy/rules/', () => {
      const invariantRule: Rule = {
        id: 'tms.issue-tracker',
        status: 'active',
        strength: 'required',
        applicability: { repo: 'tms-frontend' },
        override: 'forbidden',
        enforcement: 'documentation',
        aliases: ['TMS_ISSUE_TRACKER'],
        instruction: 'Issues and PRDs are tracked as local Markdown files under .scratch/.',
        rationale: 'Local file-based tracking ensures git-native workflow history.',
      }
      expect(invariantRule.id).toBe('tms.issue-tracker')
      expect(invariantRule.instruction).toContain('.scratch/')
    })
  })
})
