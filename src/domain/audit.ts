export interface LineRange {
  readonly start: number
  readonly end: number
}

export interface UnmanagedBlock {
  readonly id: string
  readonly sourcePath: string
  readonly sourceSha256: string
  readonly lineRange: LineRange
  readonly content: string
}

export interface AuditOutput {
  readonly schemaVersion: 'v1'
  readonly scannedFiles: readonly string[]
  readonly unmanagedBlocks: readonly UnmanagedBlock[]
}

export const CLASSIFICATION_CATEGORIES = [
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
] as const

export type ClassificationCategory = (typeof CLASSIFICATION_CATEGORIES)[number]

export function isClassificationCategory(value: unknown): value is ClassificationCategory {
  return (
    typeof value === 'string' &&
    (CLASSIFICATION_CATEGORIES as readonly string[]).includes(value)
  )
}

export const MAINTAINER_ACTIONS = [
  'recommend-mechanical-control',
  'stage-invariant',
  'create-project-rule',
  'create-overlay',
  'export-upstream-proposal',
  'retain-as-project-skill',
  'retain-documentation',
  'discard',
] as const

export type MaintainerAction = (typeof MAINTAINER_ACTIONS)[number]

export function isMaintainerAction(value: unknown): value is MaintainerAction {
  return (
    typeof value === 'string' &&
    (MAINTAINER_ACTIONS as readonly string[]).includes(value)
  )
}

export const EVIDENCE_TYPES = [
  'cross-project-failure',
  'domain-failure',
  'primary-source',
  'standard-contract',
  'local-contract',
  'architecture-decision',
  'local-failure',
  'speculative',
  'none',
] as const

export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export function isEvidenceType(value: unknown): value is EvidenceType {
  return (
    typeof value === 'string' &&
    (EVIDENCE_TYPES as readonly string[]).includes(value)
  )
}

export interface FindingEvidence {
  readonly type: EvidenceType
  readonly summary: string
  readonly references?: readonly string[]
}

export interface Finding {
  readonly id: string
  readonly sourcePath: string
  readonly sourceSha256: string
  readonly lineRange: LineRange
  readonly snippet: string
  readonly classification: ClassificationCategory
  readonly rationale: string
  readonly suggestedAction: MaintainerAction
  readonly suggestedDestination?: string
  readonly evidence: FindingEvidence
}

export interface ClassificationReport {
  readonly schemaVersion: 'v1'
  readonly scannedFiles: readonly string[]
  readonly findings: readonly Finding[]
}
