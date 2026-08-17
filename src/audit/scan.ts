import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

import { generatedOwnership } from '../cli/commands/common.js'
import type { AuditOutput, UnmanagedBlock } from '../domain/audit.js'
import { PolicyError } from '../domain/diagnostics.js'
import { sha256Utf8 } from '../planner/hash.js'

function policyError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

export interface ScanOptions {
  readonly paths?: readonly string[]
}

function normalizePathSeparators(path: string): string {
  return path.split(sep).join('/')
}

interface TextRegion {
  readonly startLineIdx: number
  readonly endLineIdx: number
}

function extractUnmanagedBlocksForFile(
  content: string,
  sourcePath: string,
  startIdCounter: number,
): { readonly blocks: readonly UnmanagedBlock[]; readonly nextIdCounter: number } {
  const lines = content.split(/\r?\n/)
  const sha = sha256Utf8(content)

  let managedStartIdx = -1
  let managedEndIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line !== undefined && line.includes('agent-policy:start')) {
      managedStartIdx = i
    }
    if (line !== undefined && line.includes('agent-policy:end')) {
      managedEndIdx = i
    }
  }

  const regions: TextRegion[] = []

  if (managedStartIdx !== -1 && managedEndIdx !== -1 && managedStartIdx <= managedEndIdx) {
    // Region before managed region
    if (managedStartIdx > 0) {
      regions.push({ startLineIdx: 0, endLineIdx: managedStartIdx - 1 })
    }
    // Region after managed region
    if (managedEndIdx + 1 < lines.length) {
      regions.push({ startLineIdx: managedEndIdx + 1, endLineIdx: lines.length - 1 })
    }
  } else {
    // Entire file
    regions.push({ startLineIdx: 0, endLineIdx: lines.length - 1 })
  }

  const blocks: UnmanagedBlock[] = []
  let idCounter = startIdCounter

  for (const region of regions) {
    if (region.startLineIdx > region.endLineIdx) continue

    let firstNonEmpty = -1
    for (let i = region.startLineIdx; i <= region.endLineIdx; i++) {
      const line = lines[i]
      if (line !== undefined && line.trim().length > 0) {
        firstNonEmpty = i
        break
      }
    }

    if (firstNonEmpty === -1) continue

    let lastNonEmpty = -1
    for (let i = region.endLineIdx; i >= firstNonEmpty; i--) {
      const line = lines[i]
      if (line !== undefined && line.trim().length > 0) {
        lastNonEmpty = i
        break
      }
    }

    if (lastNonEmpty === -1) continue

    const blockLines = lines.slice(firstNonEmpty, lastNonEmpty + 1)
    const blockContent = blockLines.join('\n')

    idCounter++
    blocks.push({
      id: `block-${idCounter}`,
      sourcePath,
      sourceSha256: sha,
      lineRange: {
        start: firstNonEmpty + 1,
        end: lastNonEmpty + 1,
      },
      content: blockContent,
    })
  }

  return { blocks, nextIdCounter: idCounter }
}

export async function scanUnmanagedContent(
  repositoryRoot: string,
  options?: ScanOptions,
): Promise<AuditOutput> {
  const root = resolve(repositoryRoot)
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(root)
  } catch (error) {
    throw policyError(
      'MISSING_REPOSITORY_ROOT',
      error instanceof Error ? error.message : 'Cannot resolve repository root',
      repositoryRoot,
    )
  }

  const declaredPaths = options?.paths !== undefined && options.paths.length > 0
    ? options.paths
    : ['AGENTS.md']

  const scannedFiles: string[] = []
  const unmanagedBlocks: UnmanagedBlock[] = []
  let idCounter = 0

  for (const declaredPath of declaredPaths) {
    if (
      declaredPath.length === 0 ||
      declaredPath.includes('\0') ||
      declaredPath.includes('\\')
    ) {
      throw policyError('INVALID_DECLARED_PATH', `Declared path is invalid: ${declaredPath}`, declaredPath)
    }

    const normalizedDeclared = normalize(declaredPath)
    if (
      normalizedDeclared === '..' ||
      normalizedDeclared.startsWith(`..${sep}`) ||
      normalizedDeclared.startsWith('../')
    ) {
      throw policyError(
        'PATH_ESCAPES_PROJECT',
        `Declared path escapes repository root: ${declaredPath}`,
        declaredPath,
      )
    }

    const resolvedPath = isAbsolute(declaredPath)
      ? resolve(declaredPath)
      : resolve(root, normalizedDeclared)

    const relFromRoot = relative(root, resolvedPath)
    if (
      relFromRoot === '..' ||
      relFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(relFromRoot)
    ) {
      throw policyError(
        'PATH_ESCAPES_PROJECT',
        `Declared path escapes repository root: ${declaredPath}`,
        declaredPath,
      )
    }

    const normalizedRelPath = normalizePathSeparators(relFromRoot)

    // Skip files inside .agent-policy/
    if (
      normalizedRelPath === '.agent-policy' ||
      normalizedRelPath.startsWith('.agent-policy/')
    ) {
      continue
    }

    let fileContent: string
    try {
      const canonicalFile = await realpath(resolvedPath)
      const relFromCanonical = relative(canonicalRoot, canonicalFile)
      if (
        relFromCanonical === '..' ||
        relFromCanonical.startsWith(`..${sep}`) ||
        isAbsolute(relFromCanonical)
      ) {
        throw policyError(
          'PATH_ESCAPES_PROJECT',
          `Declared path escapes repository root: ${declaredPath}`,
          declaredPath,
        )
      }
      fileContent = await readFile(canonicalFile, 'utf8')
    } catch (error) {
      if (error instanceof PolicyError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }

    // Skip fully generated files
    if (generatedOwnership(fileContent)) {
      continue
    }

    scannedFiles.push(normalizedRelPath)

    const { blocks, nextIdCounter } = extractUnmanagedBlocksForFile(
      fileContent,
      normalizedRelPath,
      idCounter,
    )
    idCounter = nextIdCounter
    unmanagedBlocks.push(...blocks)
  }

  return {
    schemaVersion: 'v1',
    scannedFiles,
    unmanagedBlocks,
  }
}
