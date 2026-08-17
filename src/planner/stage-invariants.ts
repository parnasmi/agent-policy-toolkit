import { lstat, readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { stringify } from "yaml"

import type { ChangePlan, SourceChange } from "../domain/change-plan.js"
import { PolicyError } from "../domain/diagnostics.js"
import type { RuleStatus, RuleStrength, OverridePolicy, EnforcementMode } from "../domain/policy.js"
import { sha256Utf8 } from "./hash.js"
import { compileCodex, saveProjectionPlan, type CommandContext } from "../cli/commands/common.js"
import { parseRuleMarkdown, parseYamlDocument } from "../schema/frontmatter.js"

export interface InvariantRuleSpec {
  readonly id: string
  readonly status?: RuleStatus
  readonly strength?: RuleStrength
  readonly applicability?: Readonly<Record<string, unknown>>
  readonly override?: OverridePolicy
  readonly enforcement?: EnforcementMode
  readonly aliases?: readonly string[]
  readonly instruction: string
  readonly rationale: string
  readonly title?: string
  readonly exceptions?: string
  readonly examples?: string
  readonly verification?: string
}

export interface AddInvariantRequest {
  readonly repositoryRoot: string
  readonly toolkitRoot: string
  readonly toolkitVersion: string
  readonly planPath: string
  readonly ruleId: string
  readonly spec?: InvariantRuleSpec | string
}

export interface RemoveInvariantRequest {
  readonly repositoryRoot: string
  readonly toolkitRoot: string
  readonly toolkitVersion: string
  readonly planPath: string
  readonly ruleId: string
}

const invariantIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/

function formatRuleMarkdown(spec: InvariantRuleSpec): string {
  const frontmatter = {
    id: spec.id,
    status: spec.status ?? "active",
    strength: spec.strength ?? "required",
    applicability: spec.applicability ?? {},
    override: spec.override ?? "forbidden",
    enforcement: spec.enforcement ?? "prompt",
    aliases: spec.aliases ?? [],
  }
  const lines = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "---",
    "",
    "## Instruction",
    "",
    spec.instruction.trim(),
    "",
    "## Rationale",
    "",
    spec.rationale.trim(),
  ]
  if (spec.exceptions !== undefined && spec.exceptions.trim().length > 0) {
    lines.push("", "## Exceptions", "", spec.exceptions.trim())
  }
  if (spec.examples !== undefined && spec.examples.trim().length > 0) {
    lines.push("", "## Examples", "", spec.examples.trim())
  }
  if (spec.verification !== undefined && spec.verification.trim().length > 0) {
    lines.push("", "## Verification", "", spec.verification.trim())
  }
  lines.push("")
  return lines.join("\n")
}

export async function stageAddInvariant(request: AddInvariantRequest): Promise<ChangePlan> {
  const { repositoryRoot, toolkitRoot, toolkitVersion, planPath, ruleId, spec } = request
  if (!invariantIdPattern.test(ruleId)) {
    throw new PolicyError([{
      code: "INVALID_REPOSITORY_INVARIANT",
      severity: "error",
      message: `Invalid invariant rule ID: ${ruleId}`,
      path: ".agent-policy/invariants.yaml",
    }])
  }

  const manifestPath = resolve(repositoryRoot, ".agent-policy/policy.yaml")
  try {
    await lstat(manifestPath)
  } catch {
    throw new PolicyError([{
      code: "MISSING_PROJECT_POLICY",
      severity: "error",
      message: "Project policy does not exist at .agent-policy/policy.yaml",
      path: ".agent-policy/policy.yaml",
    }])
  }

  const segments = ruleId.split(".")
  const ruleRelativePath = `.agent-policy/rules/${segments.join("/")}.md`
  const ruleDiskPath = resolve(repositoryRoot, ...ruleRelativePath.split("/"))

  let ruleContent: string
  if (spec !== undefined) {
    if (typeof spec === "string") {
      if (spec.startsWith("---")) {
        ruleContent = spec
      } else {
        const parsed = parseYamlDocument(spec, ruleRelativePath) as InvariantRuleSpec
        ruleContent = formatRuleMarkdown({ ...parsed, id: ruleId })
      }
    } else {
      ruleContent = formatRuleMarkdown({ ...spec, id: ruleId })
    }
  } else {
    try {
      ruleContent = await readFile(ruleDiskPath, "utf8")
    } catch {
      throw new PolicyError([{
        code: "MISSING_RULE_SPEC",
        severity: "error",
        message: `Rule file not found at ${ruleRelativePath} and no spec provided`,
        path: ruleRelativePath,
      }])
    }
  }

  const parsedRule = parseRuleMarkdown(ruleContent, ruleRelativePath)
  if (parsedRule.id !== ruleId) {
    throw new PolicyError([{
      code: "RULE_ID_MISMATCH",
      severity: "error",
      message: `Rule ID in spec (${parsedRule.id}) does not match requested invariant ID (${ruleId})`,
      path: ruleRelativePath,
    }])
  }

  let ruleExistsOnDisk = false
  try {
    await lstat(ruleDiskPath)
    ruleExistsOnDisk = true
  } catch {
    ruleExistsOnDisk = false
  }

  const ruleChange: SourceChange = {
    path: ruleRelativePath,
    content: ruleContent,
    sha256: sha256Utf8(ruleContent),
    operation: ruleExistsOnDisk ? "replace" : "create",
  }

  const invariantsRelativePath = ".agent-policy/invariants.yaml"
  const invariantsDiskPath = resolve(repositoryRoot, ...invariantsRelativePath.split("/"))
  let invariantsExistsOnDisk = false
  let currentInvariants: string[] = []

  try {
    const raw = await readFile(invariantsDiskPath, "utf8")
    invariantsExistsOnDisk = true
    const parsed = parseYamlDocument(raw, invariantsRelativePath) as { rules?: readonly string[] }
    if (parsed && Array.isArray(parsed.rules)) {
      currentInvariants = [...parsed.rules]
    }
  } catch {
    invariantsExistsOnDisk = false
  }

  const updatedInvariants = currentInvariants.includes(ruleId)
    ? currentInvariants
    : [...currentInvariants, ruleId]

  const invariantsContent = stringify({ rules: updatedInvariants })
  const invariantsChange: SourceChange = {
    path: invariantsRelativePath,
    content: invariantsContent,
    sha256: sha256Utf8(invariantsContent),
    operation: invariantsExistsOnDisk ? "replace" : "create",
  }

  const sourceChanges = [ruleChange, invariantsChange]
  const sourceOverrides = new Map<string, string>([
    [ruleRelativePath, ruleContent],
    [invariantsRelativePath, invariantsContent],
  ])

  const context: CommandContext = { repositoryRoot, toolkitRoot, toolkitVersion }
  const compilation = await compileCodex(context, undefined, sourceOverrides)

  return saveProjectionPlan(
    context,
    "stage-invariant",
    planPath,
    compilation.sourcePaths,
    compilation.artifacts,
    [],
    [],
    sourceChanges,
  )
}

export async function stageRemoveInvariant(request: RemoveInvariantRequest): Promise<ChangePlan> {
  const { repositoryRoot, toolkitRoot, toolkitVersion, planPath, ruleId } = request

  const invariantsRelativePath = ".agent-policy/invariants.yaml"
  const invariantsDiskPath = resolve(repositoryRoot, ...invariantsRelativePath.split("/"))

  let raw: string
  try {
    raw = await readFile(invariantsDiskPath, "utf8")
  } catch {
    throw new PolicyError([{
      code: "MISSING_INVARIANTS_FILE",
      severity: "error",
      message: "No invariants.yaml found in .agent-policy",
      path: invariantsRelativePath,
    }])
  }

  const parsed = parseYamlDocument(raw, invariantsRelativePath) as { rules?: readonly string[] }
  const currentInvariants = Array.isArray(parsed?.rules) ? parsed.rules : []
  const updatedInvariants = currentInvariants.filter((id) => id !== ruleId)

  const invariantsContent = stringify({ rules: updatedInvariants })
  const invariantsChange: SourceChange = {
    path: invariantsRelativePath,
    content: invariantsContent,
    sha256: sha256Utf8(invariantsContent),
    operation: "replace",
  }

  const sourceChanges = [invariantsChange]
  const sourceOverrides = new Map<string, string>([
    [invariantsRelativePath, invariantsContent],
  ])

  const context: CommandContext = { repositoryRoot, toolkitRoot, toolkitVersion }
  const compilation = await compileCodex(context, undefined, sourceOverrides)

  return saveProjectionPlan(
    context,
    "stage-invariant",
    planPath,
    compilation.sourcePaths,
    compilation.artifacts,
    [],
    [],
    sourceChanges,
  )
}
