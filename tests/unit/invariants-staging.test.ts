import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parse } from "yaml"
import { describe, expect, it } from "vitest"

import { PolicyError } from "../../src/domain/diagnostics.js"
import { stageAddInvariant, stageRemoveInvariant } from "../../src/planner/stage-invariants.js"
import { stageSourceChange } from "../../src/planner/stage-source.js"
import { readChangePlan } from "../../src/cli/commands/common.js"

describe("Invariant and Rule Staging (Slice B Task 6)", () => {
  const toolkitVersion = '0.1.0-alpha.3'
  const toolkitRoot = process.cwd()

  async function createInitializedRepo(): Promise<{ repoRoot: string; cleanup: () => Promise<void> }> {
    const parentDir = await mkdtemp(join(tmpdir(), "agent-policy-invariants-test-"))
    const repoRoot = join(parentDir, "repo")
    await mkdir(join(repoRoot, ".agent-policy"), { recursive: true })
    await writeFile(
      join(repoRoot, ".agent-policy", "policy.yaml"),
      [
        "schemaVersion: v1",
        `toolkitVersion: ${toolkitVersion}`,
        "bundles: [core]",
        "targets: [codex]",
        "",
      ].join("\n"),
    )
    return {
      repoRoot,
      cleanup: async () => {
        await rm(parentDir, { recursive: true, force: true })
      },
    }
  }

  it("stages a new invariant rule with spec, producing an immutable ChangePlan with rule and invariants.yaml SourceChanges and Codex projection in AGENTS.md", async () => {
    const { repoRoot, cleanup } = await createInitializedRepo()
    try {
      const planDir = await mkdtemp(join(tmpdir(), "agent-policy-plan-dir-"))
      const planPath = join(planDir, "plan.json")

      const ruleSpec = {
        id: "tms.issue-tracker",
        status: "active" as const,
        strength: "required" as const,
        applicability: {},
        override: "forbidden" as const,
        enforcement: "prompt" as const,
        aliases: [],
        instruction: "Issues and PRDs are tracked as local Markdown files under \`.scratch/\`; pull requests are not a triage surface. See \`docs/agents/issue-tracker.md\`.",
        rationale: "Local markdown files keep issue tracking reviewable and offline-first.",
      }

      const plan = await stageAddInvariant({
        repositoryRoot: repoRoot,
        toolkitRoot,
        toolkitVersion,
        planPath,
        ruleId: "tms.issue-tracker",
        spec: ruleSpec,
      })

      // Verify immutable plan was written and can be read/validated
      const loadedPlan = await readChangePlan(repoRoot, planPath)
      expect(loadedPlan.planHash).toBe(plan.planHash)
      expect(loadedPlan.sourceChanges).toBeDefined()

      // Source changes must contain rule markdown and invariants.yaml
      const ruleChange = loadedPlan.sourceChanges?.find((c) => c.path === ".agent-policy/rules/tms/issue-tracker.md")
      expect(ruleChange).toBeDefined()
      expect(ruleChange?.operation).toBe("create")
      expect(ruleChange?.content).toContain("id: \"tms.issue-tracker\"")
      expect(ruleChange?.content).toContain("## Instruction")
      expect(ruleChange?.content).toContain(ruleSpec.instruction)
      expect(ruleChange?.content).toContain("## Rationale")
      expect(ruleChange?.content).toContain(ruleSpec.rationale)

      const invariantsChange = loadedPlan.sourceChanges?.find((c) => c.path === ".agent-policy/invariants.yaml")
      expect(invariantsChange).toBeDefined()
      expect(invariantsChange?.operation).toBe("create")
      const parsedInvariants = parse(invariantsChange!.content) as { rules: string[] }
      expect(parsedInvariants.rules).toEqual(["tms.issue-tracker"])

      // Desired artifacts must include AGENTS.md with ## Repository invariants section containing the instruction
      const agentsArtifact = loadedPlan.desiredArtifacts.find((a) => a.path === "AGENTS.md")
      expect(agentsArtifact).toBeDefined()
      expect(agentsArtifact?.content).toContain("## Repository invariants")
      expect(agentsArtifact?.content).toContain(ruleSpec.instruction)

      await rm(planDir, { recursive: true, force: true })
    } finally {
      await cleanup()
    }
  })

  it("removes an invariant rule ID from invariants.yaml while preserving the underlying rule file", async () => {
    const { repoRoot, cleanup } = await createInitializedRepo()
    try {
      // First create on disk: the rule file and invariants.yaml
      await mkdir(join(repoRoot, ".agent-policy", "rules", "tms"), { recursive: true })
      const ruleContent = [
        "---",
        "id: \"tms.issue-tracker\"",
        "status: \"active\"",
        "strength: \"required\"",
        "applicability: {}",
        "override: \"forbidden\"",
        "enforcement: \"prompt\"",
        "aliases: []",
        "---",
        "## Instruction",
        "",
        "Issues and PRDs are tracked as local Markdown files under \`.scratch/\`.",
        "",
        "## Rationale",
        "",
        "Local markdown files keep issue tracking in-repo.",
        "",
      ].join("\n")
      await writeFile(join(repoRoot, ".agent-policy", "rules", "tms", "issue-tracker.md"), ruleContent)
      await writeFile(join(repoRoot, ".agent-policy", "invariants.yaml"), "rules:\n  - tms.issue-tracker\n")

      const planDir = await mkdtemp(join(tmpdir(), "agent-policy-plan-dir-"))
      const planPath = join(planDir, "plan-remove.json")

      const plan = await stageRemoveInvariant({
        repositoryRoot: repoRoot,
        toolkitRoot,
        toolkitVersion,
        planPath,
        ruleId: "tms.issue-tracker",
      })

      const loadedPlan = await readChangePlan(repoRoot, planPath)
      expect(loadedPlan.planHash).toBe(plan.planHash)

      // invariants.yaml source change should have empty rules or without tms.issue-tracker
      const invariantsChange = loadedPlan.sourceChanges?.find((c) => c.path === ".agent-policy/invariants.yaml")
      expect(invariantsChange).toBeDefined()
      expect(invariantsChange?.operation).toBe("replace")
      const parsedInvariants = parse(invariantsChange!.content) as { rules: string[] }
      expect(parsedInvariants.rules).toEqual([])

      // Rule file should NOT be in source changes or removals
      expect(loadedPlan.sourceChanges?.some((c) => c.path === ".agent-policy/rules/tms/issue-tracker.md")).toBe(false)
      expect(loadedPlan.removals.includes(".agent-policy/rules/tms/issue-tracker.md")).toBe(false)

      // AGENTS.md should no longer have the repository invariants section
      const agentsArtifact = loadedPlan.desiredArtifacts.find((a) => a.path === "AGENTS.md")
      expect(agentsArtifact).toBeDefined()
      expect(agentsArtifact?.content).not.toContain("## Repository invariants")
      expect(agentsArtifact?.content).not.toContain("Issues and PRDs are tracked as local Markdown files under \`.scratch/\`.")

      await rm(planDir, { recursive: true, force: true })
    } finally {
      await cleanup()
    }
  })

  it("stages generic source changes with schema validation and scope confinement", async () => {
    const { repoRoot, cleanup } = await createInitializedRepo()
    try {
      const planDir = await mkdtemp(join(tmpdir(), "agent-policy-plan-dir-"))
      const planPath = join(planDir, "plan-source.json")

      const validRuleContent = [
        "---",
        "id: \"tms.issue-tracker\"",
        "status: \"active\"",
        "strength: \"required\"",
        "applicability: {}",
        "override: \"forbidden\"",
        "enforcement: \"prompt\"",
        "aliases: []",
        "---",
        "## Instruction",
        "",
        "Issues and PRDs are tracked as local Markdown files.",
        "",
        "## Rationale",
        "",
        "Local markdown files keep issue tracking in-repo.",
        "",
      ].join("\n")

      // 1. Stage a rule file under .agent-policy/rules/
      const rulePlan = await stageSourceChange({
        repositoryRoot: repoRoot,
        toolkitRoot,
        toolkitVersion,
        planPath,
        targetPath: ".agent-policy/rules/tms/issue-tracker.md",
        content: validRuleContent,
        scope: "project",
      })
      expect(rulePlan.sourceChanges?.some((c) => c.path === ".agent-policy/rules/tms/issue-tracker.md")).toBe(true)

      // 2. Stage an overlay file under .agent-policy/overlays/
      const validOverlayContent = [
        "ruleId: testing.change-driven-coverage",
        "operation: addendum",
        "reason: Custom repository addendum.",
        "content: Additional repository requirement.",
        "",
      ].join("\n")

      const overlayPlanPath = join(planDir, "plan-overlay.json")
      const overlayPlan = await stageSourceChange({
        repositoryRoot: repoRoot,
        toolkitRoot,
        toolkitVersion,
        planPath: overlayPlanPath,
        targetPath: ".agent-policy/overlays/custom.yaml",
        content: validOverlayContent,
        scope: "project",
      })
      expect(overlayPlan.sourceChanges?.some((c) => c.path === ".agent-policy/overlays/custom.yaml")).toBe(true)

      // 3. Fails if invalid rule content
      const invalidRuleContent = [
        "---",
        "id: invalid-non-namespaced",
        "status: active",
        "---",
        "## Instruction\n\nFoo\n",
      ].join("\n")

      await expect(
        stageSourceChange({
          repositoryRoot: repoRoot,
          toolkitRoot,
          toolkitVersion,
          planPath: join(planDir, "plan-invalid.json"),
          targetPath: ".agent-policy/rules/tms/invalid.md",
          content: invalidRuleContent,
          scope: "project",
        }),
      ).rejects.toThrow(PolicyError)

      // 4. Fails if path escapes .agent-policy/ when in project scope
      await expect(
        stageSourceChange({
          repositoryRoot: repoRoot,
          toolkitRoot,
          toolkitVersion,
          planPath: join(planDir, "plan-escapes.json"),
          targetPath: "src/escaped.md",
          content: validRuleContent,
          scope: "project",
        }),
      ).rejects.toThrow(PolicyError)

      await expect(
        stageSourceChange({
          repositoryRoot: repoRoot,
          toolkitRoot,
          toolkitVersion,
          planPath: join(planDir, "plan-escapes-2.json"),
          targetPath: ".agent-policy/../outside.md",
          content: validRuleContent,
          scope: "project",
        }),
      ).rejects.toThrow(PolicyError)

      await rm(planDir, { recursive: true, force: true })
    } finally {
      await cleanup()
    }
  })
})
