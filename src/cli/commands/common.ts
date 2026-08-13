import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

import { isMap, isNode, isPair, isScalar, parseDocument, stringify, type Node } from 'yaml'

import { loadCatalog } from '../../catalog/load-catalog.js'
import { loadBundles } from '../../catalog/load-bundles.js'
import { codexAdapter } from '../../adapters/codex/project.js'
import {
  MANAGED_REGION_END,
  MANAGED_REGION_START,
  removeManagedRegion,
} from '../../adapters/codex/managed-region.js'
import type { ProjectionInput, ScopedProfileProjection } from '../../adapters/types.js'
import { resolvePolicy, type ResolvedPolicy } from '../../compiler/resolve-policy.js'
import { migrateProject } from '../../compiler/migrations.js'
import type { VirtualArtifact } from '../../domain/artifacts.js'
import type { ChangePlan, SourceChange } from '../../domain/change-plan.js'
import { PolicyError, type Diagnostic } from '../../domain/diagnostics.js'
import { createChangePlan } from '../../planner/create-plan.js'
import { sha256Utf8 } from '../../planner/hash.js'
import { computePlanHash } from '../../planner/serialize-plan.js'
import { loadProjectPolicy, type ProjectPolicySource } from '../../schema/load-project.js'

export const toolkitOwner = '@agent-policy/agent-policy-toolkit'

export interface CommandContext {
  readonly repositoryRoot: string
  readonly toolkitRoot: string
  readonly toolkitVersion: string
}

export interface CompiledCodexProjection {
  readonly project: ProjectPolicySource
  readonly resolvedPolicy: ResolvedPolicy
  readonly sourcePaths: readonly string[]
  readonly canonicalSourceHash: string
  readonly artifacts: readonly VirtualArtifact[]
}

export interface GeneratedFile {
  readonly path: string
  readonly content: string
  readonly kind: 'generated' | 'managed-region'
}

function policyError(code: string, message: string, path = '.agent-policy/policy.yaml'): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function absolutePlanPath(repositoryRoot: string, input: string): string {
  if (!isAbsolute(input)) throw new Error('Change Plan path must be an explicit absolute path')
  const planPath = resolve(input)
  const root = resolve(repositoryRoot)
  const offset = relative(root, planPath)
  if (offset === '' || (offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))) {
    throw new Error('Change Plan path must be outside the consumer worktree')
  }
  return planPath
}

function outside(root: string, candidate: string): boolean {
  const offset = relative(root, candidate)
  return offset === '..' || offset.startsWith(`..${sep}`) || isAbsolute(offset)
}

async function nearestExistingDirectory(input: string): Promise<{ readonly lexical: string; readonly real: string }> {
  let cursor = input
  while (true) {
    try {
      const metadata = await lstat(cursor)
      if (!metadata.isDirectory()) throw new Error(`Plan parent is not a directory: ${cursor}`)
      return { lexical: cursor, real: await realpath(cursor) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(cursor)
      if (parent === cursor) throw error
      cursor = parent
    }
  }
}

/** Resolve a reviewed plan without allowing worktree paths or symlink escapes. */
export async function validateExternalPlanPath(repositoryRoot: string, input: string): Promise<string> {
  if (input.length === 0 || !isAbsolute(input)) {
    throw new Error('Change Plan path must be an explicit absolute path outside the consumer worktree')
  }
  const rootLexical = resolve(repositoryRoot)
  const rootReal = await realpath(repositoryRoot)
  const target = resolve(input)
  if (!outside(rootLexical, target) || !outside(rootReal, target)) {
    throw new Error('Change Plan path must be outside the consumer worktree')
  }

  const existingParent = await nearestExistingDirectory(dirname(target))
  const suffix = relative(existingParent.lexical, dirname(target))
  const resolvedParent = resolve(existingParent.real, suffix)
  const resolvedTarget = resolve(resolvedParent, basename(target))
  if (!outside(rootReal, resolvedTarget)) {
    throw new Error('Change Plan path resolves inside the consumer worktree')
  }
  try {
    const metadata = await lstat(target)
    if (metadata.isSymbolicLink()) throw new Error('Change Plan path must not be a symbolic link')
    if (metadata.isDirectory()) throw new Error('Change Plan path must name a file')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return target
}

async function text(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function readText(root: string, path: string): Promise<string | undefined> {
  return text(resolve(root, ...path.split('/')))
}

export function generatedOwnership(content: string): boolean {
  const marker = `<!--\nGenerated by ${toolkitOwner}.\n`
  if (content.startsWith(marker)) return true
  const frontmatter = /^---\n[\s\S]*?\n---\n\n/.exec(content)
  return frontmatter !== null && content.slice(frontmatter[0].length).startsWith(marker)
}

function managedMarkers(content: string): { readonly start: number; readonly end: number } | undefined {
  const sentinels = [...content.matchAll(/agent-policy:(?:start|end)/g)]
  if (sentinels.length === 0) return undefined
  const markers = [...content.matchAll(/<!--\s*agent-policy:(?:start\b[^>]*|end\b[^>]*)-->/g)]
  if (
    sentinels.length !== 2
    || markers.length !== 2
    || markers[0]?.[0] !== MANAGED_REGION_START
    || markers[1]?.[0] !== MANAGED_REGION_END
    || (markers[0]?.index ?? -1) >= (markers[1]?.index ?? -1)
  ) {
    throw new Error('Invalid agent-policy Managed Region markers')
  }
  return {
    start: markers[0]?.index ?? 0,
    end: (markers[1]?.index ?? 0) + MANAGED_REGION_END.length,
  }
}

/** Remove exactly one owned Managed Region while preserving every surrounding byte. */
export function withoutManagedRegion(content: string): string | undefined {
  return removeManagedRegion(content)
}

export function hasManagedRegion(content: string): boolean {
  return managedMarkers(content) !== undefined
}

async function sourceHash(
  root: string,
  sourcePaths: readonly string[],
  overrides: ReadonlyMap<string, string> = new Map(),
): Promise<string> {
  const entries: Array<readonly [string, string]> = []
  for (const path of [...sourcePaths].sort(compareStrings)) {
    const contents = overrides.get(path) ?? await readText(root, path)
    if (contents === undefined) throw policyError('MISSING_POLICY_SOURCE', `Missing canonical source ${path}`, path)
    entries.push([path, contents])
  }
  return sha256Utf8(JSON.stringify(entries))
}

export interface BundleSelectionPreparation {
  readonly sourceChanges: readonly SourceChange[]
  readonly overrides: ReadonlyMap<string, string>
}

function replaceBundleField(source: string, selected: readonly string[]): string | undefined {
  const document = parseDocument<Node>(source, { customTags: [], prettyErrors: false })
  if (document.errors.length > 0 || document.warnings.length > 0) return undefined
  if (!isMap(document.contents)) return undefined
  const pair = document.contents.items.find((candidate) =>
    isPair(candidate) && isScalar(candidate.key) && candidate.key.value === 'bundles')
  if (pair === undefined || !isPair(pair)) return undefined
  if (!isNode(pair.value) || pair.value.range === undefined || pair.value.range === null) return undefined
  const valueRange = pair.value.range

  // Let YAML identify the semantic pair (including quoted keys), then render
  // only that node's source range. This keeps unrelated field formatting and
  // comments intact while normalizing every supported sequence shape.
  pair.value = document.createNode([...selected])
  const [valueStart, valueEnd] = valueRange
  if (valueStart === undefined || valueEnd === undefined) return undefined
  const lineStart = source.lastIndexOf('\n', valueStart - 1) + 1
  const linePrefix = source.slice(lineStart, valueStart)
  const isBlockValue = linePrefix.trim().length === 0
  const newline = source.match(/\r\n|\n|\r/)?.[0] ?? '\n'
  const rendered = isBlockValue
    ? stringify([...selected]).replace(/\r\n|\n|\r$/, '').split(/\r\n|\n|\r/)
      .map((line, index) => index === 0 ? line : `${linePrefix}${line}`)
      .join(newline) + newline
    : stringify([...selected], { flow: true }).trimEnd()
  const updated = `${source.slice(0, valueStart)}${rendered}${source.slice(valueEnd)}`
  const validation = parseDocument<Node>(updated, { customTags: [], prettyErrors: false })
  return validation.errors.length === 0 && validation.warnings.length === 0 ? updated : undefined
}

/** Convert an explicit Bundle Selection into a reviewed canonical manifest change. */
export async function prepareBundleSelection(
  context: CommandContext,
  bundles: readonly string[],
): Promise<BundleSelectionPreparation> {
  const source = await loadProjectPolicy(context.repositoryRoot)
  const current = await readText(context.repositoryRoot, source.path)
  if (current === undefined) throw policyError('MISSING_POLICY_SOURCE', `Missing canonical source ${source.path}`, source.path)
  const selected = bundles.filter((id) => id !== 'core')
  if (JSON.stringify(source.bundles) === JSON.stringify(selected)) {
    return { sourceChanges: [], overrides: new Map() }
  }
  const content = replaceBundleField(current, selected)
  if (content === undefined) {
    throw policyError('MISSING_BUNDLE_SELECTION', `Canonical source has no bundles field: ${source.path}`, source.path)
  }
  return {
    sourceChanges: [{
      path: source.path,
      content,
      sha256: sha256Utf8(content),
      operation: 'replace',
    }],
    overrides: new Map([[source.path, content]]),
  }
}

function policyWithBundles(
  source: ProjectPolicySource,
  bundles: readonly string[] | undefined,
): ProjectPolicySource {
  if (bundles === undefined) return source
  const selected = bundles.filter((id) => id !== 'core')
  return { ...source, bundles: selected }
}

function profileObject(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function profileStrings(
  value: unknown,
  profileId: string,
  field: string,
  sourcePath: string,
): readonly string[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw policyError(
      'INVALID_SCOPED_PROFILE',
      `Scoped profile ${profileId} field ${field} must be a non-empty string array`,
      sourcePath,
    )
  }
  return value as readonly string[]
}

function scopedProfileProjections(project: ProjectPolicySource): readonly ScopedProfileProjection[] {
  if (project.profiles === undefined) return []

  return Object.entries(project.profiles).map(([profileId, value]) => {
    const profile = profileObject(value)
    if (profile === undefined) {
      throw policyError(
        'INVALID_SCOPED_PROFILE',
        `Scoped profile ${profileId} must be an object`,
        project.path,
      )
    }
    const bundleIds = profileStrings(profile.bundleIds, profileId, 'bundleIds', project.path)
    const paths = profileStrings(profile.paths, profileId, 'paths', project.path)
    const workspaces = profile.workspaces === undefined
      ? []
      : profileStrings(profile.workspaces, profileId, 'workspaces', project.path)
    return {
      id: profileId,
      bundleIds,
      paths,
      ...(workspaces.length === 0 ? {} : { workspaces }),
    }
  })
}

function throwDiagnostics(diagnostics: readonly Diagnostic[]): void {
  const errors = diagnostics.filter(({ severity }) => severity === 'error')
  if (errors.length > 0) throw new PolicyError(errors)
}

async function existingArtifacts(
  root: string,
  resolvedPolicy: ResolvedPolicy,
): Promise<ReadonlyMap<string, string>> {
  const paths = new Set<string>(['AGENTS.md'])
  for (const bundle of resolvedPolicy.bundles) {
    if (bundle.id !== 'core') paths.add(`.agents/skills/${bundle.id}/SKILL.md`)
  }
  const entries: Array<readonly [string, string]> = []
  for (const path of [...paths].sort(compareStrings)) {
    const contents = await readText(root, path)
    if (contents !== undefined) entries.push([path, contents])
  }
  return new Map(entries)
}

/** Compile canonical sources and project Codex output without mutating the consumer repository. */
export async function compileCodex(
  context: CommandContext,
  requestedBundles?: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): Promise<CompiledCodexProjection> {
  const project = policyWithBundles(await loadProjectPolicy(context.repositoryRoot), requestedBundles)
  const manifestSource = sourceOverrides.get(project.path) ?? await readText(context.repositoryRoot, project.path)
  if (manifestSource === undefined) throw policyError('MISSING_POLICY_SOURCE', `Missing canonical source ${project.path}`, project.path)
  migrateProject(manifestSource, 'v1')
  if (project.toolkitVersion !== context.toolkitVersion) {
    throw policyError(
      'TOOLKIT_VERSION_MISMATCH',
      `Project policy targets toolkit ${project.toolkitVersion}, but this toolkit is ${context.toolkitVersion}`,
      project.path,
    )
  }
  const catalog = await loadCatalog(context.toolkitRoot)
  const bundles = await loadBundles(context.toolkitRoot)
  const resolvedPolicy = resolvePolicy({ rules: catalog.rules, bundles }, project)
  throwDiagnostics(resolvedPolicy.diagnostics)
  const sourcePaths = [project.path, ...project.overlayPaths]
  const canonicalSourceHash = await sourceHash(context.repositoryRoot, sourcePaths, sourceOverrides)
  const existing = await existingArtifacts(context.repositoryRoot, resolvedPolicy)
  const input: ProjectionInput = {
    toolkitVersion: context.toolkitVersion,
    canonicalSourceHash,
    resolvedPolicy,
    bundles,
    existingArtifacts: existing,
    scopedProfiles: scopedProfileProjections(project),
  }
  return {
    project,
    resolvedPolicy,
    sourcePaths,
    canonicalSourceHash,
    artifacts: await codexAdapter.project(input),
  }
}

export async function saveProjectionPlan(
  context: CommandContext,
  command: string,
  planPathInput: string,
  sourcePaths: readonly string[],
  desiredArtifacts: readonly VirtualArtifact[],
  removals: readonly string[] = [],
  diagnostics: readonly Diagnostic[] = [],
  sourceChanges: readonly SourceChange[] = [],
): Promise<ChangePlan> {
  return createChangePlan({
    command,
    toolkitVersion: context.toolkitVersion,
    repositoryRoot: context.repositoryRoot,
    planPath: absolutePlanPath(context.repositoryRoot, planPathInput),
    sourcePaths,
    desiredArtifacts,
    sourceChanges,
    removals,
    diagnostics,
  })
}

export async function readChangePlan(repositoryRoot: string, path: string): Promise<ChangePlan> {
  const planPath = await validateExternalPlanPath(repositoryRoot, path)
  const parsed: unknown = JSON.parse(await readFile(planPath, 'utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Change Plan must be a JSON object')
  }
  const plan = parsed as ChangePlan
  if (typeof plan.planHash !== 'string' || computePlanHash(plan) !== plan.planHash) {
    throw new Error('Change Plan hash does not match its canonical contents')
  }
  return plan
}

async function walk(root: string, current: string, output: GeneratedFile[]): Promise<void> {
  const directory = resolve(root, ...current.split('/').filter(Boolean))
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const entry of entries.sort((left, right) => compareStrings(left.name, right.name))) {
    const relativePath = current.length === 0 ? entry.name : `${current}/${entry.name}`
    if (entry.name === '.git' || entry.name === '.agent-policy' || entry.name === 'node_modules') continue
    if (entry.isDirectory()) {
      await walk(root, relativePath, output)
      continue
    }
    if (!entry.isFile()) continue
    const contents = await readText(root, relativePath)
    if (contents === undefined) continue
    if (hasManagedRegion(contents)) output.push({ path: relativePath, content: contents, kind: 'managed-region' })
    else if (generatedOwnership(contents)) output.push({ path: relativePath, content: contents, kind: 'generated' })
  }
}

export async function findGeneratedFiles(root: string): Promise<readonly GeneratedFile[]> {
  const output: GeneratedFile[] = []
  await walk(root, '', output)
  return output
}

export function managedRemovalArtifact(file: GeneratedFile): VirtualArtifact | undefined {
  if (file.kind !== 'managed-region') return undefined
  const content = withoutManagedRegion(file.content)
  if (content === undefined) return undefined
  return {
    path: file.path,
    content,
    sha256: sha256Utf8(content),
    owner: toolkitOwner,
    operation: 'managed-region-remove',
  }
}

export function formatError(error: unknown): string {
  if (error instanceof PolicyError) return error.message
  return error instanceof Error ? error.message : String(error)
}
