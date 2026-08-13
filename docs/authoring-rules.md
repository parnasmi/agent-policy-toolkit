# Authoring Rules and Bundles

This document is for maintainers of the toolkit catalog and for maintainers proposing a project-owned policy change.

## Ownership boundary

The upstream toolkit owns shared canonical policy under `catalog/`:

```text
catalog/
├── rules/<namespace>/<rule>.md
├── bundles/<bundle>.yaml
├── evidence/
└── migrations/
```

The consumer owns its neutral project source under `.agent-policy/`. A consumer must not edit generated `AGENTS.md` regions or generated skill bodies as if they were canonical sources. A human may propose a policy change, but the deterministic compiler and CLI validate, project, plan, and apply it.

Existing hand-written harness guidance remains human-owned. Initialization does not classify, move, or rewrite existing prose. In particular, text before and after the Codex Managed Region in `AGENTS.md` is preserved byte-for-byte.

## Rule metadata

Every canonical rule starts with a YAML frontmatter document and uses a namespaced semantic ID:

```yaml
---
id: react.effect-discipline
status: active
strength: required
applicability:
  domains: [react]
override: explicit-task
enforcement: prompt
aliases: [RULE_EFFECT_DISCIPLINE]
---
```

The supported metadata is intentionally explicit:

- `id` — stable namespaced semantic identity;
- `status` — `active`, `deprecated`, or `retired`;
- `strength` — `required` or `recommended`;
- `applicability` — an extensible object, never a free-form scalar;
- `override` — the authority layers allowed to change the rule;
- `enforcement` — `prompt`, `mechanical`, `hybrid`, or `documentation`;
- `aliases` — surviving imported identifiers and compatibility names.

The body must contain exactly one non-empty `Instruction` section and one non-empty `Rationale` section. `Exceptions`, `Examples`, and `Verification` are optional. Section source is retained so render profiles select canonical text instead of inventing paraphrases.

The `Instruction` is one standalone imperative. The `Rationale` records the observed failure risk, durable constraint, primary-source requirement, or repository contract that justifies it; it must not merely restate the instruction.

Before version 1.0, imported IDs may be normalized. At version 1.0, canonical IDs become compatibility contracts. Wording, rationale, examples, and verification can improve without changing an ID when intent is preserved. A material semantic change gets a new ID. Deprecated rules link to replacements for at least one major release. A surviving imported `RULE_*` name remains an alias rather than a second rule.

## Evidence and classification

Policy ownership follows evidence:

- shared Core requires recurring, technology-independent failure evidence across independent projects;
- shared domain policy requires recurring domain failures or a durable primary-source constraint;
- project policy requires a real repository contract, architecture decision, or observed local failure;
- speculative guidance belongs in ordinary documentation until evidence justifies a policy rule.

Classify the behavioral role before deciding where it is shared:

1. If a reliable tool can enforce it, use a Mechanical Control.
2. If it guides nearly every task, consider Core Policy or a Repository Invariant.
3. If it applies to one technology or area, use a Domain Policy Skill or Project Policy Skill.
4. If it is a multi-step procedure, use a Canonical Workflow Skill.
5. If it needs isolated context, tools, workload configuration, or parallel work, use an Agent Role.
6. If it explains rather than guides behavior, use ordinary documentation.

The first foundation release contains only the compact Core and six domain bundles. `policy-maintainer`, Agent Roles, and other capability families are deferred; this catalog must not pretend those slices exist.

## Bundle manifests

Each bundle manifest declares `id`, `description`, ordered `members`, `applicability`, and `dependencies`:

```yaml
id: react
description: React component state, effects, hooks, events, and rendering decisions.
members:
  - react.unidirectional-data-flow
  - react.derived-state
  - react.effect-discipline
applicability:
  technologies: [react]
  filePatterns: ['**/*.tsx', '**/*.jsx']
  taskIntents: [component-change, hook-change, state-design, effect-design]
  exclusions: [non-react-template, documentation-only]
dependencies: []
```

Core has no activation hints and is always loaded. Domain bundles have semantic `technologies`, `filePatterns`, `taskIntents`, and `exclusions`; these are hints, not unconditional file triggers. A bundle must not use `**/*` as an unconditional activation pattern. Bundle member order is meaningful at render time, while catalog storage remains deterministic and sorted.

Every implicitly activated domain bundle ships at least five positive and five nearby-negative Activation Fixtures. The fixture validator checks structure and polarity only. It is not a semantic activation test; see [Activation Evals](activation-evals.md).

Dependencies are explicit and cycle-checked. The initial bundles are `core`, `implementation-design`, `typescript`, `react`, `async-control-flow`, `data-boundaries`, and `testing`. Core is automatically present in a resolved policy even when a consumer lists only a domain bundle.

## Project overlays and source lifecycle

Consumers customize shared rules through `.agent-policy/overlays/` directives:

- `disable` removes a shared rule from the project projection;
- `addendum` adds project-owned guidance while retaining the source rule;
- `replace-with` supplies an explicit replacement when the rule's override policy permits it.

Every directive names a target and a non-empty reason. Aliases resolve to canonical IDs before override checks. The catalog is never mutated by an overlay. A project may select bundle order and scoped profiles in its root `policy.yaml`; profiles stay root-discoverable and carry explicit workspace/path boundaries into skill descriptions.

The update lifecycle is explicit: change canonical or project-owned sources, compile and inspect a new plan, review the diff, then apply that exact plan. Drift is reconciled by a reviewed `adopt`, `regenerate`, or `abort` decision; there is no silent artifact adoption. Removal is source-preserving and only removes projections owned by this toolkit.

## Repository Invariants

Repository Invariants are small, project-owned instructions that apply across the repository. They live in `.agent-policy/invariants.yaml`, which is an optional canonical source separate from the root `policy.yaml`:

```yaml
rules:
  - id: repository.package-manager
    instruction: Use pnpm for repository commands.
    rationale: One package manager keeps installs reproducible.
  - id: repository.review-diff
    instruction: Review the complete diff before committing.
    rationale: Full review catches generated drift.
```

The `rules` list is both the selection and the projection order. Each item requires a unique namespaced `id` and a non-empty `instruction`; `rationale` is optional but, when present, must be non-empty. An empty `rules: []` selects no invariants. The CLI loads the file without rewriting it, includes it in the canonical source hash, and projects only the ordered instruction text into Codex's Managed Region. Existing prose is never mined into an invariant.

## Render profiles

One canonical rule supplies multiple deterministic projections:

- `core` selects the Instruction and essential Exceptions;
- `domain-skill` selects the Instruction, concise Rationale, and Exceptions;
- `code-review` selects the Rule ID, Instruction, and Verification;
- `maintainer` preserves the complete canonical body and source headings.

Profiles select existing sections. They do not synthesize a separately authored policy variant or silently broaden startup context.
