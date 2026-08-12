import { parseDocument } from 'yaml'

import type { Rule } from '../domain/policy.js'
import { PolicyError } from '../domain/diagnostics.js'
import { validateDocument } from './validator.js'

export interface MarkdownSection {
  readonly title: string
  /** Exact Markdown heading that introduces this section. */
  readonly heading: string
  /** Exact source text between this heading and the next heading. */
  readonly source: string
}

export interface RuleSource extends Rule {
  readonly path: string
  readonly sections: readonly MarkdownSection[]
}

type RuleHeader = Omit<Rule, 'instruction' | 'rationale'>

function invalidSource(path: string, code: string, message: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

/** Parse YAML with the default safe schema and no application-defined tags. */
export function parseYamlDocument(text: string, path: string): unknown {
  try {
    const document = parseDocument(text, { customTags: [], prettyErrors: false })
    if (document.errors.length > 0 || document.warnings.length > 0) {
      const messages = [...document.errors, ...document.warnings].map(({ message }) => message)
      throw invalidSource(path, 'INVALID_YAML', messages.join('; '))
    }

    return document.toJS()
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw invalidSource(path, 'INVALID_YAML', error instanceof Error ? error.message : 'Unable to parse YAML')
  }
}

function parseSections(body: string, path: string): readonly MarkdownSection[] {
  const matches = [...body.matchAll(/^#{1,6}[\t ]+(.+?)[\t ]*#?[\t ]*\r?$/gm)]
  const sections: MarkdownSection[] = []
  const titles = new Set<string>()

  for (const [index, match] of matches.entries()) {
    const title = match[1]?.trim()
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? body.length
    if (title === undefined || title.length === 0) continue

    if (titles.has(title)) {
      throw invalidSource(path, 'DUPLICATE_MARKDOWN_SECTION', `Duplicate Markdown section ${title}`)
    }

    titles.add(title)
    sections.push({ title, heading: match[0], source: body.slice(start, end) })
  }

  return sections
}

function requiredSection(sections: readonly MarkdownSection[], title: string, path: string): string {
  const section = sections.find((candidate) => candidate.title === title)
  if (section === undefined) {
    throw invalidSource(path, 'MISSING_MARKDOWN_SECTION', `Missing required Markdown section ${title}`)
  }

  const content = section.source.trim()
  if (content.length === 0) {
    throw invalidSource(path, 'EMPTY_MARKDOWN_SECTION', `Required Markdown section ${title} is empty`)
  }

  return content
}

/** Parse a canonical rule Markdown document with a document-leading YAML frontmatter block. */
export function parseRuleMarkdown(text: string, path: string): RuleSource {
  const opening = /^---[\t ]*(?:\r?\n|$)/.exec(text)
  if (opening === null) {
    throw invalidSource(path, 'MISSING_FRONTMATTER', 'Rule frontmatter must begin at the start of the document')
  }

  const frontmatterStart = opening[0].length
  const closing = /^---[\t ]*(?:\r?\n|$)/m.exec(text.slice(frontmatterStart))
  if (closing === null) {
    throw invalidSource(path, 'UNTERMINATED_FRONTMATTER', 'Rule frontmatter is not terminated')
  }

  const frontmatterEnd = frontmatterStart + closing.index
  const bodyStart = frontmatterEnd + closing[0].length
  const header = validateDocument<RuleHeader>(
    'rule-v1',
    parseYamlDocument(text.slice(frontmatterStart, frontmatterEnd), path),
    path,
  )
  const sections = parseSections(text.slice(bodyStart), path)

  return {
    ...header,
    instruction: requiredSection(sections, 'Instruction', path),
    rationale: requiredSection(sections, 'Rationale', path),
    path,
    sections,
  }
}
