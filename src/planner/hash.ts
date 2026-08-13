import { createHash } from 'node:crypto'

/** Hash the exact UTF-8 byte representation of text. */
export function sha256Utf8(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export const ARTIFACT_HASH_PLACEHOLDER = '<artifact-sha256>'

const artifactHashLine = /^Artifact hash: ([0-9a-f]{64}|<artifact-sha256>)$/m

function normalizedArtifactContent(content: string): { readonly declared?: string; readonly normalized: string } {
  const match = artifactHashLine.exec(content)
  if (match === null || match[1] === undefined) return { normalized: content }
  return {
    declared: match[1] === ARTIFACT_HASH_PLACEHOLDER ? undefined : match[1],
    normalized: content.slice(0, match.index)
      + `Artifact hash: ${ARTIFACT_HASH_PLACEHOLDER}`
      + content.slice(match.index + match[0].length),
  }
}

/** Fill the deterministic artifact hash line in a generated artifact template. */
export function materializeArtifactHash(content: string): string {
  const normalized = normalizedArtifactContent(content)
  if (!content.includes(`Artifact hash: ${ARTIFACT_HASH_PLACEHOLDER}`)) {
    throw new Error('Generated artifact template is missing its hash placeholder')
  }
  return content.replace(
    `Artifact hash: ${ARTIFACT_HASH_PLACEHOLDER}`,
    `Artifact hash: ${sha256Utf8(normalized.normalized)}`,
  )
}

/** Verify a generated artifact's self-contained hash metadata. */
export function hasValidArtifactHash(content: string): boolean {
  const normalized = normalizedArtifactContent(content)
  return normalized.declared !== undefined && sha256Utf8(normalized.normalized) === normalized.declared
}
