import type { Bundle } from '../domain/policy.js'
import type { VirtualArtifact } from '../domain/artifacts.js'
import type { ResolvedPolicy } from '../compiler/resolve-policy.js'

export interface ScopedProfileProjection {
  readonly id: string
  readonly bundleIds: readonly string[]
  readonly paths: readonly string[]
  readonly workspaces?: readonly string[]
}

export interface ProjectionInput {
  readonly toolkitVersion: string
  readonly canonicalSourceHash: string
  readonly resolvedPolicy: ResolvedPolicy
  readonly bundles: ReadonlyMap<string, Bundle>
  readonly existingArtifacts?: ReadonlyMap<string, string>
  readonly repositoryInvariants?: readonly string[]
  readonly scopedProfiles?: readonly ScopedProfileProjection[]
}

export interface HarnessCapabilityProfile {
  readonly harness: string
  readonly adapterKnowledgeVersion: string
  readonly support: 'experimental' | 'supported'
  readonly instructionDiscovery: readonly string[]
  readonly skillDiscovery: readonly string[]
  readonly nativeRoles: boolean
  readonly isolatedWork: boolean
  readonly parallelWork: boolean
  readonly toolAccess: 'harness-native'
  readonly scopedInstructions: boolean
}

export interface HarnessAdapter {
  readonly capabilities: HarnessCapabilityProfile
  project(input: ProjectionInput): Promise<readonly VirtualArtifact[]>
}
