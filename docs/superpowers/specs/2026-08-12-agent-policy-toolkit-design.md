# Agent Policy Toolkit design

> *Provenance note: Originally authored in tms-frontend before the standalone Agent Policy Toolkit repository was established.*

**Status:** Approved design; implementation complete for Slice A (Codex foundation)

**Date:** 2026-08-12

**Decision:** [ADR-0010](../../adr/0010-adopt-a-layered-agent-policy-toolkit.md)

## 1. Purpose

The Agent Policy Toolkit is a portable, versioned system for maintaining AI coding-agent policy across frontend projects and agent harnesses. It replaces large universal instruction files with a layered model that keeps only essential behavior in startup context and loads domain policy, workflows, and isolated roles when relevant.

The toolkit is developed in an independent upstream repository and published as a single npm package. Consumer repositories own neutral canonical configuration under `.agent-policy/` and commit deterministic projections for their selected harnesses.

The historical document `React & Next.js — Universal LLM Development Rules` is the Canonical Input Document for the initial catalog (migration provenance in `catalog/evidence/universal-rules-migration.yaml`). DFD is Historical Inspiration only.

## 2. Goals

- Keep always-loaded policy intentionally small.
- Preserve the useful intent of the Canonical Input Document while separating it by behavioral role and domain.
- Make shared and project-specific policy independently maintainable.
- Use progressive disclosure for domain guidance and workflows.
- Move reliable, machine-checkable requirements into Mechanical Controls.
- Produce self-contained, committed harness projections from one source model.
- Support Codex, Claude Code, OpenCode, Pi, and Google Antigravity through tested adapters.
- Make installation, updates, drift reconciliation, and removal deterministic and reviewable.
- Provide explicit workflows for policy maintenance, documentation research, and code review.
- Dogfood every usable prerelease slice in `tms-frontend`.

## 3. Non-goals

- The toolkit does not redistribute or adapt DFD.
- It does not make every engineering preference a prompt rule.
- It does not store project policy canonically in harness-native files.
- It does not guarantee that every harness has identical native capabilities.
- It does not load every enabled domain bundle at session start.
- It does not edit Managed Artifacts through LLM judgment.
- It does not run arbitrary review commands or integrations.
- It does not make Git commits on behalf of lifecycle commands.
- It does not begin implementation before this design is reviewed.

## 4. Architectural principles

### 4.1 Layered runtime context

Runtime guidance has four layers:

1. **Always loaded:** the compact Core Policy Bundle, selected Repository Invariants, and concise capability routing.
2. **Conditionally loaded:** Domain Policy Skills and Project Policy Skills selected through semantic applicability.
3. **Workflow loaded:** Canonical Workflow Skills for multi-step procedures.
4. **Isolated:** Agent Roles for work that benefits from separate context, tools, workload configuration, or parallelism.

Reliably enforceable requirements become Mechanical Controls and leave prompt output once enforcement is dependable.

### 4.2 Source and projection ownership

The upstream toolkit owns shared canonical policy and deterministic projection logic. A consumer repository owns `.agent-policy/`. Harness-native files are Managed Artifacts or contain bounded Managed Regions.

Existing hand-written harness instructions remain unmanaged. Installation never moves, classifies, or rewrites them.

### 4.3 Native projection with semantic fallback

The stable compatibility contract is:

```text
canonical capability
→ verified native projection when available
→ semantics-preserving fallback otherwise
```

Concrete discovery paths and role mechanisms are versioned Adapter Knowledge, not permanent architecture contracts.

### 4.4 Deterministic mutation

Judgment may propose canonical-source changes. Only deterministic CLI modules may validate, project, plan, or mutate files. The exact reviewed Change Plan is the only unit that may be applied.

## 5. Repository structures

### 5.1 Upstream toolkit

The upstream begins as one TypeScript-authored npm package that emits ordinary Node-compatible JavaScript.

```text
catalog/
├── rules/
├── bundles/
├── evidence/
└── migrations/
skills/
├── policy-maintainer/
└── code-review/
roles/
└── docs-explorer/
src/
├── schema/
├── compiler/
├── adapters/
│   ├── codex/
│   ├── claude-code/
│   ├── opencode/
│   ├── pi/
│   └── antigravity/
├── planner/
├── applier/
└── cli/
tests/
├── fixtures/
├── contracts/
├── snapshots/
└── evals/
```

Independent packages or release cycles are deferred until concrete dependency or versioning evidence requires them.

### 5.2 Consumer project source

```text
.agent-policy/
├── policy.yaml
├── policy.lock.json
├── invariants.yaml
├── overlays/
│   └── rules.yaml
├── rules/
│   └── <namespace>/<rule>.md
├── bundles/
│   └── <bundle>.yaml
├── skills/
│   └── <name>/SKILL.md
├── roles/
│   └── <name>/
├── integrations/
│   └── <name>.yaml
└── evidence/
    └── <case>.md
```

`invariants.yaml` selects and orders atomic project rules. It does not contain free-form policy.

## 6. Canonical policy model

### 6.1 Atomic Policy Rules

Rules use namespaced semantic IDs such as `core.task-fidelity`, `react.effect-discipline`, and `testing.behavior-over-implementation`.

Required metadata is deliberately minimal:

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

`applicability` is extensible and may later represent richer scopes without changing the Rule ID model.

Every rule body contains:

```md
# Use effects only for external synchronization

## Instruction

One standalone imperative behavior.

## Rationale

The observed failure, durable risk, primary-source constraint, or repository contract that justifies the rule.
```

Optional sections are `Exceptions`, `Examples`, and `Verification`. Optional sections are omitted rather than filled with boilerplate.

### 6.2 Strength, authority, and override policy

Rule strength is normative:

- `required`
- `recommended`

Authority and conflict handling are separate from strength. Platform and safety constraints remain outside toolkit override authority. Shared defaults, project policy, and explicit task requirements occupy distinct Authority Layers.

Each rule declares which layers may override it. Overlay Directives and task instructions are invalid when the target rule's Override Policy forbids them.

### 6.3 Rule lifecycle

- Before version 1.0, imported IDs may be normalized.
- At version 1.0, canonical Rule IDs become compatibility contracts.
- Intent-preserving wording, rationale, example, and verification improvements retain the ID.
- Material semantic changes create a new Rule ID.
- Deprecated rules link to replacements for at least one major release.
- Surviving imported `RULE_*` identifiers remain Rule Aliases.

### 6.4 Project Overlay Directives

Projects customize shared rules without copying them:

- `disable`
- `addendum`
- `replace-with`

Every directive references a Rule ID, includes a reason, and must obey the target Override Policy. Updates report overlays affected by an upstream change.

### 6.5 Evidence standards

Evidence requirements depend on ownership:

- **Shared Core:** recurring cross-project failure plus technology and project independence.
- **Shared domain policy:** recurring domain failure or a durable primary-source constraint.
- **Project policy:** a real repository contract, architecture decision, or observed local failure.
- **Speculative guidance:** rejected as policy and retained, if useful, as ordinary documentation.

A security, framework, or repository constraint does not require an incident before documentation.

Core promotion requires recorded cases but no arbitrary fixed project count. Promotion Evidence is stored separately from runtime rules and linked from the promoted rule.

## 7. Enforcement-first classification

`policy-maintainer` classifies proposed instructions in this order:

1. Can a reliable tool enforce the requirement?
   - Yes: create or reference a Mechanical Control.
2. Does the behavior need to guide nearly every task?
   - Yes: distinguish shared Core Policy from a Repository Invariant.
3. Does it apply only to a technology or project area?
   - Yes: use a Domain Policy Skill or Project Policy Skill.
4. Is it a multi-step procedure?
   - Yes: use a Canonical Workflow Skill.
5. Does it need isolated context, tools, workload configuration, or parallel work?
   - Yes: use an Agent Role.
6. Is it explanatory rather than behavioral?
   - Yes: use ordinary documentation.

Behavioral role is determined before shared versus repository ownership and before choosing a target file.

## 8. Bundles and activation

### 8.1 Initial taxonomy

- Core Policy Bundle
- `implementation-design`
- `typescript`
- `react`
- `nextjs`
- `react-native`, with a Bundle Dependency on `react`
- `expo`, separate from bare React Native
- `async-control-flow`
- `data-boundaries`
- `accessibility`
- `security`
- `testing`
- `debugging`

React Native and Expo are planned taxonomy entries but later implementation slices.

### 8.2 Compact Core

The initial Core contains:

- `core.task-fidelity`
- `core.minimal-change`
- `core.name-stability`
- `core.style-consistency`
- `core.inspect-before-change`
- `core.architecture-consistency`
- `core.verify-before-completion`

The number seven is not an architecture contract. Core membership remains intentionally small and evidence-gated.

`core.architecture-consistency` means only the technology-independent principle of respecting an existing architecture. Concrete architecture contracts remain Repository Invariants or contextual project policy.

### 8.3 `implementation-design`

This bundle covers only structural implementation choices:

- reuse before creation;
- abstraction restraint;
- straightforward implementation;
- dependency restraint;
- explicit, localized side effects.

Testing, errors, comments, dead-code cleanup, framework behavior, architecture contracts, and diff hygiene do not belong in this bundle.

### 8.4 Async and data separation

`async-control-flow` covers overlapping operations, stale results, cancellation, explicit failure behavior, and user-visible asynchronous states.

`data-boundaries` covers public contract stability, external-data normalization, and runtime validation at untrusted boundaries.

Both may activate for one task.

### 8.5 React Native

The planned React Native bundle adds seven durable mobile concerns to the React dependency:

- use React Native primitives rather than DOM assumptions;
- isolate platform differences behind stable shared boundaries;
- design for safe areas, keyboards, and variable dimensions;
- preserve mobile accessibility and usable touch targets;
- use virtualized collections for potentially large data sets;
- treat native modules, permissions, and lifecycle as explicit boundaries;
- verify platform-sensitive behavior on suitable native builds or devices.

### 8.6 Expo

The optional Expo bundle covers:

- preserving managed, prebuild, or bare workflow ownership;
- repeatable native configuration through app config and config plugins;
- existing Expo Router or navigation conventions;
- compatibility with the installed Expo SDK;
- native-build boundaries for permissions, identifiers, schemes, entitlements, and plugins;
- explicit EAS build/update environments and public client-exposed configuration.

Version-sensitive APIs and commands are retrieved through documentation workflows rather than embedded in durable rules.

### 8.7 Applicability Hints

Bundle metadata may declare:

- technologies;
- file or workspace patterns;
- task intents;
- exclusions;
- Bundle Dependencies.

These are activation hints, not unconditional file triggers. Adapters compile them into concise semantic skill descriptions.

Every implicitly activated skill provides positive and negative Activation Fixtures. Deterministic CI validates fixture structure and adapter projections. Actual semantic selection behavior is tested separately through model-based Activation Evals.

## 9. Render Profiles

One canonical rule supports deterministic, meaning-preserving projections:

- **Core:** compact Instruction plus essential Exceptions.
- **Domain skill:** Instruction, concise Rationale, and Exceptions.
- **Code review:** Instruction, Verification, and Rule ID.
- **Maintainer documentation:** complete canonical body.

Render Profiles select source sections; they do not rewrite policy meaning or introduce separately authored variants.

## 10. Migration of the Canonical Input Document

The 44 original rules normalize to 38 atomic shared rules.

| Original rules | Canonical destination | Disposition |
| --- | --- | --- |
| 1 | `core.task-fidelity` | Retain |
| 2, 44 | `core.minimal-change` | Merge; preserve both aliases |
| 3 | `core.name-stability` | Retain |
| 4 | `core.style-consistency` | Retain |
| 5, 41, 42 | `core.inspect-before-change` | Merge inspection, evidence, and assumption discipline |
| 6 | `core.architecture-consistency` | Retain only the technology-independent principle |
| 39, 40 | `core.verify-before-completion` | Merge verification and diff review |
| 7, 8, 9, 33, 36 | `implementation-design` | Keep as five separate rules |
| 10, 11 | `typescript` | Type safety and source-type reuse |
| 12, 28, 29 | `data-boundaries` | Runtime validation, contract stability, normalization |
| 13–19 | `react` | Seven React rules |
| 20, 22–24 | `nextjs` | Four Next.js rules |
| 21, 31, 32 | `security` | Secrets, untrusted input, authorization boundary |
| 25–27 | `async-control-flow` | Overlap, failure behavior, UI states |
| 30 | `accessibility` | Web accessibility baseline |
| 34, 35 | `testing` | Behavior focus and change-driven coverage |
| 43 | `debugging` | Root-cause discipline |
| 37 | Ordinary or project documentation | No shared catch-all bundle without evidence |
| 38 | Mechanical Controls plus Core verification | Retire standalone prompt rule |

Migration Provenance preserves the rationale for every merge, move, and retirement and all surviving aliases. It is not compiled into runtime context.

## 11. Manifest and scoped profiles

`policy.yaml` records:

- exact toolkit version;
- selected harness targets;
- Bundle Selection;
- scoped profiles;
- render and adapter options;
- optional review defaults;
- optional CI integration selection.

The exact schema is versioned and migratable. The lockfile records resolved versions, Adapter Knowledge versions, and Managed Artifact hashes.

Initialization inspects dependencies and configuration, proposes detected bundles, and requires confirmation. Detection never changes Bundle Selection automatically.

Monorepos use one root manifest with Scoped Profiles. Profile skills remain root-discoverable and use path/workspace Applicability Hints. Nested Managed Regions are generated only for subtree invariants that must be always loaded when a session starts there.

## 12. Managed projections

### 12.1 Entry-file content

The root managed region contains only:

- compiled compact Core;
- selected Repository Invariants;
- concise routing for contextual skills, workflows, and roles.

Domain rule bodies, workflows, role instructions, and evidence remain outside startup context.

The CLI owns only marker-delimited regions inside project-owned entry files. Content outside those regions is preserved byte-for-byte.

### 12.2 Skills

Canonical Workflow Skills use the Open Agent Skills format. A shared committed `.agents/skills/` projection is preferred where current Adapter Knowledge proves support. Harness-specific copies are generated only when required and share canonical hashes.

Symlinks are not used.

### 12.3 Agent Roles

Canonical role metadata contains:

```yaml
---
name: docs-explorer
description: Version-aware documentation research specialist
workload: read-heavy
permissions: read-only
capabilities: [repository-read, context7, official-web]
fallback-skill: docs-explorer
output-language: en
---
```

The Markdown body defines mission, inputs, workflow, source policy, output contract, and boundaries.

Workload Profiles are vendor-neutral. Adapters map them to available models; projects may explicitly override models per harness.

## 13. Harness support

Every adapter declares a Harness Capability Profile covering:

- instruction discovery;
- skill discovery;
- native roles;
- isolated and parallel work;
- tool access;
- scoped instruction behavior.

An Experimental Adapter is available without compatibility guarantees. A Supported Adapter passes capability-specific contracts for ownership, discovery, native or fallback semantics, update, drift, and removal.

Version 1.0 requires Supported Adapters for:

- Codex;
- Claude Code;
- OpenCode;
- Pi;
- Google Antigravity.

Concrete projection paths remain versioned Adapter Knowledge.

## 14. CLI and lifecycle

### 14.1 Distribution

The product and repository name is **Agent Policy Toolkit**. The executable is `agent-policy`. The consumer source directory is `.agent-policy/`.

The package uses a scoped placeholder such as `@your-scope/agent-policy-toolkit` until a publishing organization is chosen. `npx` or `pnpm dlx` may bootstrap the package; the project then records an exact development dependency.

An optional shell wrapper may provide Unix convenience, but it is not the canonical installer or lifecycle implementation.

### 14.2 Planning commands

```text
agent-policy init|update|remove ... --plan <file>
agent-policy diff <file>
agent-policy apply <file>
agent-policy check
```

Planning commands:

1. inspect canonical sources, pinned versions, profiles, targets, and current artifacts;
2. run deterministic schema migrations in external staging;
3. compile selected projections in staging;
4. validate ownership, paths, hashes, and contracts;
5. save a validated, hash-bound Change Plan;
6. leave the worktree untouched.

`agent-policy apply` rechecks every plan precondition, asks for confirmation, and writes transactionally. `--yes` is accepted only for an already saved and validated plan.

The CLI leaves the repository ready to commit; it does not create Git commits.

### 14.3 Initialization

- Inspect technology and repository evidence.
- Propose Bundle Selection and target harnesses.
- Require confirmation before applying selection.
- Preserve existing hand-written harness content.
- Insert only bounded Managed Regions.
- Never classify existing prose.

### 14.4 Updates and migrations

Projects pin an exact toolkit version. Updates preview shared rule, project source, skill, role, and projection changes together.

Versioned deterministic migrators run only in staging. Major-version migration requires an explicit target version. Migration changes are part of the same reviewed Change Plan as generated output.

Toolkit semantic versioning describes behavioral compatibility:

- **Major:** incompatible default behavior, precedence, schema, or generated ownership changes.
- **Minor:** new opt-in rules, bundles, capabilities, or adapters.
- **Patch:** intent-preserving fixes and clarifications.

### 14.5 Drift

Managed Artifact drift is never overwritten silently.

Interactive reconciliation offers:

- adopt representable intent into canonical sources;
- regenerate and discard the manual artifact edit;
- abort.

Non-interactive commands fail on unresolved drift.

### 14.6 Check and CI

`agent-policy check` is read-only. It validates schemas, IDs, aliases, dependencies, overlays, ownership, migrations, projections, and hashes by compiling in temporary staging and comparing committed output.

CI integration is optional and independently removable. Interactive initialization may offer it; non-interactive setup requires `--ci <provider>`. `agent-policy remove --ci` does not affect local checking or other toolkit installation.

### 14.7 Removal

- Harness projections are independently removable.
- CI wiring is independently removable.
- General uninstall removes generated artifacts and package wiring.
- `.agent-policy/` is preserved by default.
- Source deletion requires a separate explicit and confirmed `--purge-sources` action.

## 15. `policy-maintainer`

`policy-maintainer` requires explicit invocation and has two independent gates:

1. explicit invocation and action scope;
2. explicit approval of the generated Change Plan.

Supported action families are:

```text
classify
classify-existing
rule create|revise|deprecate|promote
bundle create|revise
skill create|revise
role create|revise
overlay create|revise
target add|remove
ci add|remove
update
uninstall
```

`--scope project` is the default and may propose changes only to `.agent-policy/` .

`--scope upstream` is valid only inside an Agent Policy Toolkit source repository. A consumer that discovers a shared candidate produces an upstream proposal containing:

- evidence;
- rationale;
- suggested Rule ID;
- suggested bundle;
- proposed semantic change.

It does not modify the installed package or clone or mutate an external repository.

The skill owns judgment and explanation. The CLI owns validation, staging, preview, projection, application, and removal.

## 16. `DocsExplorer`

`DocsExplorer` is a read-only Agent Role with a Role Fallback Skill.

A narrow lookup normally remains inline and uses Context7 when available and appropriate. Delegation occurs when research spans multiple independent technologies, broad or version-sensitive material, source comparison, or enough retrieved content to pollute the main context.

Allowed operations:

- inspect manifests, lockfiles, installed versions, and relevant configuration;
- resolve and query Context7;
- retrieve direct primary sources such as official `llms.txt`, Markdown documentation, API references, repositories, and release notes;
- use clearly labeled community evidence only when primary sources cannot answer.

The role cannot modify code, policy, configuration, or generated files.

Independent lookups use bounded, dependency-aware parallelism. Session-scoped caching keys results by library, version, and query.

The English Evidence Packet contains:

- resolved library and version;
- direct task-specific answer;
- minimal examples;
- source links;
- compatibility caveats;
- unresolved uncertainty.

## 17. `code-review`

`code-review` is a read-only Review Orchestrator.

### 17.1 Invocation

```text
$code-review
  [--worktree | --staged | --commit <ref> | --base <ref> | --range <a>..<b>]
  [--path <glob>]...
  [--require <text|@file>]...
  [--with <registered-integration>]...
  [--only <lens>]...
  [--skip <lens>]...
  [--strict-integrations]
  [--format markdown|json]
```

Change-set selectors are mutually exclusive. Unknown or contradictory flags fail with concise help. Version 1 integration selection accepts no arbitrary forwarded arguments.

### 17.2 Default Change Set resolution

When no selector is supplied:

1. Select staged, unstaged, and untracked worktree changes relative to `HEAD` when any exist.
2. Otherwise use a resolvable `review.defaultBase` from `policy.yaml`.
3. Otherwise use the current branch's single configured upstream.
4. Otherwise use a locally available remote-default-branch reference only when it resolves to one unambiguous base.
5. Fail when no unique base exists or when the resulting Change Set is empty.

The orchestrator reports selector, refs, merge base, paths, and included change categories before review begins.

### 17.3 Requirements

`--require` accepts repeated inline or file-backed Supplemental Requirements.

Without explicit requirements, the Requirements Lens searches:

- unambiguous issue references in commits;
- the configured issue tracker;
- branch-matching PRDs or specifications;
- relevant task files.

Conflicting candidates require clarification. Absence is reported rather than inferred from the diff.

### 17.4 Lenses and integrations

Four lenses run by default:

- correctness;
- requirements;
- policy;
- tests.

Security and accessibility policy enters applicable lenses through bundle activation.

Lenses run as isolated parallel workers where supported and as separate sequential contexts otherwise.

The Integration Registry permits only declared skills, commands, tools, or APIs. Each integration declares its stable name, kind, availability check, accepted schema, and output adapter. Command execution occurs only through an explicitly selected integration.

Requested integration failure is non-fatal by default and appears in the report. `--strict-integrations` makes it fatal. Skill integrations use native composition when verified and an isolated read-only fallback otherwise.

### 17.5 Findings

Every Review Finding contains:

- normalized severity: `critical`, `high`, `medium`, or `low`;
- separate confidence;
- source attribution;
- attributable location or scope;
- evidence;
- impact;
- suggested remediation;
- original external metadata.

Location scope may be:

- file plus line or line range;
- whole file;
- selected Change Set or commit range;
- repository level.

The narrowest honest scope is required. Findings merge only when location, cause, and impact match. Supporting sources remain visible, and disagreements are surfaced.

The review never edits its Change Set. Remediation is a separate workflow that may consume selected finding IDs.

## 18. Compiler and runtime modules

- **Schema:** parse and validate upstream and project sources into normalized intermediate representation.
- **Compiler:** resolve aliases, overlays, dependencies, ordering, applicability, and Render Profiles.
- **Adapters:** generate virtual native artifact sets without filesystem writes.
- **Planner:** compare virtual artifacts, sources, ownership markers, and hashes to create a Change Plan.
- **Applier:** revalidate preconditions and perform the only transactional filesystem writes.
- **CLI:** coordinate modules without duplicating their domain logic.

All diagnostics identify the source path, relevant Rule ID or artifact, cause, and remediation. Validation, compilation, adapter, or precondition failure writes nothing. Managed paths are normalized and confined to declared repository roots.

## 19. Verification strategy

Normal deterministic CI covers:

- schema and metadata validation;
- Rule IDs, aliases, lifecycle, and Overlay Directives;
- dependency and bundle ordering;
- Render Profile output;
- path and ownership safety;
- hashing and stale-plan detection;
- adapter projections and contract fixtures;
- positive and negative Activation Fixture structure;
- lifecycle fixtures for existing files, drift, migration, failure, and removal;
- cross-platform CLI behavior on maintained Node environments.

Model-based Activation Evals separately verify actual semantic activation behavior. They are required before stable skill or adapter promotion and rerun after material trigger descriptions, adapters, or target models change.

Deterministic tests do not claim to prove model selection behavior.

## 20. Delivery roadmap

### Slice A: Codex foundation

Deliver:

- compact Core;
- `implementation-design`;
- TypeScript;
- React;
- `async-control-flow`;
- `data-boundaries`;
- testing;
- manifest and lockfile;
- schema, compiler, Codex adapter, planner, and applier;
- managed entry region and shared skills;
- planning, diff, application, checking, and source-preserving removal;
- deterministic tests and adapter interfaces.

Publish a pinned prerelease and dogfood it immediately in `tms-frontend`.

### Later slices

1. `policy-maintainer`, classification audit, and upstream proposals.
2. Agent Role infrastructure and `DocsExplorer`.
3. `code-review` lenses and registered integrations.
4. Next.js, security, accessibility, and debugging bundles.
5. React Native and Expo bundles.
6. Claude Code, OpenCode, Pi, and Antigravity adapter promotion.
7. Version 1.0 hardening.

After the foundation, slice order may change when dogfood evidence supports it. Each slice remains independently usable.

Every slice follows:

```text
implement upstream
→ pass deterministic and capability contracts
→ publish an exact prerelease
→ install in tms-frontend
→ use on real work
→ feed defects and evidence upstream
```

## 21. Version 1.0 acceptance criteria

- Canonical Rule IDs are stable and aliases are documented.
- Migration Provenance covers the Canonical Input Document.
- Schema migrations and projections are deterministic and reproducible.
- All five named harness adapters pass Supported Adapter contracts.
- Lifecycle, drift, and removal behavior passes cross-platform tests.
- Stable implicit skills pass model-based Activation Evals.
- `DocsExplorer`, `code-review`, and `policy-maintainer` honor their read/write and invocation boundaries.
- Maintainer documentation explains authoring, classification, installation, updating, reconciliation, and removal.

## 22. Deferred implementation choices

The following are deliberately selected during implementation planning rather than treated as architecture contracts:

- final npm organization and package scope;
- schema-validation library;
- build and bundling tool;
- test runner;
- current native paths and model mappings inside each adapter;
- exact CI-provider job syntax;
- optional Unix shell-wrapper packaging.

These choices must satisfy the contracts in this design and cannot weaken ownership, determinism, review gates, or portability.
