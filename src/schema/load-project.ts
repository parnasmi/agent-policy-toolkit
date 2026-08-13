import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

import { PolicyError } from '../domain/diagnostics.js'
import type { OverlayDirective, ProjectPolicy } from '../domain/policy.js'
import { parseYamlDocument } from './frontmatter.js'
import { validateDocument } from './validator.js'

interface ProjectPolicyManifest extends ProjectPolicy {
  readonly overlays?: readonly string[]
}

export interface OverlaySource extends OverlayDirective {
  readonly path: string
}

export interface ProjectPolicySource extends ProjectPolicy {
  readonly path: string
  readonly overlayPaths: readonly string[]
  readonly overlays: readonly OverlaySource[]
  readonly invariantsPath?: string
}

function policyError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

function sourcePathFor(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function resolveDeclaredFile(root: string, policyDirectory: string, declaredPath: string): string {
  if (
    declaredPath.length === 0 ||
    declaredPath.includes('\0') ||
    declaredPath.includes('\\') ||
    isAbsolute(declaredPath)
  ) {
    throw policyError('INVALID_DECLARED_PATH', `Declared path is not a relative policy path: ${declaredPath}`, declaredPath)
  }

  const normalized = normalize(declaredPath)
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw policyError('PATH_ESCAPES_PROJECT', `Declared path escapes .agent-policy: ${declaredPath}`, declaredPath)
  }

  const resolved = resolve(policyDirectory, normalized)
  const projectRelative = relative(root, resolved)
  if (projectRelative === '..' || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) {
    throw policyError('PATH_ESCAPES_PROJECT', `Declared path escapes the repository: ${declaredPath}`, declaredPath)
  }

  return resolved
}

function isWithin(parent: string, child: string): boolean {
  const childPath = relative(parent, child)
  return childPath !== '' && childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath)
}

async function readDeclaredFile(root: string, policyDirectory: string, file: string): Promise<string> {
  const sourcePath = sourcePathFor(root, file)
  try {
    const [canonicalRoot, canonicalPolicyDirectory, canonicalFile] = await Promise.all([
      realpath(root),
      realpath(policyDirectory),
      realpath(file),
    ])
    if (
      !isWithin(canonicalRoot, canonicalPolicyDirectory) ||
      !isWithin(canonicalPolicyDirectory, canonicalFile)
    ) {
      throw policyError('PATH_ESCAPES_PROJECT', `Declared path resolves outside .agent-policy: ${sourcePath}`, sourcePath)
    }

    return await readFile(canonicalFile, 'utf8')
  } catch (error) {
    if (error instanceof PolicyError) throw error
    const message = error instanceof Error ? error.message : 'Unable to read source file'
    throw policyError('MISSING_MANIFEST_REFERENCE', message, sourcePath)
  }
}

const invariantIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadRepositoryInvariants(value: unknown, path: string): readonly string[] {
  if (!isRecord(value) || !Object.keys(value).every((key) => key === 'rules') || !Array.isArray(value.rules)) {
    throw policyError(
      'INVALID_REPOSITORY_INVARIANTS',
      'Repository Invariants must be an object with a rules array',
      path,
    )
  }

  const identifiers = new Set<string>()
  return value.rules.map((rule, index) => {
    if (!isRecord(rule)) {
      throw policyError(
        'INVALID_REPOSITORY_INVARIANT',
        `Repository Invariant at /rules/${index} must be an object`,
        path,
      )
    }
    const keys = Object.keys(rule)
    if (!keys.every((key) => key === 'id' || key === 'instruction' || key === 'rationale')) {
      throw policyError(
        'INVALID_REPOSITORY_INVARIANT',
        `Repository Invariant at /rules/${index} has an unknown field`,
        path,
      )
    }
    const id = rule.id
    if (typeof id !== 'string' || !invariantIdPattern.test(id)) {
      throw policyError(
        'INVALID_REPOSITORY_INVARIANT',
        `Repository Invariant at /rules/${index}/id must be a namespaced identifier`,
        path,
      )
    }
    if (identifiers.has(id)) {
      throw policyError(
        'DUPLICATE_REPOSITORY_INVARIANT',
        `Repository Invariant identifier is duplicated: ${id}`,
        path,
      )
    }
    identifiers.add(id)

    const instruction = rule.instruction
    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw policyError(
        'INVALID_REPOSITORY_INVARIANT',
        `Repository Invariant at /rules/${index}/instruction must be a non-empty string`,
        path,
      )
    }
    if (rule.rationale !== undefined && (typeof rule.rationale !== 'string' || rule.rationale.trim().length === 0)) {
      throw policyError(
        'INVALID_REPOSITORY_INVARIANT',
        `Repository Invariant at /rules/${index}/rationale must be a non-empty string when present`,
        path,
      )
    }
    return instruction.trim()
  })
}

async function readOptionalInvariants(
  root: string,
  policyDirectory: string,
): Promise<{ readonly path?: string; readonly values: readonly string[] }> {
  const invariantsFile = resolveDeclaredFile(root, policyDirectory, 'invariants.yaml')
  try {
    await lstat(invariantsFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { values: [] }
    throw error
  }

  const path = sourcePathFor(root, invariantsFile)
  return {
    path,
    values: loadRepositoryInvariants(
      parseYamlDocument(await readDeclaredFile(root, policyDirectory, invariantsFile), path),
      path,
    ),
  }
}

/** Load the declared project policy sources without creating or modifying any consumer files. */
export async function loadProjectPolicy(root: string): Promise<ProjectPolicySource> {
  const repositoryRoot = resolve(root)
  const policyDirectory = resolve(repositoryRoot, '.agent-policy')
  const manifestFile = resolveDeclaredFile(repositoryRoot, policyDirectory, 'policy.yaml')
  const manifestPath = sourcePathFor(repositoryRoot, manifestFile)
  const manifest = validateDocument<ProjectPolicyManifest>(
    'project-policy-v1',
    parseYamlDocument(await readDeclaredFile(repositoryRoot, policyDirectory, manifestFile), manifestPath),
    manifestPath,
  )
  const invariants = await readOptionalInvariants(repositoryRoot, policyDirectory)
  const overlayPaths = manifest.overlays ?? []
  const overlays: OverlaySource[] = []

  for (const declaredPath of overlayPaths) {
    const overlayFile = resolveDeclaredFile(repositoryRoot, policyDirectory, declaredPath)
    const overlayPath = sourcePathFor(repositoryRoot, overlayFile)
    overlays.push({
      ...validateDocument<OverlayDirective>(
        'overlay-v1',
        parseYamlDocument(await readDeclaredFile(repositoryRoot, policyDirectory, overlayFile), overlayPath),
        overlayPath,
      ),
      path: overlayPath,
    })
  }

  const { overlays: _overlays, ...policy } = manifest
  return {
    ...policy,
    repositoryInvariants: invariants.values,
    path: manifestPath,
    overlayPaths,
    overlays,
    ...(invariants.path === undefined ? {} : { invariantsPath: invariants.path }),
  }
}
