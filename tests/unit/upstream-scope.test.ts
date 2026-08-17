import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'
import { isUpstreamRepository, assertUpstreamRepository } from '../../src/planner/upstream-scope.js'
import { stageSourceChange } from '../../src/planner/stage-source.js'
import { readChangePlan } from '../../src/cli/commands/common.js'

describe('Upstream Scope Staging and Gating (Slice B Task 7)', () => {
  const toolkitVersion = '0.1.0-alpha.3'
  const toolkitRoot = process.cwd()

  async function createConsumerRepo(): Promise<{ repoRoot: string; cleanup: () => Promise<void> }> {
    const parentDir = await mkdtemp(join(tmpdir(), 'agent-policy-consumer-test-'))
    const repoRoot = join(parentDir, 'repo')
    await mkdir(join(repoRoot, '.agent-policy'), { recursive: true })
    await writeFile(
      join(repoRoot, '.agent-policy', 'policy.yaml'),
      [
        'schemaVersion: v1',
        `toolkitVersion: ${toolkitVersion}`,
        'bundles: [core]',
        'targets: [codex]',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify({ name: 'consumer-application', version: '1.0.0' }, null, 2),
    )
    return {
      repoRoot,
      cleanup: async () => {
        await rm(parentDir, { recursive: true, force: true })
      },
    }
  }

  describe('isUpstreamRepository & assertUpstreamRepository', () => {
    it('returns true and does not throw in the actual toolkit repo root', async () => {
      expect(await isUpstreamRepository(toolkitRoot)).toBe(true)
      await expect(assertUpstreamRepository(toolkitRoot)).resolves.toBeUndefined()
    })

    it('returns false and throws NOT_UPSTREAM_REPOSITORY in a consumer repository fixture', async () => {
      const { repoRoot, cleanup } = await createConsumerRepo()
      try {
        expect(await isUpstreamRepository(repoRoot)).toBe(false)
        await expect(assertUpstreamRepository(repoRoot)).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'NOT_UPSTREAM_REPOSITORY')
        })
      } finally {
        await cleanup()
      }
    })

    it('returns false when catalog exists but package.json has a non-toolkit name', async () => {
      const parentDir = await mkdtemp(join(tmpdir(), 'agent-policy-fake-upstream-'))
      try {
        await mkdir(join(parentDir, 'catalog'), { recursive: true })
        await writeFile(
          join(parentDir, 'package.json'),
          JSON.stringify({ name: 'some-other-package' }),
        )
        expect(await isUpstreamRepository(parentDir)).toBe(false)
        await expect(assertUpstreamRepository(parentDir)).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'NOT_UPSTREAM_REPOSITORY')
        })
      } finally {
        await rm(parentDir, { recursive: true, force: true })
      }
    })

    it('returns false when package.json has toolkit name but catalog directory is missing', async () => {
      const parentDir = await mkdtemp(join(tmpdir(), 'agent-policy-no-catalog-'))
      try {
        await writeFile(
          join(parentDir, 'package.json'),
          JSON.stringify({ name: '@agent-policy/agent-policy-toolkit' }),
        )
        expect(await isUpstreamRepository(parentDir)).toBe(false)
        await expect(assertUpstreamRepository(parentDir)).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'NOT_UPSTREAM_REPOSITORY')
        })
      } finally {
        await rm(parentDir, { recursive: true, force: true })
      }
    })
  })

  describe('stageSourceChange with scope: upstream in consumer repository', () => {
    it('fails with NOT_UPSTREAM_REPOSITORY when staging in a consumer repository', async () => {
      const { repoRoot, cleanup } = await createConsumerRepo()
      try {
        const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
        const planPath = join(planDir, 'plan.json')

        const validRuleContent = [
          '---',
          'id: "core.test-upstream-rule"',
          'status: active',
          'strength: required',
          'applicability: {}',
          'override: forbidden',
          'enforcement: prompt',
          'aliases: []',
          '---',
          '',
          '## Instruction',
          '',
          'Test instruction for upstream rule.',
          '',
          '## Rationale',
          '',
          'Test rationale for upstream rule.',
          '',
        ].join('\n')

        await expect(
          stageSourceChange({
            repositoryRoot: repoRoot,
            toolkitRoot,
            toolkitVersion,
            planPath,
            targetPath: 'catalog/rules/core/test-upstream-rule.md',
            content: validRuleContent,
            scope: 'upstream',
          }),
        ).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'NOT_UPSTREAM_REPOSITORY')
        })

        await rm(planDir, { recursive: true, force: true })
      } finally {
        await cleanup()
      }
    })
  })

  describe('stageSourceChange with scope: upstream in upstream repository', () => {
    it('stages a new shared rule in catalog/rules/core/test-rule.md, validates rule-v1, and produces an immutable ChangePlan with SourceChange', async () => {
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const planPath = join(planDir, 'plan.json')
        const targetPath = 'catalog/rules/core/test-staging-rule.md'
        const validRuleContent = [
          '---',
          'id: "core.test-staging-rule"',
          'status: active',
          'strength: required',
          'applicability: {}',
          'override: forbidden',
          'enforcement: prompt',
          'aliases: []',
          '---',
          '',
          '## Instruction',
          '',
          'Upstream rule instruction content.',
          '',
          '## Rationale',
          '',
          'Upstream rule rationale content.',
          '',
        ].join('\n')

        const plan = await stageSourceChange({
          repositoryRoot: toolkitRoot,
          toolkitRoot,
          toolkitVersion,
          planPath,
          targetPath,
          content: validRuleContent,
          scope: 'upstream',
        })

        expect(plan.sourceChanges).toBeDefined()
        expect(plan.sourceChanges?.length).toBe(1)
        const change = plan.sourceChanges![0]
        expect(change.path).toBe(targetPath)
        expect(change.operation).toBe('create')
        expect(change.content).toBe(validRuleContent)

        // Verify plan can be loaded and hash-validated
        const loadedPlan = await readChangePlan(toolkitRoot, planPath)
        expect(loadedPlan.planHash).toBe(plan.planHash)
        expect(loadedPlan.sourceChanges?.[0].path).toBe(targetPath)
        expect(loadedPlan.desiredArtifacts).toEqual([])
      } finally {
        await rm(planDir, { recursive: true, force: true })
      }
    })

    it('validates rule-v1 schema and rejects invalid upstream rule content', async () => {
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const planPath = join(planDir, 'plan-invalid-rule.json')
        const targetPath = 'catalog/rules/core/test-invalid.md'
        const invalidRuleContent = [
          '---',
          'id: "invalid-id-without-dot"',
          'status: active',
          '---',
          '',
          '## Instruction',
          '',
          'Instruction.',
          '',
          '## Rationale',
          '',
          'Rationale.',
          '',
        ].join('\n')

        await expect(
          stageSourceChange({
            repositoryRoot: toolkitRoot,
            toolkitRoot,
            toolkitVersion,
            planPath,
            targetPath,
            content: invalidRuleContent,
            scope: 'upstream',
          }),
        ).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'SCHEMA_VALIDATION')
        })
      } finally {
        await rm(planDir, { recursive: true, force: true })
      }
    })

    it('stages a new bundle in catalog/bundles/test-bundle.yaml, validates bundle-v1, and produces an immutable ChangePlan', async () => {
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const planPath = join(planDir, 'plan-bundle.json')
        const targetPath = 'catalog/bundles/test-bundle.yaml'
        const validBundleContent = [
          'id: "test-bundle"',
          'description: "A test bundle for upstream staging."',
          'members:',
          '  - "core.test-staging-rule"',
          'applicability: {}',
          'dependencies: []',
          '',
        ].join('\n')

        const plan = await stageSourceChange({
          repositoryRoot: toolkitRoot,
          toolkitRoot,
          toolkitVersion,
          planPath,
          targetPath,
          content: validBundleContent,
          scope: 'upstream',
        })

        expect(plan.sourceChanges).toBeDefined()
        expect(plan.sourceChanges?.length).toBe(1)
        const change = plan.sourceChanges![0]
        expect(change.path).toBe(targetPath)
        expect(change.operation).toBe('create')
        expect(change.content).toBe(validBundleContent)

        const loadedPlan = await readChangePlan(toolkitRoot, planPath)
        expect(loadedPlan.planHash).toBe(plan.planHash)
        expect(loadedPlan.sourceChanges?.[0].path).toBe(targetPath)
      } finally {
        await rm(planDir, { recursive: true, force: true })
      }
    })

    it('validates bundle-v1 schema and rejects invalid upstream bundle content', async () => {
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const planPath = join(planDir, 'plan-invalid-bundle.json')
        const targetPath = 'catalog/bundles/invalid-bundle.yaml'
        const invalidBundleContent = [
          'id: "INVALID_UPPERCASE"',
          'description: "Missing required fields."',
          '',
        ].join('\n')

        await expect(
          stageSourceChange({
            repositoryRoot: toolkitRoot,
            toolkitRoot,
            toolkitVersion,
            planPath,
            targetPath,
            content: invalidBundleContent,
            scope: 'upstream',
          }),
        ).rejects.toSatisfy((error: unknown) => {
          return error instanceof PolicyError && error.diagnostics.some((d) => d.code === 'SCHEMA_VALIDATION')
        })
      } finally {
        await rm(planDir, { recursive: true, force: true })
      }
    })

    it('fails with PATH_ESCAPES_UPSTREAM_ROOT when target path is outside canonical upstream roots', async () => {
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const testCases = [
          'src/foo.ts',
          '.agent-policy/policy.yaml',
          '../outside.md',
          'catalog/other/test.md',
          'package.json',
          'README.md',
        ]

        for (const targetPath of testCases) {
          await expect(
            stageSourceChange({
              repositoryRoot: toolkitRoot,
              toolkitRoot,
              toolkitVersion,
              planPath: join(planDir, `plan-${targetPath.replace(/[^a-zA-Z0-9]/g, '_')}.json`),
              targetPath,
              content: 'dummy content',
              scope: 'upstream',
            }),
          ).rejects.toSatisfy((error: unknown) => {
            return (
              error instanceof PolicyError &&
              error.diagnostics.some((d) => d.code === 'PATH_ESCAPES_UPSTREAM_ROOT')
            )
          })
        }
      } finally {
        await rm(planDir, { recursive: true, force: true })
      }
    })
  })

  describe('stageSourceChange with scope: project', () => {
    it('enforces .agent-policy/ confinement and rejects paths outside .agent-policy/', async () => {
      const { repoRoot, cleanup } = await createConsumerRepo()
      const planDir = await mkdtemp(join(tmpdir(), 'agent-policy-plan-dir-'))
      try {
        const testCases = [
          'src/foo.ts',
          'catalog/rules/core/test.md',
          '../outside.md',
          'package.json',
        ]

        for (const targetPath of testCases) {
          await expect(
            stageSourceChange({
              repositoryRoot: repoRoot,
              toolkitRoot,
              toolkitVersion,
              planPath: join(planDir, `plan-${targetPath.replace(/[^a-zA-Z0-9]/g, '_')}.json`),
              targetPath,
              content: 'dummy content',
              scope: 'project',
            }),
          ).rejects.toSatisfy((error: unknown) => {
            return (
              error instanceof PolicyError &&
              error.diagnostics.some((d) => d.code === 'PATH_ESCAPES_PROJECT')
            )
          })
        }
      } finally {
        await rm(planDir, { recursive: true, force: true })
        await cleanup()
      }
    })
  })
})
