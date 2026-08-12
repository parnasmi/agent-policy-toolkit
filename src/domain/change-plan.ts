import type { VirtualArtifact } from './artifacts.js'
import type { Diagnostic } from './diagnostics.js'

export interface ChangePlan {
  readonly schemaVersion: string
  readonly command: string
  readonly toolkitVersion: string
  readonly repositoryRootFingerprint: string
  readonly sourceHashes: Readonly<Record<string, string>>
  readonly currentArtifactHashes: Readonly<Record<string, string>>
  /** Hashes of owned Managed Regions, independent from their containing file hashes. */
  readonly currentManagedRegionHashes?: Readonly<Record<string, string>>
  readonly desiredArtifacts: readonly VirtualArtifact[]
  readonly removals: readonly string[]
  readonly diagnostics: readonly Diagnostic[]
  readonly createdAt: string
  /** SHA-256 of the canonical plan document with this field omitted. */
  readonly planHash: string
}
