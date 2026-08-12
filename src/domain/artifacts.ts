export type ArtifactOperation = 'create' | 'replace' | 'delete' | 'managed-region'

export interface VirtualArtifact {
  /** Repository-relative POSIX path. */
  readonly path: string
  /** UTF-8 artifact contents. */
  readonly content: string
  readonly sha256: string
  readonly owner: string
  readonly operation: ArtifactOperation
}
