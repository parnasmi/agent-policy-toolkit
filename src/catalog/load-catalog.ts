import { readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import { PolicyError } from '../domain/diagnostics.js'
import { parseRuleMarkdown, parseYamlDocument, type RuleSource } from '../schema/frontmatter.js'

export type MigrationDisposition = 'active-slice-a' | 'later-slice' | 'retired'

export interface MigrationSourceRule {
  readonly number: number
  readonly alias: string
  readonly destination: string | null
  readonly disposition: MigrationDisposition
  readonly mergeMembers: readonly number[]
  readonly rationale: string
}

export interface MigrationEditorialRecord {
  readonly section: string
  readonly disposition: 'reviewed-editorial'
  readonly rationale: string
}

export interface MigrationProvenance {
  readonly sourceDocument: string
  readonly sourceRules: readonly MigrationSourceRule[]
  readonly editorial: readonly MigrationEditorialRecord[]
}

export interface CanonicalWorkflowSkill {
  readonly name: string
  readonly description: string
  readonly body: string
  readonly path: string
}

export interface CanonicalCatalog {
  readonly rules: readonly RuleSource[]
  readonly provenance: MigrationProvenance
  readonly workflowSkills: readonly CanonicalWorkflowSkill[]
}

function catalogError(code: string, message: string, path: string, ruleId?: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path, ...(ruleId === undefined ? {} : { ruleId }) }])
}

function sourcePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function isWithin(parent: string, child: string): boolean {
  const childPath = relative(parent, child)
  return childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath)
}

async function confinedFile(root: string, file: string): Promise<string> {
  const path = sourcePath(root, file)
  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(file)])
    if (!isWithin(canonicalRoot, canonicalFile)) {
      throw catalogError('PATH_ESCAPES_TOOLKIT', 'Catalog source resolves outside the toolkit root', path)
    }
    return canonicalFile
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw catalogError(
      'MISSING_CATALOG_SOURCE',
      error instanceof Error ? error.message : 'Unable to read catalog source',
      path,
    )
  }
}

function migrationProvenance(value: unknown, path: string): MigrationProvenance {
  if (typeof value !== 'object' || value === null) {
    throw catalogError('INVALID_MIGRATION_PROVENANCE', 'Migration provenance must be an object', path)
  }

  const candidate = value as Partial<MigrationProvenance>
  if (
    typeof candidate.sourceDocument !== 'string' ||
    !Array.isArray(candidate.sourceRules) ||
    !Array.isArray(candidate.editorial)
  ) {
    throw catalogError('INVALID_MIGRATION_PROVENANCE', 'Migration provenance is missing required fields', path)
  }

  return candidate as MigrationProvenance
}

/** Load and validate the shipped canonical rules without compiling provenance into runtime policy. */
export async function loadCatalog(toolkitRoot: string): Promise<CanonicalCatalog> {
  const root = resolve(toolkitRoot)
  const rulesDirectory = resolve(root, 'catalog/rules')
  const provenanceFile = resolve(root, 'catalog/evidence/universal-rules-migration.yaml')
  const canonicalRulesDirectory = await confinedFile(root, rulesDirectory)
  const entries = await readdir(canonicalRulesDirectory, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort((left, right) => sourcePath(root, left).localeCompare(sourcePath(root, right), 'en'))
  const rules: RuleSource[] = []
  const ids = new Map<string, string>()
  const aliases = new Map<string, string>()

  for (const file of files) {
    const canonicalFile = await confinedFile(root, file)
    const path = sourcePath(root, canonicalFile)
    const rule = parseRuleMarkdown(await readFile(canonicalFile, 'utf8'), path)
    const existingIdPath = ids.get(rule.id)
    if (existingIdPath !== undefined) {
      throw catalogError('DUPLICATE_RULE_ID', `Rule ID already declared in ${existingIdPath}`, path, rule.id)
    }
    ids.set(rule.id, path)

    for (const alias of rule.aliases) {
      const existingAliasPath = aliases.get(alias)
      if (existingAliasPath !== undefined) {
        throw catalogError('DUPLICATE_RULE_ALIAS', `Rule alias ${alias} already declared in ${existingAliasPath}`, path, rule.id)
      }
      aliases.set(alias, path)
    }
    rules.push(rule)
  }

  const canonicalProvenanceFile = await confinedFile(root, provenanceFile)
  const provenancePath = sourcePath(root, canonicalProvenanceFile)
  const provenance = migrationProvenance(
    parseYamlDocument(await readFile(canonicalProvenanceFile, 'utf8'), provenancePath),
    provenancePath,
  )

  const workflowSkills = await loadWorkflowSkills(toolkitRoot)

  return { rules, provenance, workflowSkills }
}

/** Discover and load canonical workflow skills from skills/* /SKILL.md. */
export async function loadWorkflowSkills(toolkitRoot: string): Promise<readonly CanonicalWorkflowSkill[]> {
  const root = resolve(toolkitRoot)
  const skillsDirectory = resolve(root, 'skills')
  let canonicalSkillsDirectory: string
  try {
    const [canonicalRoot, canonicalSkills] = await Promise.all([realpath(root), realpath(skillsDirectory)])
    if (!isWithin(canonicalRoot, canonicalSkills)) {
      throw catalogError('PATH_ESCAPES_TOOLKIT', 'Workflow skills directory resolves outside the toolkit root', 'skills')
    }
    canonicalSkillsDirectory = canonicalSkills
  } catch (error) {
    if (error instanceof PolicyError) throw error
    return []
  }

  const entries = await readdir(canonicalSkillsDirectory, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name === 'SKILL.md')
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort((left, right) => sourcePath(root, left).localeCompare(sourcePath(root, right), 'en'))

  const skills: CanonicalWorkflowSkill[] = []
  const names = new Map<string, string>()

  for (const file of files) {
    const canonicalFile = await confinedFile(root, file)
    const path = sourcePath(root, canonicalFile)
    const text = await readFile(canonicalFile, 'utf8')

    const opening = /^---[\t ]*(?:\r?\n|$)/.exec(text)
    if (opening === null) {
      throw catalogError('INVALID_WORKFLOW_SKILL', 'Workflow skill frontmatter must begin at start of document', path)
    }
    const frontmatterStart = opening[0].length
    const closing = /^---[\t ]*(?:\r?\n|$)/m.exec(text.slice(frontmatterStart))
    if (closing === null) {
      throw catalogError('INVALID_WORKFLOW_SKILL', 'Workflow skill frontmatter is not terminated', path)
    }
    const frontmatterEnd = frontmatterStart + closing.index
    const bodyStart = frontmatterEnd + closing[0].length

    const frontmatter = parseYamlDocument(text.slice(frontmatterStart, frontmatterEnd), path) as {
      name?: unknown
      description?: unknown
    }
    if (
      typeof frontmatter !== 'object' ||
      frontmatter === null ||
      typeof frontmatter.name !== 'string' ||
      frontmatter.name.length === 0 ||
      typeof frontmatter.description !== 'string' ||
      frontmatter.description.length === 0
    ) {
      throw catalogError('INVALID_WORKFLOW_SKILL', 'Workflow skill frontmatter missing required name or description', path)
    }

    const existingNamePath = names.get(frontmatter.name)
    if (existingNamePath !== undefined) {
      throw catalogError('DUPLICATE_WORKFLOW_SKILL', `Workflow skill ${frontmatter.name} already declared in ${existingNamePath}`, path)
    }
    names.set(frontmatter.name, path)

    skills.push({
      name: frontmatter.name,
      description: frontmatter.description,
      body: text.slice(bodyStart).trim(),
      path,
    })
  }

  return skills
}

