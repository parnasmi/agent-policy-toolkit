import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import { isAbsolute, normalize, relative, resolve, sep } from "node:path"

import { PolicyError } from "../domain/diagnostics.js"
import type { OverlayDirective, ProjectPolicy } from "../domain/policy.js"
import type { ProjectPolicyLock } from "./project-types.js"
import { parseRuleMarkdown, parseYamlDocument, type RuleSource } from "./frontmatter.js"
import { validateDocument } from "./validator.js"
import { hasValidPolicyLockHash } from "../planner/policy-lock.js"

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
  readonly invariantRuleIds?: readonly string[]
  readonly rulePaths: readonly string[]
  readonly rules: readonly RuleSource[]
}

export interface LoadProjectPolicyOptions {
  readonly manifestOverride?: string
  readonly sourceOverrides?: ReadonlyMap<string, string>
}

/** Load the generated lock when present; lock bytes are never treated as canonical policy. */
export async function loadPolicyLock(root: string): Promise<ProjectPolicyLock | undefined> {
  const repositoryRoot = resolve(root)
  const policyDirectory = resolve(repositoryRoot, ".agent-policy")
  const lockFile = resolveDeclaredFile(repositoryRoot, policyDirectory, "policy.lock.json")
  try {
    await lstat(lockFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }

  const path = sourcePathFor(repositoryRoot, lockFile)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readDeclaredFile(repositoryRoot, policyDirectory, lockFile))
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw policyError("INVALID_POLICY_LOCK", error instanceof Error ? error.message : "Invalid policy lock JSON", path)
  }
  const lock = validateDocument<ProjectPolicyLock>("policy-lock-v1", parsed, path)
  if (!hasValidPolicyLockHash(await readDeclaredFile(repositoryRoot, policyDirectory, lockFile))) {
    throw policyError("INVALID_POLICY_LOCK_HASH", "Generated policy lock hash does not match its contents", path)
  }
  return lock
}

function policyError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: "error", message, path }])
}

function sourcePathFor(root: string, file: string): string {
  return relative(root, file).split(sep).join("/")
}

function resolveDeclaredFile(root: string, policyDirectory: string, declaredPath: string): string {
  if (
    declaredPath.length === 0 ||
    declaredPath.includes("\0") ||
    declaredPath.includes("\\") ||
    isAbsolute(declaredPath)
  ) {
    throw policyError("INVALID_DECLARED_PATH", `Declared path is not a relative policy path: ${declaredPath}`, declaredPath)
  }

  const normalized = normalize(declaredPath)
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) {
    throw policyError("PATH_ESCAPES_PROJECT", `Declared path escapes .agent-policy: ${declaredPath}`, declaredPath)
  }

  const resolved = resolve(policyDirectory, normalized)
  const projectRelative = relative(root, resolved)
  if (projectRelative === ".." || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) {
    throw policyError("PATH_ESCAPES_PROJECT", `Declared path escapes the repository: ${declaredPath}`, declaredPath)
  }

  return resolved
}

function isWithin(parent: string, child: string): boolean {
  const childPath = relative(parent, child)
  return childPath !== "" && childPath !== ".." && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath)
}

/** Reject an existing policy directory that resolves outside the repository before using an in-memory manifest. */
export async function validateProjectPolicyDirectory(root: string): Promise<void> {
  const repositoryRoot = resolve(root)
  const policyDirectory = resolve(repositoryRoot, ".agent-policy")
  try {
    await lstat(policyDirectory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
  let canonicalPolicyDirectory: string
  try {
    canonicalPolicyDirectory = await realpath(policyDirectory)
  } catch (error) {
    throw policyError(
      "PATH_ESCAPES_PROJECT",
      error instanceof Error ? error.message : "Policy directory cannot be resolved",
      ".agent-policy/policy.yaml",
    )
  }
  const [canonicalRoot, metadata] = await Promise.all([
    realpath(repositoryRoot),
    lstat(canonicalPolicyDirectory),
  ])
  if (!metadata.isDirectory() || !isWithin(canonicalRoot, canonicalPolicyDirectory)) {
    throw policyError(
      "PATH_ESCAPES_PROJECT",
      "Policy directory resolves outside the repository",
      ".agent-policy/policy.yaml",
    )
  }
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
      throw policyError("PATH_ESCAPES_PROJECT", `Declared path resolves outside .agent-policy: ${sourcePath}`, sourcePath)
    }

    return await readFile(canonicalFile, "utf8")
  } catch (error) {
    if (error instanceof PolicyError) throw error
    const message = error instanceof Error ? error.message : "Unable to read source file"
    throw policyError("MISSING_MANIFEST_REFERENCE", message, sourcePath)
  }
}

const invariantIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function loadRepositoryInvariants(value: unknown, path: string): readonly string[] {
  if (!isRecord(value) || !Object.keys(value).every((key) => key === "rules") || !Array.isArray(value.rules)) {
    throw policyError(
      "INVALID_REPOSITORY_INVARIANTS",
      "Repository Invariants must be an object with a rules array",
      path,
    )
  }

  const identifiers = new Set<string>()
  return value.rules.map((rule, index) => {
    if (typeof rule !== "string" || !invariantIdPattern.test(rule)) {
      throw policyError(
        "INVALID_REPOSITORY_INVARIANT",
        `Repository Invariant at /rules/${index} must be a namespaced identifier`,
        path,
      )
    }
    if (identifiers.has(rule)) {
      throw policyError(
        "DUPLICATE_REPOSITORY_INVARIANT",
        `Repository Invariant identifier is duplicated: ${rule}`,
        path,
      )
    }
    identifiers.add(rule)
    return rule
  })
}

async function readOptionalInvariants(
  root: string,
  policyDirectory: string,
  sourceOverrides?: ReadonlyMap<string, string>,
): Promise<{ readonly path?: string; readonly values: readonly string[] }> {
  const invariantsRelative = ".agent-policy/invariants.yaml"
  if (sourceOverrides?.has(invariantsRelative)) {
    const content = sourceOverrides.get(invariantsRelative)!
    return {
      path: invariantsRelative,
      values: loadRepositoryInvariants(parseYamlDocument(content, invariantsRelative), invariantsRelative),
    }
  }

  const invariantsFile = resolveDeclaredFile(root, policyDirectory, "invariants.yaml")
  try {
    await lstat(invariantsFile)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { values: [] }
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

async function readProjectRules(
  root: string,
  policyDirectory: string,
  sourceOverrides?: ReadonlyMap<string, string>,
): Promise<{ readonly rules: readonly RuleSource[]; readonly rulePaths: readonly string[] }> {
  const rulesDirectory = resolve(policyDirectory, "rules")
  const rulePathsSet = new Set<string>()

  try {
    const stats = await lstat(rulesDirectory)
    if (stats.isDirectory()) {
      const entries = await readdir(rulesDirectory, { recursive: true, withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const fullPath = resolve(entry.parentPath, entry.name)
          rulePathsSet.add(sourcePathFor(root, fullPath))
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  if (sourceOverrides !== undefined) {
    for (const path of sourceOverrides.keys()) {
      if (path.startsWith(".agent-policy/rules/") && path.endsWith(".md")) {
        rulePathsSet.add(path)
      }
    }
  }

  const sortedPaths = [...rulePathsSet].sort((a, b) => a.localeCompare(b, "en"))
  const rules: RuleSource[] = []
  const ids = new Map<string, string>()
  const aliases = new Map<string, string>()

  for (const path of sortedPaths) {
    let content: string
    if (sourceOverrides?.has(path)) {
      content = sourceOverrides.get(path)!
    } else {
      const declared = relative(".agent-policy", path).split(sep).join("/")
      const file = resolveDeclaredFile(root, policyDirectory, declared)
      content = await readDeclaredFile(root, policyDirectory, file)
    }

    const rule = parseRuleMarkdown(content, path)
    const existingIdPath = ids.get(rule.id)
    if (existingIdPath !== undefined) {
      throw policyError("DUPLICATE_RULE_ID", `Rule ID already declared in ${existingIdPath}`, path)
    }
    ids.set(rule.id, path)

    for (const alias of rule.aliases) {
      const existingAliasPath = aliases.get(alias)
      if (existingAliasPath !== undefined) {
        throw policyError("DUPLICATE_RULE_ALIAS", `Rule alias ${alias} already declared in ${existingAliasPath}`, path)
      }
      aliases.set(alias, path)
    }

    rules.push(rule)
  }

  return { rules, rulePaths: sortedPaths }
}

/** Load the declared project policy sources without creating or modifying any consumer files. */
export async function loadProjectPolicy(
  root: string,
  options: LoadProjectPolicyOptions = {},
): Promise<ProjectPolicySource> {
  const repositoryRoot = resolve(root)
  const policyDirectory = resolve(repositoryRoot, ".agent-policy")
  const manifestFile = resolveDeclaredFile(repositoryRoot, policyDirectory, "policy.yaml")
  const manifestPath = sourcePathFor(repositoryRoot, manifestFile)
  if (options.manifestOverride !== undefined) await validateProjectPolicyDirectory(repositoryRoot)
  const manifest = validateDocument<ProjectPolicyManifest>(
    "project-policy-v1",
    parseYamlDocument(
      options.manifestOverride ?? await readDeclaredFile(repositoryRoot, policyDirectory, manifestFile),
      manifestPath,
    ),
    manifestPath,
  )
  const invariants = await readOptionalInvariants(repositoryRoot, policyDirectory, options.sourceOverrides)
  const projectRulesResult = await readProjectRules(repositoryRoot, policyDirectory, options.sourceOverrides)

  const declaredOverlayPaths = [...(manifest.overlays ?? [])]
  if (options.sourceOverrides !== undefined) {
    for (const path of options.sourceOverrides.keys()) {
      if (path.startsWith(".agent-policy/overlays/") && (path.endsWith(".yaml") || path.endsWith(".yml"))) {
        const declared = relative(".agent-policy", path).split(sep).join("/")
        if (!declaredOverlayPaths.includes(declared) && !declaredOverlayPaths.includes(path)) {
          declaredOverlayPaths.push(declared)
        }
      }
    }
  }

  const overlayPaths: string[] = []
  const overlays: OverlaySource[] = []

  for (const declaredPath of declaredOverlayPaths) {
    const overlayFile = resolveDeclaredFile(repositoryRoot, policyDirectory, declaredPath)
    const overlayPath = sourcePathFor(repositoryRoot, overlayFile)
    overlayPaths.push(overlayPath)
    const content = options.sourceOverrides?.has(overlayPath)
      ? options.sourceOverrides.get(overlayPath)!
      : await readDeclaredFile(repositoryRoot, policyDirectory, overlayFile)
    overlays.push({
      ...validateDocument<OverlayDirective>(
        "overlay-v1",
        parseYamlDocument(content, overlayPath),
        overlayPath,
      ),
      path: overlayPath,
    })
  }

  const { overlays: _overlays, ...policy } = manifest
  return {
    ...policy,
    repositoryInvariants: invariants.values,
    invariantRuleIds: invariants.values,
    rulePaths: projectRulesResult.rulePaths,
    rules: projectRulesResult.rules,
    path: manifestPath,
    overlayPaths,
    overlays,
    ...(invariants.path === undefined ? {} : { invariantsPath: invariants.path }),
  }
}
