import type { VirtualArtifact } from '../domain/artifacts.js'
import type { ManagedArtifactIntegrity, ProjectPolicyLock } from '../schema/project-types.js'
import { codexCapabilities } from '../adapters/codex/capabilities.js'
import { MANAGED_REGION_END, MANAGED_REGION_START } from '../adapters/codex/managed-region.js'
import { sha256Utf8, normalizeGeneratedLineEndings } from './hash.js'

export const POLICY_LOCK_PATH = '.agent-policy/policy.lock.json'
export const POLICY_LOCK_OWNER = '@agent-policy/agent-policy-toolkit' as const
const artifactHashPlaceholder = '<artifact-sha256>'

function normalizedLock(content: string): { readonly declared?: string; readonly normalized: string } {
  const stable = normalizeGeneratedLineEndings(content)
  const match = /("artifactHash"\s*:\s*")(?:[0-9a-f]{64}|<artifact-sha256>)(")/.exec(stable)
  if (match === null || match[1] === undefined || match[2] === undefined) return { normalized: stable }
  return {
    declared: match[0].includes(artifactHashPlaceholder)
      ? undefined
      : match[0].slice(match[1].length, -match[2].length),
    normalized: stable.slice(0, match.index)
      + `${match[1]}${artifactHashPlaceholder}${match[2]}`
      + stable.slice(match.index + match[0].length),
  }
}

export function hasValidPolicyLockHash(content: string): boolean {
  const parsed = (() => {
    try {
      return JSON.parse(content) as Partial<ProjectPolicyLock>
    } catch {
      return undefined
    }
  })()
  return isPolicyLockShape(parsed)
    && normalizedLock(content).declared !== undefined
    && sha256Utf8(normalizedLock(content).normalized) === normalizedLock(content).declared
}

function isPolicyLockShape(value: Partial<ProjectPolicyLock> | undefined): value is ProjectPolicyLock {
  if (
    value?.schemaVersion !== 'v1'
    || typeof value.toolkitVersion !== 'string'
    || value.toolkitVersion.length === 0
    || typeof value.adapterKnowledgeVersion !== 'string'
    || value.adapterKnowledgeVersion.length === 0
    || typeof value.canonicalSourceHash !== 'string'
    || !/^[0-9a-f]{64}$/.test(value.canonicalSourceHash)
    || value.generatedBy !== POLICY_LOCK_OWNER
    || typeof value.artifactHash !== 'string'
    || value.managedArtifactHashes === undefined
    || value.managedArtifactHashes === null
    || typeof value.managedArtifactHashes !== 'object'
  ) return false

  return Object.values(value.managedArtifactHashes).every((entry) =>
    entry !== null
    && typeof entry === 'object'
    && /^[0-9a-f]{64}$/.test(entry.sha256)
    && (entry.operation === 'managed-region' || entry.operation === 'replace')
    && entry.owner === POLICY_LOCK_OWNER,
  )
}

function managedRegionContent(content: string): string {
  const stable = normalizeGeneratedLineEndings(content)
  const start = stable.indexOf(MANAGED_REGION_START)
  const end = stable.indexOf(MANAGED_REGION_END, start + MANAGED_REGION_START.length)
  if (start < 0 || end < 0) throw new Error('Codex Managed Region is missing from the generated artifact')
  return stable.slice(start, end + MANAGED_REGION_END.length)
}

function integrityFor(artifact: VirtualArtifact): ManagedArtifactIntegrity {
  const canonicalContent = artifact.operation === 'managed-region'
    ? managedRegionContent(artifact.content)
    : normalizeGeneratedLineEndings(artifact.content)
  return {
    sha256: sha256Utf8(canonicalContent),
    operation: artifact.operation === 'managed-region' ? 'managed-region' : 'replace',
    owner: POLICY_LOCK_OWNER,
  }
}

function sortedHashes(artifacts: readonly VirtualArtifact[]): Readonly<Record<string, ManagedArtifactIntegrity>> {
  return Object.fromEntries(
    artifacts
      .filter(({ path }) => path !== POLICY_LOCK_PATH)
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      .map((artifact) => [artifact.path, integrityFor(artifact)]),
  )
}

/** Build the deterministic generated lock artifact for one Codex projection. */
export function policyLockArtifact(
  toolkitVersion: string,
  canonicalSourceHash: string,
  artifacts: readonly VirtualArtifact[],
): VirtualArtifact {
  const lock: Omit<ProjectPolicyLock, 'artifactHash'> & { readonly artifactHash: string } = {
    schemaVersion: 'v1',
    toolkitVersion,
    adapterKnowledgeVersion: codexCapabilities.adapterKnowledgeVersion,
    canonicalSourceHash,
    managedArtifactHashes: sortedHashes(artifacts),
    generatedBy: POLICY_LOCK_OWNER,
    artifactHash: artifactHashPlaceholder,
  }
  const template = `${JSON.stringify(lock, null, 2)}\n`
  const hash = sha256Utf8(normalizedLock(template).normalized)
  const content = template.replace(`"artifactHash": "${artifactHashPlaceholder}"`, `"artifactHash": "${hash}"`)
  return {
    path: POLICY_LOCK_PATH,
    content,
    sha256: sha256Utf8(content),
    owner: POLICY_LOCK_OWNER,
    operation: 'replace',
  }
}
