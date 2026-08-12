import type { Diagnostic } from '../domain/diagnostics.js'
import type { OverlayDirective, OverlayOperation, Rule } from '../domain/policy.js'

export interface OverlayDirectiveSource extends OverlayDirective {
  /** Repository-relative source file of the directive, when loaded from a project manifest. */
  readonly path?: string
}

export interface AppliedOverlay {
  readonly path: string
  readonly target: string
  readonly canonicalId: string
  readonly operation: OverlayOperation
  readonly reason: string
  readonly content?: string
}

/** A rule projection. The embedded catalog fields are copied and are never modified in place. */
export interface OverlayRule extends Rule {
  readonly canonicalId: string
  readonly disabled: boolean
  readonly addenda: readonly string[]
  readonly replacement?: string
  readonly provenance: readonly AppliedOverlay[]
}

export interface OverlayResult {
  readonly rules: readonly OverlayRule[]
  readonly diagnostics: readonly Diagnostic[]
}

function allowsProjectOverlay(rule: Rule): boolean {
  return rule.override === 'project-overlay' || rule.override === 'project-overlay-or-explicit-task'
}

function diagnostic(
  code: string,
  message: string,
  path: string,
  ruleId: string,
): Diagnostic {
  return { code, severity: 'error', message, path, ruleId }
}

function directivePath(directive: OverlayDirectiveSource, index: number): string {
  return directive.path ?? `.agent-policy/overlays/${index + 1}`
}

/**
 * Resolve catalog aliases and apply project-owned directives without changing the supplied catalog rules.
 * Invalid directives are reported and omitted, allowing callers to present every error in one pass.
 */
export function applyOverlays(
  rules: readonly Rule[],
  directives: readonly OverlayDirectiveSource[],
): OverlayResult {
  const byIdentifier = new Map<string, Rule>()
  const projections = new Map<string, OverlayRule>()

  for (const rule of rules) {
    byIdentifier.set(rule.id, rule)
    for (const alias of rule.aliases) byIdentifier.set(alias, rule)
    projections.set(rule.id, {
      ...rule,
      canonicalId: rule.id,
      disabled: false,
      addenda: [],
      replacement: undefined,
      provenance: [],
    })
  }

  const diagnostics: Diagnostic[] = []

  for (const [index, directive] of directives.entries()) {
    const path = directivePath(directive, index)
    const target = byIdentifier.get(directive.ruleId)

    if (target === undefined) {
      diagnostics.push(diagnostic(
        'UNKNOWN_OVERLAY_TARGET',
        `Overlay directive targets unknown rule ${directive.ruleId}`,
        path,
        directive.ruleId,
      ))
      continue
    }

    if (directive.reason.trim().length === 0) {
      diagnostics.push(diagnostic(
        'MISSING_OVERLAY_REASON',
        `Overlay directive for ${target.id} requires a non-empty reason`,
        path,
        target.id,
      ))
      continue
    }

    if (!allowsProjectOverlay(target)) {
      diagnostics.push(diagnostic(
        'OVERLAY_OVERRIDE_FORBIDDEN',
        `Overlay directive ${directive.operation} cannot override ${target.id} with policy ${target.override}`,
        path,
        target.id,
      ))
      continue
    }

    const current = projections.get(target.id)
    if (current === undefined) throw new Error(`Missing overlay projection for ${target.id}`)

    const applied: AppliedOverlay = {
      path,
      target: directive.ruleId,
      canonicalId: target.id,
      operation: directive.operation,
      reason: directive.reason,
      ...(directive.content === undefined ? {} : { content: directive.content }),
    }
    const next: OverlayRule = {
      ...current,
      ...(directive.operation === 'disable' ? { disabled: true } : {}),
      ...(directive.operation === 'addendum'
        ? { addenda: [...current.addenda, directive.content ?? ''] }
        : {}),
      ...(directive.operation === 'replace-with' ? { replacement: directive.content ?? '' } : {}),
      provenance: [...current.provenance, applied],
    }
    projections.set(target.id, next)
  }

  return { rules: rules.map((rule) => projections.get(rule.id)!), diagnostics }
}
