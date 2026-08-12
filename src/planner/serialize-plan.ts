import type { VirtualArtifact } from '../domain/artifacts.js'
import type { ChangePlan } from '../domain/change-plan.js'
import { sortDiagnostics, type Diagnostic } from '../domain/diagnostics.js'
import { sha256Utf8 } from './hash.js'
import { normalizeArtifactPath } from './inspect.js'

type SerializableChangePlan = Omit<ChangePlan, 'planHash'> & { readonly planHash?: string }

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortedRecord(values: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => compareStrings(left, right)),
  )
}

function canonicalArtifact(artifact: VirtualArtifact): VirtualArtifact {
  return {
    path: normalizeArtifactPath(artifact.path),
    content: artifact.content,
    sha256: artifact.sha256,
    owner: artifact.owner,
    operation: artifact.operation,
  }
}

function canonicalDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    path: diagnostic.path,
    ...(diagnostic.ruleId === undefined ? {} : { ruleId: diagnostic.ruleId }),
    ...(diagnostic.remediation === undefined ? {} : { remediation: diagnostic.remediation }),
  }
}

function canonicalDocument(plan: SerializableChangePlan, includeHash: boolean): object {
  return {
    schemaVersion: plan.schemaVersion,
    command: plan.command,
    toolkitVersion: plan.toolkitVersion,
    repositoryRootFingerprint: plan.repositoryRootFingerprint,
    sourceHashes: sortedRecord(plan.sourceHashes),
    currentArtifactHashes: sortedRecord(plan.currentArtifactHashes),
    ...(plan.currentManagedRegionHashes === undefined
      ? {}
      : { currentManagedRegionHashes: sortedRecord(plan.currentManagedRegionHashes) }),
    desiredArtifacts: [...plan.desiredArtifacts]
      .map(canonicalArtifact)
      .sort((left, right) => compareStrings(left.path, right.path)),
    removals: [...plan.removals].map(normalizeArtifactPath).sort(compareStrings),
    diagnostics: sortDiagnostics(plan.diagnostics).map(canonicalDiagnostic),
    createdAt: plan.createdAt,
    ...(includeHash && plan.planHash !== undefined ? { planHash: plan.planHash } : {}),
  }
}

/** Serialize a Change Plan with fixed schema ordering and exactly one trailing newline. */
export function serializeChangePlan(plan: SerializableChangePlan): string {
  return `${JSON.stringify(canonicalDocument(plan, plan.planHash !== undefined), null, 2)}\n`
}

export const serializePlan = serializeChangePlan

/** Hash the canonical serialized document while excluding its own planHash field. */
export function computePlanHash(plan: SerializableChangePlan): string {
  return sha256Utf8(`${JSON.stringify(canonicalDocument(plan, false), null, 2)}\n`)
}
