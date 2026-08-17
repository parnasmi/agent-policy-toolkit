import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runCli, type CliIo } from '../../src/cli/main.js'
import { validateDocument } from '../../src/schema/validator.js'

describe.sequential('Slice B CLI Lifecycle Integration Tests', { timeout: 20000 }, () => {
  const toolkitVersion = '0.1.0-alpha.2'

  function createTestIo(): CliIo {
    return {
      stdout: '',
      stderr: '',
      confirm: async () => true,
      fs: {
        readFile: async (p) => readFile(p, 'utf8'),
        writeFile: async (p, c) => writeFile(p, c, 'utf8'),
        exists: async () => true,
      },
    }
  }

  async function createInitializedRepo(): Promise<{ repoRoot: string; cleanup: () => Promise<void> }> {
    const parentDir = await mkdtemp(join(tmpdir(), 'agent-policy-slice-b-test-'))
    const repoRoot = join(parentDir, 'repo')
    await mkdir(repoRoot, { recursive: true })

    // Create an unmanaged section in AGENTS.md before init
    const initialAgentsContent = [
      '# Project Guidelines',
      '',
      '## Issue Tracker Policy',
      'All issues must be tracked as markdown files in .scratch/issues.',
      '',
      '## Coding Standards',
      'Prefer pure functions and strict immutability.',
      '',
    ].join('\n')
    await writeFile(join(repoRoot, 'AGENTS.md'), initialAgentsContent)

    const prev = process.cwd()
    process.chdir(repoRoot)
    try {
      // Run init and apply
      const planPath = join(parentDir, 'init.plan.json')
      const initIo = createTestIo()
      const initExit = await runCli(
        ['init', '--target', 'codex', '--bundles', 'core,typescript', '--plan', planPath],
        initIo,
      )
      expect(initExit).toBe(0)

      const applyIo = createTestIo()
      const applyExit = await runCli(['apply', planPath, '--yes'], applyIo)
      expect(applyExit).toBe(0)
    } finally {
      process.chdir(prev)
    }

    return {
      repoRoot,
      cleanup: async () => {
        await rm(parentDir, { recursive: true, force: true })
      },
    }
  }

  describe('audit command', () => {
    it('scans unmanaged content and outputs valid audit-output-v1 JSON', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)
        const io = createTestIo()
        const exitCode = await runCli(['audit', '--format', 'json'], io)
        expect(exitCode).toBe(0)

        const parsed = JSON.parse(io.stdout) as unknown
        expect(() => validateDocument('audit-output-v1', parsed, 'audit-output.json')).not.toThrow()

        const audit = parsed as { scannedFiles: string[]; unmanagedBlocks: Array<{ content: string }> }
        expect(audit.scannedFiles).toContain('AGENTS.md')
        expect(audit.unmanagedBlocks.length).toBeGreaterThanOrEqual(1)
        expect(audit.unmanagedBlocks.some((b) => b.content.includes('Issue Tracker Policy'))).toBe(true)
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })

    it('scans explicit paths when provided via --path', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)
        await mkdir(join(repoRoot, 'docs'), { recursive: true })
        await writeFile(join(repoRoot, 'docs', 'custom-guide.md'), '# Guide\n\nCustom agent rule.\n')

        const io = createTestIo()
        const exitCode = await runCli(['audit', '--path', 'docs/custom-guide.md'], io)
        expect(exitCode).toBe(0)

        const parsed = JSON.parse(io.stdout) as { scannedFiles: string[]; unmanagedBlocks: Array<{ sourcePath: string }> }
        expect(parsed.scannedFiles).toEqual(['docs/custom-guide.md'])
        expect(parsed.unmanagedBlocks[0].sourcePath).toBe('docs/custom-guide.md')
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })
  })

  describe('validate-report command', () => {
    it('validates a correct classification report against repository on-disk state', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)

        // Get audit blocks first
        const auditIo = createTestIo()
        await runCli(['audit'], auditIo)
        const audit = JSON.parse(auditIo.stdout) as {
          unmanagedBlocks: Array<{
            id: string
            sourcePath: string
            sourceSha256: string
            lineRange: { start: number; end: number }
            content: string
          }>
        }
        const block = audit.unmanagedBlocks[0]
        expect(block).toBeDefined()

        const report = {
          schemaVersion: 'v1',
          scannedFiles: ['AGENTS.md'],
          findings: [
            {
              id: 'finding-1',
              sourcePath: block.sourcePath,
              sourceSha256: block.sourceSha256,
              lineRange: block.lineRange,
              snippet: block.content,
              classification: 'repository-invariant',
              rationale: 'Local repository-specific issue tracking workflow policy.',
              suggestedAction: 'stage-invariant',
              suggestedDestination: 'tms.issue-tracker',
              evidence: {
                type: 'architecture-decision',
                summary: 'Decision to use local scratch issues.',
              },
            },
          ],
        }

        const reportPath = join(repoRoot, 'report.json')
        await writeFile(reportPath, JSON.stringify(report, null, 2))

        const io = createTestIo()
        const exitCode = await runCli(['validate-report', reportPath], io)
        expect(exitCode).toBe(0)
        expect(io.stdout).toContain('Classification report is valid: 1 finding(s)')
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })

    it('fails when snippet does not match disk content', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)

        const auditIo = createTestIo()
        await runCli(['audit'], auditIo)
        const audit = JSON.parse(auditIo.stdout) as {
          unmanagedBlocks: Array<{
            sourcePath: string
            sourceSha256: string
            lineRange: { start: number; end: number }
          }>
        }
        const block = audit.unmanagedBlocks[0]

        const report = {
          schemaVersion: 'v1',
          scannedFiles: ['AGENTS.md'],
          findings: [
            {
              id: 'finding-1',
              sourcePath: block.sourcePath,
              sourceSha256: block.sourceSha256,
              lineRange: block.lineRange,
              snippet: 'Mismatched snippet text that does not exist in file.',
              classification: 'project-policy',
              rationale: 'Test rationale.',
              suggestedAction: 'create-project-rule',
              evidence: {
                type: 'local-contract',
                summary: 'Contract test summary.',
              },
            },
          ],
        }

        const reportPath = join(repoRoot, 'report.json')
        await writeFile(reportPath, JSON.stringify(report, null, 2))

        const io = createTestIo()
        const exitCode = await runCli(['validate-report', reportPath], io)
        expect(exitCode).toBe(1)
        expect(io.stderr).toContain('REPORT_SNIPPET_MISMATCH')
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })
  })

  describe('stage-invariant and lifecycle application', () => {
    it('stages an invariant addition, shows diff, applies to disk, and updates AGENTS.md managed region', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)
        const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-stage-inv-'))
        const planPath = join(planDir, 'add-invariant.plan.json')

        const invariantSpec = [
          '---',
          'id: "tms.issue-tracker"',
          'status: active',
          'strength: required',
          'applicability: {}',
          'override: project-overlay',
          'enforcement: prompt',
          'aliases: []',
          '---',
          '',
          '## Instruction',
          '',
          'Issues and PRDs are tracked as local Markdown files under `.scratch/`.',
          '',
          '## Rationale',
          '',
          'Local files maintain self-contained, auditable task state.',
          '',
        ].join('\n')

        const specPath = join(repoRoot, 'invariant-spec.md')
        await writeFile(specPath, invariantSpec)

        // Stage invariant addition
        const stageIo = createTestIo()
        const stageExit = await runCli(
          ['stage-invariant', '--add', 'tms.issue-tracker', '--spec', specPath, '--plan', planPath],
          stageIo,
        )
        expect(stageExit).toBe(0)
        expect(stageIo.stdout).toContain('Staged invariant addition for tms.issue-tracker')

        // Diff the plan
        const diffIo = createTestIo()
        const diffExit = await runCli(['diff', planPath], diffIo)
        expect(diffExit).toBe(0)
        expect(diffIo.stdout).toContain('.agent-policy/rules/tms/issue-tracker.md')
        expect(diffIo.stdout).toContain('.agent-policy/invariants.yaml')
        expect(diffIo.stdout).toContain('AGENTS.md')

        // Apply the plan
        const applyIo = createTestIo()
        const applyExit = await runCli(['apply', planPath, '--yes'], applyIo)
        expect(applyExit).toBe(0)

        // Verify files on disk
        const ruleContent = await readFile(join(repoRoot, '.agent-policy/rules/tms/issue-tracker.md'), 'utf8')
        expect(ruleContent).toContain('Issues and PRDs are tracked as local Markdown files')

        const invariantsContent = await readFile(join(repoRoot, '.agent-policy/invariants.yaml'), 'utf8')
        expect(invariantsContent).toContain('tms.issue-tracker')

        const agentsMd = await readFile(join(repoRoot, 'AGENTS.md'), 'utf8')
        expect(agentsMd).toContain('## Repository invariants')
        expect(agentsMd).toContain('Issues and PRDs are tracked as local Markdown files')

        // Stage invariant removal
        const removePlanPath = join(planDir, 'remove-invariant.plan.json')
        const removeStageIo = createTestIo()
        const removeStageExit = await runCli(
          ['stage-invariant', '--remove', 'tms.issue-tracker', '--plan', removePlanPath],
          removeStageIo,
        )
        expect(removeStageExit).toBe(0)

        const removeApplyIo = createTestIo()
        const removeApplyExit = await runCli(['apply', removePlanPath, '--yes'], removeApplyIo)
        expect(removeApplyExit).toBe(0)

        // Invariants.yaml is updated
        const updatedInvariants = await readFile(join(repoRoot, '.agent-policy/invariants.yaml'), 'utf8')
        expect(updatedInvariants).not.toContain('tms.issue-tracker')

        // Rule file is PRESERVED on disk
        const preservedRule = await readFile(join(repoRoot, '.agent-policy/rules/tms/issue-tracker.md'), 'utf8')
        expect(preservedRule).toBeDefined()

        await rm(planDir, { recursive: true, force: true })
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })
  })

  describe('stage-source command', () => {
    it('stages a project overlay directive and applies it cleanly', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)
        const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-stage-src-'))
        const planPath = join(planDir, 'stage-source.plan.json')

        const overlaySpec = [
          'ruleId: "typescript.reuse-source-types"',
          'operation: addendum',
          'reason: "Project requires strict domain type sharing."',
          'content: "Always import shared contracts from @domain/contracts."',
          '',
        ].join('\n')

        const specPath = join(repoRoot, 'overlay-spec.yaml')
        await writeFile(specPath, overlaySpec)

        const stageIo = createTestIo()
        const stageExit = await runCli(
          [
            'stage-source',
            '--target-path',
            '.agent-policy/overlays/reuse-source-types.yaml',
            '--spec',
            specPath,
            '--plan',
            planPath,
          ],
          stageIo,
        )
        expect(stageExit).toBe(0)

        const applyIo = createTestIo()
        const applyExit = await runCli(['apply', planPath, '--yes'], applyIo)
        expect(applyExit).toBe(0)

        const overlayOnDisk = await readFile(
          join(repoRoot, '.agent-policy/overlays/reuse-source-types.yaml'),
          'utf8',
        )
        expect(overlayOnDisk).toContain('typescript.reuse-source-types')

        await rm(planDir, { recursive: true, force: true })
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })
  })

  describe('export-proposal command', () => {
    it('validates and exports a portable upstream proposal YAML document', async () => {
      const { repoRoot, cleanup } = await createInitializedRepo()
      const prevCwd = process.cwd()
      try {
        process.chdir(repoRoot)

        const proposalSpec = {
          schemaVersion: 'v1',
          behavioralRole: 'shared-core',
          proposedDestination: {
            kind: 'rule',
            targetId: 'core.verify-diff-boundaries',
          },
          origin: {
            findingId: 'block-1',
            sourcePath: 'AGENTS.md',
            sourceSha256: '4b825dc6394593457a1e0915f0eb5e61a4e2efd9a74c76b97b6e927c348f95c1',
            lineRange: { start: 1, end: 10 },
          },
          semanticChange: {
            summary: 'Verify git diff boundaries',
            instruction: 'Check that only task-related files were changed.',
            rationale: 'Prevents accidental modifications.',
          },
          ruleMetadata: {
            strength: 'required',
            applicability: {},
            override: 'explicit-task',
            enforcement: 'prompt',
            aliases: [],
          },
          evidence: {
            type: 'cross-project-failure',
            summary: 'Observed unintended configuration edits in multiple projects.',
            references: ['docs/incident-1.md'],
          },
          proposer: {
            repository: 'paynet/infokiosk/tms-frontend',
            context: 'Classification audit finding',
          },
        }

        const specPath = join(repoRoot, 'proposal-spec.json')
        await writeFile(specPath, JSON.stringify(proposalSpec, null, 2))

        const outPath = join(repoRoot, 'exported-proposal.yaml')
        const io = createTestIo()
        const exitCode = await runCli(
          ['export-proposal', '--spec', specPath, '--output', outPath],
          io,
        )
        expect(exitCode).toBe(0)
        expect(io.stdout).toContain('Exported proposal for core.verify-diff-boundaries')

        const exportedContent = await readFile(outPath, 'utf8')
        expect(exportedContent).toContain('# Upstream Policy Proposal')
        expect(exportedContent).toContain('# Schema: proposal-v1')
        expect(exportedContent).toContain('core.verify-diff-boundaries')
      } finally {
        process.chdir(prevCwd)
        await cleanup()
      }
    })
  })
})
