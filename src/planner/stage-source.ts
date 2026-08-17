import { lstat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve, sep } from 'node:path'

import type { ChangePlan, SourceChange } from '../domain/change-plan.js'
import { PolicyError } from '../domain/diagnostics.js'
import { sha256Utf8 } from './hash.js'
import { compileCodex, saveProjectionPlan, type CommandContext } from '../cli/commands/common.js'
import { parseRuleMarkdown, parseYamlDocument } from '../schema/frontmatter.js'
import { validateDocument } from '../schema/validator.js'
import { assertUpstreamRepository } from './upstream-scope.js'

export type StagingScope = 'project' | 'upstream'

export const UPSTREAM_CANONICAL_ROOTS = [
  'catalog/rules/',
  'catalog/bundles/',
  'catalog/evidence/',
  'catalog/migrations/',
  'skills/',
] as const

export interface StageSourceRequest {
  readonly repositoryRoot: string
  readonly toolkitRoot: string
  readonly toolkitVersion: string
  readonly planPath: string
  readonly targetPath: string
  readonly content: string
  readonly scope?: StagingScope
}

function policyError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

export async function stageSourceChange(request: StageSourceRequest): Promise<ChangePlan> {
  const {
    repositoryRoot,
    toolkitRoot,
    toolkitVersion,
    planPath,
    targetPath,
    content,
    scope = 'project',
  } = request

  const normalized = normalize(targetPath).split(sep).join('/')
  const isEscaping =
    normalized.length === 0 ||
    normalized.includes('\0') ||
    normalized.includes('\\') ||
    isAbsolute(targetPath) ||
    normalized.startsWith('../') ||
    normalized === '..'

  if (scope === 'upstream') {
    await assertUpstreamRepository(repositoryRoot)

    const isWithinCanonicalRoot = UPSTREAM_CANONICAL_ROOTS.some((prefix) =>
      normalized.startsWith(prefix),
    )
    if (isEscaping || !isWithinCanonicalRoot) {
      throw policyError(
        'PATH_ESCAPES_UPSTREAM_ROOT',
        `Upstream scoped change must be within canonical roots: ${targetPath}`,
        targetPath,
      )
    }

    // Upstream schema validation
    if (normalized.startsWith('catalog/rules/') && normalized.endsWith('.md')) {
      parseRuleMarkdown(content, normalized)
    } else if (
      normalized.startsWith('catalog/bundles/') &&
      (normalized.endsWith('.yaml') || normalized.endsWith('.yml'))
    ) {
      const parsed = parseYamlDocument(content, normalized)
      validateDocument('bundle-v1', parsed, normalized)
    }
  } else {
    if (isEscaping || !normalized.startsWith('.agent-policy/')) {
      throw policyError(
        'PATH_ESCAPES_PROJECT',
        `Project scoped change must be within .agent-policy: ${targetPath}`,
        targetPath,
      )
    }

    // Project schema validation
    if (normalized.startsWith('.agent-policy/rules/') && normalized.endsWith('.md')) {
      parseRuleMarkdown(content, normalized)
    } else if (
      normalized.startsWith('.agent-policy/overlays/') &&
      (normalized.endsWith('.yaml') || normalized.endsWith('.yml'))
    ) {
      const parsed = parseYamlDocument(content, normalized)
      validateDocument('overlay-v1', parsed, normalized)
    } else if (normalized === '.agent-policy/policy.yaml') {
      const parsed = parseYamlDocument(content, normalized)
      validateDocument('project-policy-v1', parsed, normalized)
    }
  }

  const fullPath = resolve(repositoryRoot, ...normalized.split('/'))
  let exists = false
  try {
    await lstat(fullPath)
    exists = true
  } catch {
    exists = false
  }

  const sourceChange: SourceChange = {
    path: normalized,
    content,
    sha256: sha256Utf8(content),
    operation: exists ? 'replace' : 'create',
  }

  const context: CommandContext = { repositoryRoot, toolkitRoot, toolkitVersion }

  if (scope === 'upstream') {
    return saveProjectionPlan(
      context,
      'stage-source',
      planPath,
      [normalized],
      [],
      [],
      [],
      [sourceChange],
    )
  }

  const sourceOverrides = new Map<string, string>([[normalized, content]])
  const compilation = await compileCodex(context, undefined, sourceOverrides)

  return saveProjectionPlan(
    context,
    'stage-source',
    planPath,
    compilation.sourcePaths,
    compilation.artifacts,
    [],
    [],
    [sourceChange],
  )
}
