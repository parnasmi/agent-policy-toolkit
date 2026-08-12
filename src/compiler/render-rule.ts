import type { OverlayRule } from './overlays.js'

export type RenderProfile = 'core' | 'domain-skill' | 'code-review' | 'maintainer'

interface SourceSection {
  readonly title: string
  readonly heading?: string
  readonly source: string
}

type SourceBackedRule = OverlayRule & { readonly sections?: readonly SourceSection[] }

function section(heading: string, value: string | undefined, includeEmpty = false): string | undefined {
  if (value === undefined || value.trim() === '') return includeEmpty ? heading : undefined
  return `${heading}\n\n${value.trim()}`
}

function canonicalSection(rule: SourceBackedRule, title: string, fallback: string | undefined): string | undefined {
  const source = rule.sections?.find((candidate) => candidate.title === title)
  return section(
    source?.heading ?? `## ${title}`,
    title === 'Instruction' && rule.replacement !== undefined ? rule.replacement : source?.source ?? fallback,
  )
}

function completeCanonicalSection(rule: SourceBackedRule, source: SourceSection): string {
  return section(
    source.heading ?? `## ${source.title}`,
    source.title === 'Instruction' && rule.replacement !== undefined ? rule.replacement : source.source,
    true,
  )!
}

function overlaySections(rule: OverlayRule): string[] {
  return [
    ...rule.addenda.map((addendum) => addendum.trim()).filter(Boolean),
  ]
}

/** Render a profile by selecting canonical fields verbatim; it never rewrites their meaning. */
export function renderRule(rule: SourceBackedRule, profile: RenderProfile): string {
  const selected = profile === 'core'
    ? [canonicalSection(rule, 'Instruction', rule.instruction), canonicalSection(rule, 'Exceptions', rule.exceptions)]
    : profile === 'domain-skill'
      ? [
          canonicalSection(rule, 'Instruction', rule.instruction),
          canonicalSection(rule, 'Rationale', rule.rationale),
          canonicalSection(rule, 'Exceptions', rule.exceptions),
        ]
      : profile === 'code-review'
        ? [
            `# ${rule.canonicalId}`,
            canonicalSection(rule, 'Instruction', rule.instruction),
            canonicalSection(rule, 'Verification', rule.verification),
          ]
        : rule.sections?.some(({ heading }) => heading !== undefined)
          ? rule.sections.map((source) => completeCanonicalSection(rule, source))
          : [
            `# ${rule.title ?? rule.canonicalId}`,
            ...(rule.sections === undefined
              ? [
                  canonicalSection(rule, 'Instruction', rule.instruction),
                  canonicalSection(rule, 'Rationale', rule.rationale),
                  canonicalSection(rule, 'Exceptions', rule.exceptions),
                  canonicalSection(rule, 'Examples', rule.examples),
                  canonicalSection(rule, 'Verification', rule.verification),
                ]
              : rule.sections.map((source) => completeCanonicalSection(rule, source))),
          ]

  return [...selected, ...overlaySections(rule)].filter((value): value is string => value !== undefined).join('\n\n')
}
