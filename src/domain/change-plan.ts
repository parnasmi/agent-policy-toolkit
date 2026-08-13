import type { VirtualArtifact } from './artifacts.js'
import type { Diagnostic } from './diagnostics.js'

/** A reviewed replacement for a canonical, human-owned policy source. */
export interface SourceChange {
  readonly path: string
  readonly content: string
  readonly sha256: string
  readonly operation: 'create' | 'replace'
}

export interface ChangePlan {
  readonly schemaVersion: string
  readonly command: string
  readonly toolkitVersion: string
  readonly repositoryRootFingerprint: string
  readonly sourceHashes: Readonly<Record<string, string>>
  /** Optional source writes staged by an explicit, reviewed initialization selection. */
  readonly sourceChanges?: readonly SourceChange[]
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
