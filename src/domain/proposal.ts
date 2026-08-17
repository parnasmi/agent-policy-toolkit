import type { LineRange } from './audit.js'
import type { EnforcementMode, OverridePolicy, RuleStrength } from './policy.js'

export const BEHAVIORAL_ROLES = [
  'mechanical-control',
  'shared-core',
  'shared-domain-policy',
  'canonical-workflow-skill',
  'agent-role-candidate',
  'shared-documentation',
] as const

export type BehavioralRole = (typeof BEHAVIORAL_ROLES)[number]

export function isBehavioralRole(value: unknown): value is BehavioralRole {
  return (
    typeof value === 'string' &&
    (BEHAVIORAL_ROLES as readonly string[]).includes(value)
  )
}

export const DESTINATION_KINDS = [
  'rule',
  'bundle',
  'skill',
  'role',
  'mechanical-control',
  'documentation',
] as const

export type DestinationKind = (typeof DESTINATION_KINDS)[number]

export function isDestinationKind(value: unknown): value is DestinationKind {
  return (
    typeof value === 'string' &&
    (DESTINATION_KINDS as readonly string[]).includes(value)
  )
}

export interface ProposalOrigin {
  readonly findingId: string
  readonly sourcePath: string
  readonly sourceSha256: string
  readonly lineRange: LineRange
}

export interface ProposalDestination {
  readonly kind: DestinationKind
  readonly targetId?: string
  readonly targetBundle?: string
}

export interface ProposalSemanticChange {
  readonly summary: string
  readonly instruction?: string
  readonly rationale: string
  readonly exceptions?: string
  readonly examples?: string
  readonly verification?: string
}

export interface RuleMetadataProposal {
  readonly strength: RuleStrength
  readonly applicability: Readonly<Record<string, unknown>>
  readonly override: OverridePolicy
  readonly enforcement: EnforcementMode
  readonly aliases?: readonly string[]
}

export const PROPOSAL_EVIDENCE_TYPES = [
  'cross-project-failure',
  'domain-failure',
  'primary-source',
  'standard-contract',
  'speculative',
] as const

export type ProposalEvidenceType = (typeof PROPOSAL_EVIDENCE_TYPES)[number]

export function isProposalEvidenceType(value: unknown): value is ProposalEvidenceType {
  return (
    typeof value === 'string' &&
    (PROPOSAL_EVIDENCE_TYPES as readonly string[]).includes(value)
  )
}

export interface ProposalEvidence {
  readonly type: ProposalEvidenceType
  readonly summary: string
  readonly references?: readonly string[]
}

export interface ProposalProposer {
  readonly repository?: string
  readonly context: string
}

export interface UpstreamProposal {
  readonly schemaVersion: 'v1'
  readonly origin?: ProposalOrigin
  readonly behavioralRole: BehavioralRole
  readonly proposedDestination: ProposalDestination
  readonly semanticChange: ProposalSemanticChange
  readonly ruleMetadata?: RuleMetadataProposal
  readonly evidence: ProposalEvidence
  readonly proposer: ProposalProposer
}
