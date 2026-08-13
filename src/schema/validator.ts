import { readFileSync } from 'node:fs'

import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js'

import { PolicyError, type Diagnostic } from '../domain/diagnostics.js'

export type SchemaId = 'rule-v1' | 'bundle-v1' | 'project-policy-v1' | 'overlay-v1' | 'policy-lock-v1'

const schemaFiles: Record<SchemaId, string> = {
  'rule-v1': 'rule-v1.schema.json',
  'bundle-v1': 'bundle-v1.schema.json',
  'project-policy-v1': 'project-policy-v1.schema.json',
  'overlay-v1': 'overlay-v1.schema.json',
  'policy-lock-v1': 'policy-lock-v1.schema.json',
}

const ajv = new Ajv2020({ strict: true, allErrors: true })
const validators = new Map<SchemaId, ValidateFunction>()

for (const [schemaId, filename] of Object.entries(schemaFiles) as [SchemaId, string][]) {
  const schema = JSON.parse(readFileSync(new URL(`../../schemas/${filename}`, import.meta.url), 'utf8')) as object
  validators.set(schemaId, ajv.compile(schema))
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function pointerFor(error: ErrorObject): string {
  if (error.keyword === 'required') {
    return `${error.instancePath}/${escapeJsonPointerSegment(String(error.params.missingProperty))}`
  }

  if (error.keyword === 'additionalProperties') {
    return `${error.instancePath}/${escapeJsonPointerSegment(String(error.params.additionalProperty))}`
  }

  return error.instancePath || '/'
}

function toDiagnostics(errors: readonly ErrorObject[], sourcePath: string): Diagnostic[] {
  return [...errors]
    .sort((left, right) => {
      const leftPointer = pointerFor(left)
      const rightPointer = pointerFor(right)
      if (leftPointer < rightPointer) return -1
      if (leftPointer > rightPointer) return 1
      if (left.keyword < right.keyword) return -1
      if (left.keyword > right.keyword) return 1
      return left.schemaPath < right.schemaPath ? -1 : left.schemaPath > right.schemaPath ? 1 : 0
    })
    .map((error) => ({
      code: 'SCHEMA_VALIDATION',
      severity: 'error' as const,
      path: sourcePath,
      message: `${pointerFor(error)}: ${error.message ?? error.keyword}`,
    }))
}

/** Validate a source document using one of the committed versioned schemas. */
export function validateDocument<T>(schemaId: SchemaId, value: unknown, path: string): T {
  const validator = validators.get(schemaId)
  if (validator === undefined) {
    throw new PolicyError([
      { code: 'UNKNOWN_SCHEMA', severity: 'error', message: `Unknown schema ${schemaId}`, path },
    ])
  }

  if (!validator(value)) {
    throw new PolicyError(toDiagnostics(validator.errors ?? [], path))
  }

  return value as T
}
