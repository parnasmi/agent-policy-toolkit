import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateClassificationReport } from '../../src/audit/validate-report.js'
import type { ClassificationReport } from '../../src/domain/audit.js'
import { PolicyError } from '../../src/domain/diagnostics.js'
import { sha256Utf8 } from '../../src/planner/hash.js'

describe('Classification report validator (src/audit/validate-report.ts)', () => {
  it('validates a valid classification report conforming to schema with matching snippets and hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const agentsContent = [
      '# Project Guidelines',
      '',
      '## Core Principle',
      'Make the smallest correct change.',
      '',
      '## Local Invariant',
      'Use pnpm instead of npm.',
      '',
    ].join('\n')

    await writeFile(join(root, 'AGENTS.md'), agentsContent, 'utf8')
    const sha = sha256Utf8(agentsContent)

    const validReport: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 3, end: 4 },
          snippet: '## Core Principle\nMake the smallest correct change.',
          classification: 'shared-core',
          rationale: 'Fundamental cross-project instruction.',
          suggestedAction: 'export-upstream-proposal',
          evidence: {
            type: 'cross-project-failure',
            summary: 'Observed scope creep across multiple repos.',
          },
        },
        {
          id: 'finding-2',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 6, end: 7 },
          snippet: '## Local Invariant\nUse pnpm instead of npm.',
          classification: 'repository-invariant',
          rationale: 'Repository consistency requirement.',
          suggestedAction: 'stage-invariant',
          suggestedDestination: '.agent-policy/rules/repository/package-manager.md',
          evidence: {
            type: 'architecture-decision',
            summary: 'Documented in ADR-0010.',
            references: ['docs/adr/0010.md'],
          },
        },
      ],
    }

    const validated = await validateClassificationReport(root, JSON.stringify(validReport))
    expect(validated).toEqual(validReport)
  })

  it('handles CRLF line endings in file content and normalizes snippet comparison', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const crlfContent = '# Title\r\n\r\nLine three\r\nLine four\r\n'
    await writeFile(join(root, 'AGENTS.md'), crlfContent, 'utf8')
    const sha = sha256Utf8(crlfContent)

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 3, end: 4 },
          snippet: 'Line three\nLine four',
          classification: 'project-policy',
          rationale: 'Project guideline.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    const validated = await validateClassificationReport(root, JSON.stringify(report))
    expect(validated).toEqual(report)
  })

  it('rejects report when a referenced source file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['missing-file.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'missing-file.md',
          sourceSha256: 'a'.repeat(64),
          lineRange: { start: 1, end: 2 },
          snippet: 'Some text',
          classification: 'project-policy',
          rationale: 'Some rationale',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'MISSING_SOURCE_FILE',
        }),
      ],
    })
  })

  it('rejects report when on-disk file SHA256 does not match finding sourceSha256 (stale report / drift)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const initialContent = 'Line 1\nLine 2\nLine 3\n'
    await writeFile(join(root, 'AGENTS.md'), initialContent, 'utf8')
    const staleSha = 'f'.repeat(64)

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: staleSha,
          lineRange: { start: 1, end: 2 },
          snippet: 'Line 1\nLine 2',
          classification: 'project-policy',
          rationale: 'Project policy.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'STALE_REPORT_SOURCE_HASH',
        }),
      ],
    })
  })

  it('rejects report when snippet does not match the file slice at [lineRange.start, lineRange.end]', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const content = 'Line 1\nLine 2\nLine 3\n'
    await writeFile(join(root, 'AGENTS.md'), content, 'utf8')
    const sha = sha256Utf8(content)

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 1, end: 2 },
          snippet: 'Different Line 1\nDifferent Line 2',
          classification: 'project-policy',
          rationale: 'Project policy.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'REPORT_SNIPPET_MISMATCH',
        }),
      ],
    })
  })

  it('rejects report when lineRange.start > lineRange.end', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const content = 'Line 1\nLine 2\nLine 3\n'
    await writeFile(join(root, 'AGENTS.md'), content, 'utf8')
    const sha = sha256Utf8(content)

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 3, end: 1 },
          snippet: 'Line 1',
          classification: 'project-policy',
          rationale: 'Project policy.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_LINE_RANGE',
        }),
      ],
    })
  })

  it('rejects report when lineRange.end > total lines', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const content = 'Line 1\nLine 2\nLine 3\n'
    await writeFile(join(root, 'AGENTS.md'), content, 'utf8')
    const sha = sha256Utf8(content)

    const report: ClassificationReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 1, end: 10 },
          snippet: 'Line 1\nLine 2\nLine 3',
          classification: 'project-policy',
          rationale: 'Project policy.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_LINE_RANGE',
        }),
      ],
    })
  })

  it('rejects report when sourcePath escapes repository root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const report = {
      schemaVersion: 'v1',
      scannedFiles: ['../outside.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: '../outside.md',
          sourceSha256: 'a'.repeat(64),
          lineRange: { start: 1, end: 2 },
          snippet: 'Escaped content',
          classification: 'project-policy',
          rationale: 'Escaping path.',
          suggestedAction: 'create-project-rule',
          evidence: {
            type: 'local-contract',
            summary: 'Local contract.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(report))).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'PATH_ESCAPES_PROJECT',
        }),
      ],
    })
  })

  it('rejects report on invalid schema properties (e.g. invalid action/evidence combinations)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    const content = 'Make the smallest correct change.\n'
    await writeFile(join(root, 'AGENTS.md'), content, 'utf8')
    const sha = sha256Utf8(content)

    // shared-core cannot map to stage-invariant (only export-upstream-proposal, discard)
    const invalidReport = {
      schemaVersion: 'v1',
      scannedFiles: ['AGENTS.md'],
      findings: [
        {
          id: 'finding-1',
          sourcePath: 'AGENTS.md',
          sourceSha256: sha,
          lineRange: { start: 1, end: 1 },
          snippet: 'Make the smallest correct change.',
          classification: 'shared-core',
          rationale: 'Core policy.',
          suggestedAction: 'stage-invariant',
          evidence: {
            type: 'cross-project-failure',
            summary: 'Observed across repos.',
          },
        },
      ],
    }

    await expect(validateClassificationReport(root, JSON.stringify(invalidReport))).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, JSON.stringify(invalidReport))).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'SCHEMA_VALIDATION',
        }),
      ]),
    })
  })

  it('rejects malformed report JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-report-'))

    await expect(validateClassificationReport(root, '{ invalid json')).rejects.toThrow(PolicyError)
    await expect(validateClassificationReport(root, '{ invalid json')).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'INVALID_REPORT_JSON',
        }),
      ],
    })
  })
})
