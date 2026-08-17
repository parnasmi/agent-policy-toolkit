export type RuleStatus = 'active' | 'deprecated' | 'retired'

export type RuleStrength = 'required' | 'recommended'

export type OverridePolicy =
  | 'forbidden'
  | 'project-overlay'
  | 'explicit-task'
  | 'project-overlay-or-explicit-task'

export type EnforcementMode = 'prompt' | 'mechanical' | 'hybrid' | 'documentation'

export type OverlayOperation = 'disable' | 'addendum' | 'replace-with'

export interface Rule {
  readonly id: string
  readonly status: RuleStatus
  readonly strength: RuleStrength
  readonly applicability: Readonly<Record<string, unknown>>
  readonly override: OverridePolicy
  readonly enforcement: EnforcementMode
  readonly aliases: readonly string[]
  readonly instruction: string
  readonly rationale: string
  readonly title?: string
  readonly exceptions?: string
  readonly examples?: string
  readonly verification?: string
}

export interface Bundle {
  readonly id: string
  readonly description: string
  readonly members: readonly string[]
  readonly applicability: Readonly<Record<string, unknown>>
  readonly dependencies: readonly string[]
}

export interface ProjectPolicy {
  readonly schemaVersion: string
  readonly toolkitVersion: string
  readonly bundles: readonly string[]
  readonly targets: readonly string[]
  /** Ordered project-owned instructions loaded from .agent-policy/invariants.yaml. */
  readonly repositoryInvariants?: readonly string[]
  readonly profiles?: Readonly<Record<string, unknown>>
  readonly renderOptions?: Readonly<Record<string, unknown>>
  readonly adapterOptions?: Readonly<Record<string, unknown>>
  readonly reviewDefaults?: Readonly<Record<string, unknown>>
  readonly ciIntegration?: Readonly<Record<string, unknown>>
}

export interface OverlayDirective {
  readonly ruleId: string
  readonly operation: OverlayOperation
  readonly reason: string
  readonly content?: string
}

export interface RepositoryInvariantsConfig {
  /** Ordered project rule identifiers loaded from .agent-policy/invariants.yaml. */
  readonly rules: readonly string[]
}

