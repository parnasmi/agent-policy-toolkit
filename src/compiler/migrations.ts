import { PolicyError } from '../domain/diagnostics.js'
import { parseYamlDocument } from '../schema/frontmatter.js'
import type { MigrationResult, ProjectSchemaVersion } from '../schema/project-types.js'

export type ProjectMigrator = (source: string) => Pick<MigrationResult, 'source' | 'schemaVersion'>

export interface MigrationStep {
  readonly fromSchemaVersion: ProjectSchemaVersion
  readonly toSchemaVersion: ProjectSchemaVersion
  readonly migrate: ProjectMigrator
}

export interface MigrationRegistry {
  migrate(source: string, targetSchemaVersion: string): MigrationResult
}

function migrationError(code: string, message: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path: '.agent-policy/policy.yaml' }])
}

function normalizeSchemaVersion(value: unknown): ProjectSchemaVersion | undefined {
  if (typeof value !== 'string') return undefined
  const matched = /^v?(\d+)$/.exec(value)
  return matched === null ? undefined : (`v${matched[1]}` as ProjectSchemaVersion)
}

function sourceSchemaVersion(source: string): ProjectSchemaVersion {
  const parsed = parseYamlDocument(source, '.agent-policy/policy.yaml')
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw migrationError('INVALID_PROJECT_MANIFEST', 'Project manifest must be an object with schemaVersion')
  }

  const version = normalizeSchemaVersion((parsed as { schemaVersion?: unknown }).schemaVersion)
  if (version === undefined) {
    throw migrationError('UNKNOWN_SOURCE_SCHEMA_VERSION', 'Project manifest has no recognized schemaVersion')
  }
  return version
}

/**
 * Build a pure migration registry. A migrator receives source text only, so it has no filesystem
 * capability; applying its returned text remains a separate lifecycle concern.
 */
export function createMigrationRegistry(
  steps: readonly MigrationStep[],
  knownSchemaVersions: readonly ProjectSchemaVersion[] = ['v1'],
): MigrationRegistry {
  const stepsBySource = new Map<ProjectSchemaVersion, MigrationStep>()
  const versions = new Set<ProjectSchemaVersion>(knownSchemaVersions)

  for (const step of steps) {
    if (stepsBySource.has(step.fromSchemaVersion)) {
      throw new Error(`Multiple migrations start at ${step.fromSchemaVersion}`)
    }
    stepsBySource.set(step.fromSchemaVersion, step)
    versions.add(step.fromSchemaVersion)
    versions.add(step.toSchemaVersion)
  }

  return {
    migrate(source: string, targetSchemaVersion: string): MigrationResult {
      if (targetSchemaVersion === undefined || targetSchemaVersion.trim().length === 0) {
        throw migrationError(
          'EXPLICIT_SCHEMA_TARGET_REQUIRED',
          'A target schema version must be supplied explicitly by the CLI',
        )
      }

      const sourceVersion = sourceSchemaVersion(source)
      const targetVersion = normalizeSchemaVersion(targetSchemaVersion)

      if (!versions.has(sourceVersion)) {
        throw migrationError('UNKNOWN_SOURCE_SCHEMA_VERSION', `Unknown source schema version ${sourceVersion}`)
      }
      if (targetVersion === undefined || !versions.has(targetVersion)) {
        throw migrationError('UNKNOWN_TARGET_SCHEMA_VERSION', `Unknown target schema version ${targetSchemaVersion}`)
      }
      if (Number(sourceVersion.slice(1)) > Number(targetVersion.slice(1))) {
        throw migrationError(
          'SCHEMA_DOWNGRADE_UNSUPPORTED',
          `Cannot migrate project schema from ${sourceVersion} down to ${targetVersion}`,
        )
      }

      let currentSource = source
      let currentVersion = sourceVersion
      const appliedMigrations: string[] = []

      while (currentVersion !== targetVersion) {
        const step = stepsBySource.get(currentVersion)
        if (step === undefined) {
          throw migrationError(
            'MIGRATION_PATH_UNAVAILABLE',
            `No migration is registered from ${currentVersion} to ${targetVersion}`,
          )
        }
        const result = step.migrate(currentSource)
        if (result.schemaVersion !== step.toSchemaVersion) {
          throw migrationError(
            'INVALID_MIGRATOR_RESULT',
            `Migration ${step.fromSchemaVersion}->${step.toSchemaVersion} returned ${result.schemaVersion}`,
          )
        }
        currentSource = result.source
        appliedMigrations.push(`${step.fromSchemaVersion}->${step.toSchemaVersion}`)
        currentVersion = step.toSchemaVersion
      }

      return { source: currentSource, schemaVersion: currentVersion, appliedMigrations }
    },
  }
}

/** Version 1 is intentionally byte-stable: its ordered migration chain is empty. */
const registry = createMigrationRegistry([])

export function migrateProject(source: string, targetSchemaVersion: string): MigrationResult {
  return registry.migrate(source, targetSchemaVersion)
}
