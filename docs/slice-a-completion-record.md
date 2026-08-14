# Agent Policy Toolkit — Slice A Completion Record

**Date:** 2026-08-14  
**Status:** CLOSED / ACCEPTED  
**Slice:** Slice A — Codex Foundation  
**Package:** `@agent-policy/agent-policy-toolkit`  
**Foundation Release:** `0.1.0-alpha.2`  
**Git Tag:** `v0.1.0-alpha.2`  
**Release Commit:** `42dfdf2d5d1f1eb26ead44580a2036bd6f367b85` (`42dfdf2 chore: release 0.1.0-alpha.2`)  

---

## 1. Final Slice A Baseline

- **Branch:** `main`
- **Worktree:** Clean (`nothing to commit, working tree clean`)
- **Release Commit:** `42dfdf2 chore: release 0.1.0-alpha.2`
- **Recent Git Log:**
  ```text
  42dfdf2 chore: release 0.1.0-alpha.2
  2bdfd5f Merge pull request #1 from parnasmi/fix/init-bootstrap
  767984c fix: complete init bootstrap lifecycle
  d5f735d feat: stage a bootstrap policy manifest during init
  75d0cd3 docs: record init bootstrap defect
  a98d34a chore: release 0.1.0-alpha.1
  67e7b56 fix: scope Managed Region detection to known entry files
  aed1453 fix: close exceptional lifecycle review gaps
  6d3c60a fix: close final Codex foundation review gaps
  92b4441 fix: harden source-less and boundary-safe removal
  ```
- **Feature Status:** No post-Slice-A feature work has started.

---

## 2. Published Foundation Identity

```text
Package:
@agent-policy/agent-policy-toolkit

Foundation release:
0.1.0-alpha.2

Git tag:
v0.1.0-alpha.2
```

### Published Artifact Identity (npm Registry)

- **Registry URL:** `https://registry.npmjs.org/@agent-policy/agent-policy-toolkit/-/agent-policy-toolkit-0.1.0-alpha.2.tgz`
- **Integrity (SHA-512):** `sha512-v+Q1ZitB7X5GpLRBoRNpqVk3EztIAyk/v9+AUTnLhHsqVv95Yfla41TuuERK+zc7lzxuXtJTq9t/2hatrMXrgQ==`
- **Shasum (SHA-1):** `f4aaef5598698bd3b9a71085c4a048ce45034969`
- **Unpacked Size:** 289,947 bytes (91 files)
- **Dist-Tags:** `alpha: 0.1.0-alpha.2`, `latest: 0.1.0-alpha.1`
- **Engines:** `node: >=22.20.0`
- **Executable Binary:** `agent-policy: ./dist/cli/bin.js`

### Release Lineage

1. `0.1.0-alpha.0` (2026-08-13): Initial foundation prerelease tarball (`10bacefbff01525d9a8120787bb90d3d4b1ce883abaf08828e38cb45df4fea63`).
2. `0.1.0-alpha.1` (2026-08-14, tag `v0.1.0-alpha.1`): Scoped Managed Region detection to declared entry files to resolve marker-quoting false positives.
3. `0.1.0-alpha.2` (2026-08-14, tag `v0.1.0-alpha.2`): Added fresh-consumer `agent-policy init` bootstrap manifest staging and absence precondition validation.

---

## 3. Delivered Slice A Scope

Slice A delivers the complete Codex Foundation capability set:

- **Compact Core Policy Bundle:** 7 foundational rules (`architecture-consistency`, `inspect-before-change`, `minimal-change`, `name-stability`, `style-consistency`, `task-fidelity`, `verify-before-completion`) projected into harness startup context.
- **Contextual Domain Bundles:** Six domain bundles and their atomic rule catalogs:
  - `implementation-design` (5 rules: `abstraction-restraint`, `dependency-restraint`, `localized-side-effects`, `reuse-before-creation`, `simplicity`)
  - `typescript` (2 rules: `preserve-type-safety`, `reuse-source-types`)
  - `react` (7 rules: `component-responsibility`, `derived-state`, `effect-discipline`, `event-logic`, `hook-safety`, `optimization-restraint`, `unidirectional-data-flow`)
  - `async-control-flow` (3 rules: `explicit-failure-behavior`, `overlap-safety`, `user-visible-states`)
  - `data-boundaries` (3 rules: `normalize-external-data`, `public-contract-stability`, `runtime-validation`)
  - `testing` (2 rules: `behavior-over-implementation`, `change-driven-coverage`)
- **Canonical Manifest and Lock Lifecycle:** Project-owned `.agent-policy/policy.yaml`, optional `.agent-policy/invariants.yaml`, declared overlays, and generated integrity record `.agent-policy/policy.lock.json`.
- **Schema and Policy Loading:** JSON Schema validation via Ajv, YAML frontmatter parsing, duplicate detection, and strict repository path confinement.
- **Deterministic Compilation:** Layered overlay resolution, profile resolution, schema migrations, and rule rendering without side effects.
- **Pure Codex Projection Adapter:** Capability profile `codex-2026-08-12` emitting ordinary files with explicit ownership metadata.
- **Managed Region Handling:** Bounded `<!-- agent-policy:start ... -->` ... `<!-- agent-policy:end -->` in `AGENTS.md`, preserving surrounding unmanaged prose and line endings byte-for-byte.
- **Shared Generated Skills:** Discoverable skills under `.agents/skills/*/SKILL.md` with explicit ownership headers and LF/CRLF compatibility.
- **Change Plan Creation and Diff:** Hash-bound, reviewed external Change Plan files (`.json`) with deterministic SHA-256 digest and human-readable diff formatting.
- **Transactional Apply:** Absence and source hash preconditions, atomic writes, portable hard-link safety, and rollback support upon failure.
- **Read-Only Check:** Temporary staging compilation comparing committed outputs against desired state without modifying consumer files.
- **Source-Preserving Removal:** Target removal (`remove --target codex`) and generated removal (`remove --generated`) preserving `.agent-policy/` canonical sources.
- **Fresh-Consumer Bootstrap:** In-memory minimal manifest staging for `init` on repositories without `.agent-policy/`, recorded as a reviewed `create` canonical source change.

---

## 4. Verification Evidence

All verification gates passed on the final Slice A baseline:

- **Full Toolkit Verification (`pnpm check`):** PASS (typecheck + test + build).
- **Test Matrix (`vitest run`):** 19 test files passed, 186 tests passed across unit, contract, and CLI suites.
- **Typecheck (`tsc -p tsconfig.json --noEmit`):** PASS (zero type errors).
- **Production Build (`tsc -p tsconfig.json`):** PASS (compiled cleanly to `dist/`).
- **Package Content Check (`pnpm pack:check`):** PASS (91 files matching package contract: `dist/`, `catalog/`, `schemas/`, `docs/`, `CHANGELOG.md`, `README.md`, `LICENSE`).
- **Packed-Package Smoke:** PASS (isolated test installation verified `agent-policy --help`, `init`, `diff`, `apply`, and `check`).
- **NPM Registry Smoke:** PASS (installed from registry, verified command execution and plan generation).
- **Fresh-Consumer `init --plan`:** PASS (verified zero mutation to consumer worktree during planning).
- **Transactional Application:** PASS (verified reviewed plan creates canonical sources and projections atomically).
- **Repeated Policy Check:** PASS (`agent-policy check` passed cleanly without worktree mutation).

---

## 5. First-Consumer Dogfood Acceptance

The sibling repository `tms-frontend` served as the first real consumer for Slice A dogfooding (branch `feat/llm-rules`):

- **Dogfood Acceptance:** Completed and ACCEPTED.
- **Unmanaged `AGENTS.md` Content:** Verified byte-preserved (preamble and project-specific instructions outside the Managed Region, SHA-256 `0522a233...` preserved).
- **Pre-Existing Hand-Authored Skills:** Verified byte-preserved (`applying-tms-patterns`, `implementing-tms-modernization-issue` untouched).
- **Activation Observations:** 5 bounded test scenarios exercised and recorded.
- **Drift Reconciliation:** Exercised interactive and strict drift options (`abort`, `regenerate`, `adopt`).
- **Removal and Reinitialization:** Exercised `agent-policy remove --target codex` and verified subsequent reinitialization produces byte-identical projections.
- **Registry Version Upgrade:** Upgraded from initial local dogfood tarball (`0.1.0-alpha.1`) to exact published npm registry version `@agent-policy/agent-policy-toolkit@0.1.0-alpha.2`.
- **Consumer Verification:** Repeated `pnpm policy:check` (`agent-policy check`) and proportionate consumer checks (`check:config`, `format:check`, `git diff --check`) passed cleanly.
- **Observation Boundary:** Deterministic verification is kept strictly distinct from model activation observations; no unsupported claims of model-based semantic activation are made.

---

## 6. Defects Discovered and Resolved During Dogfood

Two defects were discovered during first-consumer dogfooding and resolved upstream in the toolkit repository:

### Defect 1: Managed Region Detection False-Positive on Marker-Quoting Prose

- **Symptom:** Repository documentation quoting the Managed Region markers (such as plan or ADR documents) caused `agent-policy check` to fail with `Unexpected generated artifacts`.
- **Root Cause:** `findGeneratedFiles` / `hasManagedRegion` scanned all repository files without restricting managed-region classification to declared instruction entry files or requiring generated ownership headers.
- **Upstream Resolution:** Scoped managed-region detection to adapter-declared instruction entry files (`AGENTS.md`) and lock-recorded paths. Released in `@agent-policy/agent-policy-toolkit@0.1.0-alpha.1` (commit `67e7b56`).

### Defect 2: Missing Fresh-Consumer Bootstrap Path in `agent-policy init`

- **Symptom:** Running `agent-policy init` in a fresh repository lacking `.agent-policy/policy.yaml` failed with `MISSING_MANIFEST_REFERENCE: ENOENT`.
- **Root Cause:** `prepareBundleSelection` called `loadProjectPolicy`, which required a pre-existing manifest file on disk.
- **Upstream Resolution:** Implemented in-memory manifest staging, added `create` operation to `SourceChange`, enforced absence preconditions, and corrected dangling-symlink resolution. Released in `@agent-policy/agent-policy-toolkit@0.1.0-alpha.2` (commits `d5f735d`, `767984c`, `42dfdf2`).

---

## 7. Slice A Completion Gate Evaluation

| Criterion | Applicable to Slice A | Status | Evidence / Notes |
| :--- | :---: | :---: | :--- |
| Clean typecheck, build, and test suite | Yes | **SATISFIED** | 19 test files, 186 tests passing, zero TypeScript diagnostics |
| Clean package content contract check | Yes | **SATISFIED** | `pack:check` validates exact published whitelist (`dist`, `catalog`, `schemas`, `docs`, `CHANGELOG.md`, `README.md`, `LICENSE`) |
| Verified published package artifact | Yes | **SATISFIED** | `@agent-policy/agent-policy-toolkit@0.1.0-alpha.2` published on npm registry with verified checksums |
| Codex adapter capability contract | Yes | **SATISFIED** | Profile `codex-2026-08-12`, experimental status, `AGENTS.md` Managed Region, generated skills |
| Lifecycle contracts (byte preservation, drift, profiles, safe removal, bootstrap) | Yes | **SATISFIED** | Verified across contract tests and temporary-repo CLI lifecycle suites |
| First-consumer dogfood accepted in `tms-frontend` | Yes | **SATISFIED** | Dogfood completed, upgraded to registry `0.1.0-alpha.2`, policy checks passing |
| Upstream defect resolution | Yes | **SATISFIED** | Both marker-quoting and init-bootstrap defects resolved upstream in `alpha.1` and `alpha.2` |
| Model-based Activation Evals | No (deferred) | **INTENTIONALLY DEFERRED** | Deterministic fixture structure/polarity validation only; no semantic activation claims made |
| Extended harness adapters (Claude Code, OpenCode, Pi, Antigravity) | No (deferred) | **INTENTIONALLY DEFERRED** | Approved roadmap defers non-Codex adapters |
| Additional domain bundles (DocsExplorer, code-review, Next.js, RN/Expo) | No (deferred) | **INTENTIONALLY DEFERRED** | Approved roadmap defers additional bundles |
| Maintainer tooling (`policy-maintainer`, audit/proposals) | No (deferred) | **INTENTIONALLY DEFERRED** | Approved roadmap defers `policy-maintainer` |
| Extended lifecycle (source purge, package-wiring uninstall, CI integration, crash journaling) | No (deferred) | **INTENTIONALLY DEFERRED** | Approved roadmap defers extended lifecycle |

### Gate Result

```text
Slice A accepted: YES
```

**Reason:** All delivered Foundation scope items are implemented and verified. All 19 test files (186 tests) pass, the package `@agent-policy/agent-policy-toolkit@0.1.0-alpha.2` is published on the npm registry, the first real consumer dogfood in `tms-frontend` is accepted with all reported defects resolved upstream, and all out-of-scope capabilities are explicitly and intentionally deferred per the approved roadmap.

---

## 8. Intentionally Deferred Work

The following capabilities are explicitly deferred to subsequent slices per the approved roadmap:

- `policy-maintainer` CLI and automated maintenance workflows
- Classification audit and upstream proposal workflows
- Agent Role infrastructure and role-specific policy compilation
- DocsExplorer bundle and documentation-routing tooling
- Code-review bundle and review-specific rule sets
- Remaining web bundles (Next.js, styling/Tailwind, state management patterns)
- React Native and Expo mobile bundles
- Non-Codex harness adapters (Claude Code, OpenCode, Pi, Google Antigravity)
- Model-based stable activation evaluation and promotion
- Extended lifecycle capabilities (source purge, package-wiring uninstall, CI integration, crash journaling)

---

## 9. Closure Statement

**Agent Policy Toolkit Slice A (Codex Foundation) is formally CLOSED.**
