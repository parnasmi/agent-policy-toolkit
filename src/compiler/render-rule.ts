import type { OverlayRule } from './overlays.js'

export type RenderProfile = 'core' | 'domain-skill' | 'code-review' | 'maintainer'

interface SourceSection {
  readonly title: string
  readonly source: string
}

type SourceBackedRule = OverlayRule & { readonly sections?: readonly SourceSection[] }

function section(title: string, value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : `## ${title}\n\n${value.trim()}`
}

function canonicalSection(rule: SourceBackedRule, title: string, fallback: string | undefined): string | undefined {
  const source = rule.sections?.find((candidate) => candidate.title === title)?.source
  return section(title, title === 'Instruction' && rule.replacement !== undefined ? rule.replacement : source ?? fallback)
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
              : rule.sections.map(({ title, source }) => canonicalSection(rule, title, source))),
          ]

  return [...selected, ...overlaySections(rule)].filter((value): value is string => value !== undefined).join('\n\n')
}
