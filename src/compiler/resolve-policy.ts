import type { Bundle, ProjectPolicy, Rule } from "../domain/policy.js"
import type { Diagnostic } from "../domain/diagnostics.js"
import { applyOverlays, type OverlayDirectiveSource, type OverlayRule } from "./overlays.js"

export interface PolicyCatalog {
  readonly rules: readonly Rule[]
  readonly bundles: ReadonlyMap<string, Bundle>
}

export interface ScopedRule extends OverlayRule {
  readonly scopes: readonly ResolvedScope[]
}

export interface ResolvedScope {
  readonly bundleId: string
  readonly applicability: Readonly<Record<string, unknown>>
}

export interface ResolvedBundle {
  readonly id: string
  readonly description: string
  readonly applicability: Readonly<Record<string, unknown>>
  readonly rules: readonly ScopedRule[]
}

export interface ResolvedPolicy {
  readonly rules: readonly ScopedRule[]
  readonly bundles: readonly ResolvedBundle[]
  readonly diagnostics: readonly Diagnostic[]
  readonly invariants?: readonly OverlayRule[]
}

interface ProjectWithOverlays extends ProjectPolicy {
  readonly overlays?: readonly OverlayDirectiveSource[]
  readonly rules?: readonly Rule[]
  readonly invariantRuleIds?: readonly string[]
}

function orderedBundles(bundles: ReadonlyMap<string, Bundle>, requested: readonly string[]): Bundle[] {
  const ordered: Bundle[] = []
  const expanded = new Set<string>()
  const expanding = new Set<string>()

  const expand = (id: string): void => {
    if (expanded.has(id)) return
    const bundle = bundles.get(id)
    if (bundle === undefined) throw new Error(`Unknown policy bundle ${id}`)
    if (expanding.has(id)) throw new Error(`Policy bundle dependency cycle includes ${id}`)

    expanding.add(id)
    for (const dependency of bundle.dependencies) expand(dependency)
    expanding.delete(id)
    expanded.add(id)
    ordered.push(bundle)
  }

  for (const id of requested) expand(id)
  return ordered
}

function byIdentifier(rules: readonly OverlayRule[]): ReadonlyMap<string, OverlayRule> {
  const identifiers = new Map<string, OverlayRule>()
  for (const rule of rules) {
    identifiers.set(rule.id, rule)
    for (const alias of rule.aliases) identifiers.set(alias, rule)
  }
  return identifiers
}

/** Resolve declared bundles in manifest order, retaining every overlay and applicability provenance. */
export function resolvePolicy(catalog: PolicyCatalog, project: ProjectWithOverlays): ResolvedPolicy {
  const projectRules = project.rules ?? []
  const allRules = [...catalog.rules, ...projectRules]
  const overlays = applyOverlays(allRules, project.overlays ?? [])
  const selectedBundles = orderedBundles(
    catalog.bundles,
    catalog.bundles.has("core") ? ["core", ...project.bundles] : project.bundles,
  )
  const resolvedByIdentifier = byIdentifier(overlays.rules)
  const rulesById = new Map<string, ScopedRule>()
  const bundles: ResolvedBundle[] = []

  for (const bundle of selectedBundles) {
    const members: ScopedRule[] = []
    for (const identifier of bundle.members) {
      const rule = resolvedByIdentifier.get(identifier)
      if (rule === undefined) throw new Error(`Bundle ${bundle.id} references unknown rule ${identifier}`)
      if (rule.disabled) continue

      const scope: ResolvedScope = { bundleId: bundle.id, applicability: bundle.applicability }
      const existing = rulesById.get(rule.canonicalId)
      const scoped = existing === undefined
        ? { ...rule, scopes: [scope] }
        : { ...existing, scopes: [...existing.scopes, scope] }
      rulesById.set(rule.canonicalId, scoped)
      if (!members.some(({ canonicalId }) => canonicalId === scoped.canonicalId)) members.push(scoped)
    }
    bundles.push({ id: bundle.id, description: bundle.description, applicability: bundle.applicability, rules: members })
  }

  const invariantIds = project.invariantRuleIds ?? []
  const resolvedInvariants: OverlayRule[] = []
  for (const identifier of invariantIds) {
    const rule = resolvedByIdentifier.get(identifier)
    if (rule === undefined) {
      throw new Error(`Invariant references unknown rule ${identifier}`)
    }
    if (!rule.disabled) {
      resolvedInvariants.push(rule)
    }
  }

  return { rules: [...rulesById.values()], bundles, diagnostics: overlays.diagnostics, invariants: resolvedInvariants }
}
