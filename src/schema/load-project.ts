import { readFile } from 'node:fs/promises'
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

async function readDeclaredFile(root: string, file: string): Promise<string> {
  const sourcePath = sourcePathFor(root, file)
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read source file'
    throw policyError('MISSING_MANIFEST_REFERENCE', message, sourcePath)
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
    parseYamlDocument(await readDeclaredFile(repositoryRoot, manifestFile), manifestPath),
    manifestPath,
  )
  const overlayPaths = manifest.overlays ?? []
  const overlays: OverlaySource[] = []

  for (const declaredPath of overlayPaths) {
    const overlayFile = resolveDeclaredFile(repositoryRoot, policyDirectory, declaredPath)
    const overlayPath = sourcePathFor(repositoryRoot, overlayFile)
    overlays.push({
      ...validateDocument<OverlayDirective>(
        'overlay-v1',
        parseYamlDocument(await readDeclaredFile(repositoryRoot, overlayFile), overlayPath),
        overlayPath,
      ),
      path: overlayPath,
    })
  }

  const { overlays: _overlays, ...policy } = manifest
  return { ...policy, path: manifestPath, overlayPaths, overlays }
}
