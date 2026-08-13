import type { ProjectPolicy } from '../domain/policy.js'

/** The canonical spelling used by the migration registry for a schema major. */
export type ProjectSchemaVersion = `v${number}`

/** The human-authored project manifest before any compilation or projection. */
export interface ProjectManifest extends ProjectPolicy {
  readonly schemaVersion: ProjectSchemaVersion | '1'
  readonly overlays?: readonly string[]
}

export interface ManagedArtifactIntegrity {
  readonly sha256: string
  readonly operation: 'managed-region' | 'replace'
  readonly owner: '@agent-policy/agent-policy-toolkit'
}

/** A recorded project source version without any generated artifact state. */
export interface ProjectPolicyLock {
  readonly schemaVersion: ProjectSchemaVersion
  readonly toolkitVersion: string
  readonly adapterKnowledgeVersion: string
  readonly canonicalSourceHash: string
  readonly managedArtifactHashes: Readonly<Record<string, ManagedArtifactIntegrity>>
  readonly generatedBy: '@agent-policy/agent-policy-toolkit'
  readonly artifactHash: string
}

/** The byte-preserving output of a pure project-schema migration. */
export interface MigrationResult {
  readonly source: string
  readonly schemaVersion: ProjectSchemaVersion
  readonly appliedMigrations: readonly string[]
}
