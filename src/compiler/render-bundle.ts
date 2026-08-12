import type { Bundle } from '../domain/policy.js'
import type { ResolvedPolicy } from './resolve-policy.js'
import { renderRule, type RenderProfile } from './render-rule.js'

/** Render one resolved bundle in member order, without adding presentation-derived rule content. */
export function renderBundle(bundle: Bundle, resolvedPolicy: ResolvedPolicy, profile: RenderProfile): string {
  const resolved = resolvedPolicy.bundles.find(({ id }) => id === bundle.id)
  if (resolved === undefined) throw new Error(`Bundle ${bundle.id} is not part of the resolved policy`)
  return resolved.rules.map((rule) => renderRule(rule, profile)).join('\n\n')
}
