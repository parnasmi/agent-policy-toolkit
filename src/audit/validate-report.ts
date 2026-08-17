import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

import type { ClassificationReport } from '../domain/audit.js'
import { PolicyError } from '../domain/diagnostics.js'
import { sha256Utf8 } from '../planner/hash.js'
import { validateDocument } from '../schema/validator.js'

function policyError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

interface CachedFile {
  readonly content: string
  readonly sha: string
  readonly lines: readonly string[]
}

export async function validateClassificationReport(
  repositoryRoot: string,
  reportContent: string,
): Promise<ClassificationReport> {
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

  let parsed: unknown
  try {
    parsed = JSON.parse(reportContent)
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw policyError(
      'INVALID_REPORT_JSON',
      error instanceof Error ? error.message : 'Invalid classification report JSON',
      'classification-report.json',
    )
  }

  const report = validateDocument<ClassificationReport>(
    'classification-report-v1',
    parsed,
    'classification-report.json',
  )

  const sourcePaths = new Set<string>()
  for (const file of report.scannedFiles) {
    sourcePaths.add(file)
  }
  for (const finding of report.findings) {
    sourcePaths.add(finding.sourcePath)
  }

  const fileCache = new Map<string, CachedFile>()

  for (const sourcePath of sourcePaths) {
    if (
      sourcePath.length === 0 ||
      sourcePath.includes('\0') ||
      sourcePath.includes('\\') ||
      isAbsolute(sourcePath)
    ) {
      throw policyError(
        'INVALID_DECLARED_PATH',
        `Source path is invalid: ${sourcePath}`,
        sourcePath,
      )
    }

    const normalizedDeclared = normalize(sourcePath)
    if (
      normalizedDeclared === '..' ||
      normalizedDeclared.startsWith(`..${sep}`) ||
      normalizedDeclared.startsWith('../')
    ) {
      throw policyError(
        'PATH_ESCAPES_PROJECT',
        `Source path escapes repository root: ${sourcePath}`,
        sourcePath,
      )
    }

    const resolvedPath = resolve(root, normalizedDeclared)
    const relFromRoot = relative(root, resolvedPath)
    if (
      relFromRoot === '..' ||
      relFromRoot.startsWith(`..${sep}`) ||
      isAbsolute(relFromRoot)
    ) {
      throw policyError(
        'PATH_ESCAPES_PROJECT',
        `Source path escapes repository root: ${sourcePath}`,
        sourcePath,
      )
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
          `Source path escapes repository root: ${sourcePath}`,
          sourcePath,
        )
      }
      fileContent = await readFile(canonicalFile, 'utf8')
    } catch (error) {
      if (error instanceof PolicyError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw policyError(
          'MISSING_SOURCE_FILE',
          `Referenced source file not found: ${sourcePath}`,
          sourcePath,
        )
      }
      throw error
    }

    const sha = sha256Utf8(fileContent)
    const lines = fileContent.split(/\r?\n/)
    fileCache.set(sourcePath, { content: fileContent, sha, lines })
  }

  for (const finding of report.findings) {
    const cached = fileCache.get(finding.sourcePath)
    if (cached === undefined) {
      throw policyError(
        'MISSING_SOURCE_FILE',
        `Referenced source file not found: ${finding.sourcePath}`,
        finding.sourcePath,
      )
    }

    if (cached.sha !== finding.sourceSha256) {
      throw policyError(
        'STALE_REPORT_SOURCE_HASH',
        `Source file hash on disk (${cached.sha}) does not match finding sourceSha256 (${finding.sourceSha256}) for ${finding.sourcePath}`,
        finding.sourcePath,
      )
    }

    if (
      finding.lineRange.start < 1 ||
      finding.lineRange.start > finding.lineRange.end ||
      finding.lineRange.end > cached.lines.length
    ) {
      throw policyError(
        'INVALID_LINE_RANGE',
        `Line range [${finding.lineRange.start}, ${finding.lineRange.end}] is invalid for ${finding.sourcePath} (${cached.lines.length} total lines) in finding ${finding.id}`,
        finding.sourcePath,
      )
    }

    const expectedSlice = cached.lines
      .slice(finding.lineRange.start - 1, finding.lineRange.end)
      .join('\n')
    const normalizedSnippet = finding.snippet.replace(/\r\n/g, '\n')

    if (expectedSlice !== normalizedSnippet) {
      throw policyError(
        'REPORT_SNIPPET_MISMATCH',
        `Snippet in finding ${finding.id} does not match content in ${finding.sourcePath} at lines ${finding.lineRange.start}-${finding.lineRange.end}`,
        finding.sourcePath,
      )
    }
  }

  return report
}
