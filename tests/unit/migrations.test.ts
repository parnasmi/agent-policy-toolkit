import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'
import { createMigrationRegistry, migrateProject, type ProjectMigrator } from '../../src/compiler/migrations.js'

const v1Source = 'schemaVersion: v1\ntoolkitVersion: 0.1.0-alpha.3\nbundles: [core]\ntargets: [codex]\n'

describe('project schema migrations', () => {
  it('returns same-version source bytes unchanged through the v1 empty chain', () => {
    const result = migrateProject(v1Source, 'v1')

    expect(result).toEqual({ source: v1Source, schemaVersion: 'v1', appliedMigrations: [] })
    expect(result.source).toBe(v1Source)
  })

  it('requires an explicit target schema version instead of choosing a major version', () => {
    expect(() => migrateProject(v1Source, undefined as never)).toThrow(PolicyError)
    expect(() => migrateProject(v1Source, undefined as never)).toThrow(/EXPLICIT_SCHEMA_TARGET_REQUIRED/)
  })

  it('rejects unknown source and target versions', () => {
    expect(() => migrateProject(v1Source.replace('schemaVersion: v1', 'schemaVersion: v99'), 'v1')).toThrow(
      /UNKNOWN_SOURCE_SCHEMA_VERSION/,
    )
    expect(() => migrateProject(v1Source, 'v99')).toThrow(/UNKNOWN_TARGET_SCHEMA_VERSION/)
  })

  it('rejects downgrades', () => {
    const registry = createMigrationRegistry([
      {
        fromSchemaVersion: 'v1',
        toSchemaVersion: 'v2',
        migrate: (source) => ({ source: source.replace('schemaVersion: v1', 'schemaVersion: v2'), schemaVersion: 'v2' }),
      },
    ])

    expect(() => registry.migrate('schemaVersion: v2\n', 'v1')).toThrow(/SCHEMA_DOWNGRADE_UNSUPPORTED/)
  })

  it('accepts pure source-to-result migrators and executes their ordered chain', () => {
    const migrateV1ToV2: ProjectMigrator = (source) => ({
      source: source.replace('schemaVersion: v1', 'schemaVersion: v2'),
      schemaVersion: 'v2',
    })
    const migrateV2ToV3: ProjectMigrator = (source) => ({
      source: source.replace('schemaVersion: v2', 'schemaVersion: v3'),
      schemaVersion: 'v3',
    })
    const registry = createMigrationRegistry([
      { fromSchemaVersion: 'v1', toSchemaVersion: 'v2', migrate: migrateV1ToV2 },
      { fromSchemaVersion: 'v2', toSchemaVersion: 'v3', migrate: migrateV2ToV3 },
    ])

    expect(registry.migrate(v1Source, 'v3')).toEqual({
      source: v1Source.replace('schemaVersion: v1', 'schemaVersion: v3'),
      schemaVersion: 'v3',
      appliedMigrations: ['v1->v2', 'v2->v3'],
    })
  })
})
