export type ReconciliationChoice = 'adopt' | 'regenerate' | 'abort'

export interface CanonicalSourceProposal {
  readonly path: string
  readonly content: string
}

export interface ArtifactDrift {
  readonly artifactPath: string
  readonly currentContent: string
  /** Present only when adapter analysis can express the artifact edit canonically. */
  readonly canonicalSourceProposal?: CanonicalSourceProposal
}

export type ReconciliationProposal =
  | { readonly kind: 'abort' }
  | {
    readonly kind: 'unresolved'
    readonly reason: 'non-interactive-drift' | 'unrepresentable-artifact-intent'
    readonly artifactPath: string
  }
  | {
    readonly kind: 'replan'
    readonly choice: 'adopt' | 'regenerate'
    readonly requiresReview: true
    readonly canonicalSourceChanges: readonly CanonicalSourceProposal[]
    readonly discardArtifactEdits: boolean
  }

/** Propose canonical replanning only; this function deliberately has no filesystem capability. */
export function reconcileDrift(
  choice: ReconciliationChoice | undefined,
  drift: ArtifactDrift,
): ReconciliationProposal {
  if (choice === undefined) {
    return {
      kind: 'unresolved',
      reason: 'non-interactive-drift',
      artifactPath: drift.artifactPath,
    }
  }
  if (choice === 'abort') return { kind: 'abort' }
  if (choice === 'regenerate') {
    return {
      kind: 'replan',
      choice,
      requiresReview: true,
      canonicalSourceChanges: [],
      discardArtifactEdits: true,
    }
  }
  if (drift.canonicalSourceProposal === undefined) {
    return {
      kind: 'unresolved',
      reason: 'unrepresentable-artifact-intent',
      artifactPath: drift.artifactPath,
    }
  }
  return {
    kind: 'replan',
    choice,
    requiresReview: true,
    canonicalSourceChanges: [drift.canonicalSourceProposal],
    discardArtifactEdits: false,
  }
}
