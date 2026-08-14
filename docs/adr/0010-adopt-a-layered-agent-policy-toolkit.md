---
status: accepted
---

# Adopt a layered Agent Policy Toolkit

> *Provenance note: Originally authored in tms-frontend before the standalone Agent Policy Toolkit repository was established.*

The project will replace the idea of a single universal agent-instructions document with a versioned, portable **Agent Policy Toolkit**. The toolkit will keep reusable policy, workflows, roles, schemas, compilation, and harness adapters in an independent upstream npm package; consumer repositories will own neutral canonical configuration under `.agent-policy/` and commit deterministic harness-native projections. This separates always-loaded guidance from contextual capabilities, reduces startup context, preserves project ownership, and makes agent behavior reviewable across Codex, Claude Code, OpenCode, Pi, and Google Antigravity.

## Context

The historical Canonical Input Document is `React & Next.js — Universal LLM Development Rules` (see migration provenance in [catalog/evidence/universal-rules-migration.yaml](../../catalog/evidence/universal-rules-migration.yaml)). It originally combined universal agent behavior, implementation design, TypeScript, React, Next.js, asynchronous control flow, data boundaries, accessibility, security, testing, debugging, and verification in one document. DFD is historical inspiration only; the toolkit is neither a redistribution nor an adaptation layer for DFD.

A single large `AGENTS.md` or equivalent file would load irrelevant rules into every session, couple portable policy to one harness, and mix human-authored sources with generated configuration. Directly copying framework rules and workflows into each repository would also make updates and compatibility behavior drift across projects.

## Decision

The Agent Policy Toolkit will use the following layered model:

1. An intentionally small **Core Policy Bundle**, selected repository invariants, and concise routing instructions are always loaded.
2. Technology- and task-specific policy is compiled into conditionally activated Open Agent Skills.
3. Large multi-step procedures are canonical workflow skills.
4. Work that benefits from isolated context, tools, or parallelism is represented as an Agent Role with a semantics-preserving fallback skill.
5. Reliably enforceable requirements are implemented as Mechanical Controls in linting, types, tests, CI, or hooks and omitted from redundant prompt text.

Canonical shared rules are atomic, use stable namespaced Rule IDs, and are composed through bundle manifests. Project-owned rules use the same model. Project overlays may disable, extend, or replace shared rules only when the target rule's declared override policy permits it. The initial normalization preserves surviving imported `RULE_*` identifiers as aliases and records all merges, moves, and retirements as non-runtime migration provenance.

Each consumer repository owns `.agent-policy/` as its only canonical project-policy source. Harness entry files, skills, roles, and configuration are managed projections. Existing hand-written harness instructions remain unmanaged and untouched until an explicitly invoked classification workflow proposes a migration.

The cross-platform `agent-policy` Node CLI will perform deterministic schema validation, compilation, adapter projection, drift detection, migration, installation, update, checking, and removal. Mutating operations require a saved, validated, hash-bound Change Plan created outside the worktree; application revalidates that exact plan and writes transactionally after explicit approval. Generated runtime projections are committed and self-contained. `.agent-policy/` is preserved during uninstall unless a separate confirmed source purge is requested.

The `policy-maintainer` workflow will require explicit invocation. It owns classification and wording judgment but delegates validation and every filesystem mutation to the CLI. Project scope is the default; shared catalog changes require explicit upstream scope inside an Agent Policy Toolkit source repository. Consumer projects may produce portable upstream proposals but cannot modify installed package contents or external repositories.

The toolkit will include a read-only `DocsExplorer` Agent Role and a read-only `code-review` Review Orchestrator. `DocsExplorer` returns version-aware Evidence Packets from Context7 when appropriate and from direct primary sources when Context7 is unavailable, incomplete, or direct verification is useful. `code-review` resolves and reports an exact Change Set before running independent correctness, requirements, policy, and test lenses plus explicitly selected registered integrations.

The upstream starts as one modular npm package. Adapters treat concrete discovery paths and role mechanisms as versioned, tested knowledge: canonical capability is projected natively when verified and otherwise receives a semantics-preserving fallback. Version 1.0 requires supported, contract-tested adapters for Codex, Claude Code, OpenCode, Pi, and Google Antigravity.

Implementation will proceed upstream-first through independently usable prerelease slices. Every slice will be pinned and dogfooded in `tms-frontend` as the first real consumer. The first slice covers the compact Core, `implementation-design`, TypeScript, React, `async-control-flow`, `data-boundaries`, testing, the Codex adapter, and the complete basic lifecycle. Implementation begins only after this ADR is reviewed and accepted.

## Considered options

- **One large universal instructions file:** rejected because it consumes startup context for irrelevant domains and does not provide reliable progressive disclosure.
- **Shared Markdown files referenced by every harness:** rejected because discovery and inclusion semantics vary, making activation and updates unreliable.
- **Global developer configuration only:** rejected because repository teammates, automation, and CI would not receive reproducible project behavior.
- **Independent native sources for every harness:** rejected because policy, workflows, and role behavior would duplicate and drift.
- **A versioned canonical toolkit with generated adapters:** accepted because it centralizes reusable intent while preserving project-owned overlays and native harness behavior.

## Consequences

- The system incurs upfront schema, compiler, adapter, migration, testing, and release-maintenance cost.
- Harness compatibility must be demonstrated through capability-specific contract tests rather than asserted from file-format similarity.
- Implicit skill activation requires deterministic fixtures plus a separate model-based evaluation layer.
- Maintainers edit `.agent-policy/` and upstream canonical sources, not Managed Artifacts; detected drift must be reconciled explicitly.
- Toolkit versions describe behavioral compatibility, and projects update only through explicit, previewed, reviewable changes.
- `tms-frontend` gains incremental improvements as each usable prerelease slice is dogfooded instead of waiting for the complete version 1.0 feature set.
