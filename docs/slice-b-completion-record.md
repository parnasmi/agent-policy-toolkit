# Agent Policy Toolkit — Slice B Completion Record

**Date:** 2026-08-17
**Slice:** Slice B — `policy-maintainer`, Classification Audit, and Upstream Proposals
**Package:** `@agent-policy/agent-policy-toolkit`
**Release:** `0.1.0-alpha.3`
**Design Spec:** [`docs/superpowers/specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md`](./superpowers/specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md)
**Implementation Plan:** [`docs/superpowers/plans/2026-08-17-agent-policy-toolkit-policy-maintainer.md`](./superpowers/plans/2026-08-17-agent-policy-toolkit-policy-maintainer.md)

---

## Lifecycle State

| Stage | Status | Notes |
| :--- | :---: | :--- |
| **Slice B Upstream Implementation** | **COMPLETE** | All 10 tasks implemented, reviewed, and passing 28 test suites (255 tests). |
| **Slice B Release** | **COMPLETE** | Released `0.1.0-alpha.3` to npm registry under `alpha` dist-tag; packed & registry smoke tests passed. |
| **Slice B Consumer Dogfood** | **PENDING** | Consumer dogfooding in `tms-frontend` to be performed in subsequent task. |
| **Slice B Final Acceptance** | **PENDING** | Full slice acceptance pending dogfood validation. |

---

## 1. Release & Registry Artifact Identity

* **Package:** `@agent-policy/agent-policy-toolkit`
* **Version:** `0.1.0-alpha.3`
* **Release Commit:** [`1de2f3c83fac8fe3e922126ad06b847b7e00dc96`](https://github.com/paynet/agent-policy-toolkit/commit/1de2f3c83fac8fe3e922126ad06b847b7e00dc96) (`chore: release 0.1.0-alpha.3`)
* **Git Tag:** `v0.1.0-alpha.3`
* **Registry URL:** `https://registry.npmjs.org/@agent-policy/agent-policy-toolkit/-/agent-policy-toolkit-0.1.0-alpha.3.tgz`
* **Integrity (SHA-512):** `sha512-RH9QiBeOFg59zgOmvI8F3/5F/pLk73ehEM+ovRCdRO9KmiuRXYbQyocVgfQqZaX33x5HCCDNIcAVdkPZKTd0fQ==`
* **Shasum (SHA-1):** `910c333abfe99a7c53815699ac89947872212b97`
* **SHA-256:** `8d6af1bd93da13faf1ee9ed27a5317ae4ef1080187048acb195017a916529425`
* **Unpacked Size:** 504,245 bytes (115 files)
* **Dist-Tags:** `alpha: 0.1.0-alpha.3`, `latest: 0.1.0-alpha.1`
* **Publication Timestamp:** `2026-08-17T11:14:35.404Z`

---

## 2. Summary of Implemented Capabilities

Slice B delivers the complete policy maintenance and governance foundation for Agent Policy Toolkit:

1. **Deterministic JSON Schemas (Draft 2020-12):**
   - `schemas/audit-output-v1.schema.json`: Strict schema for unmanaged text scanner outputs with 1-indexed line spans and SHA-256 digests.
   - `schemas/classification-report-v1.schema.json`: Complete maintainer judgment schema with 6-tier classification, action compatibility matrices, and evidence requirements.
   - `schemas/proposal-v1.schema.json`: Portable upstream proposal format preserving consumer origin provenance, semantic changes, and rule metadata.

2. **Domain Models & Type Safety:**
   - `src/domain/audit.ts`: Readonly interfaces, type-guards, and constants for audit outputs and classification reports.
   - `src/domain/proposal.ts`: Readonly interfaces and type-guards for upstream proposals.
   - `src/domain/policy.ts`: Updated `RepositoryInvariantsConfig` to represent `{ rules: string[] }` (ordered list of namespaced Rule IDs).

3. **Deterministic Unmanaged Content Scanner:**
   - `src/audit/scan.ts`: Discovers unmanaged prose outside Managed Regions (`<!-- agent-policy:start -->` ... `<!-- agent-policy:end -->`), excludes generated files (`generatedOwnership`) and `.agent-policy/`, calculates 1-indexed line spans, and produces hash-bound `AuditOutput`.

4. **Classification Report Validator:**
   - `src/audit/validate-report.ts`: Validates report JSON against schema, checks project path confinement, verifies on-disk SHA-256 matches `sourceSha256` (`STALE_REPORT_SOURCE_HASH`), validates line range bounds, and verifies that `snippet` matches exact sliced lines (`REPORT_SNIPPET_MISMATCH`).

5. **Portable Upstream Proposal Exporter:**
   - `src/proposal/export.ts`: Validates proposal objects or YAML/JSON strings, formats clean portable YAML with standard comment header, and atomically writes output files.

6. **Repository Invariant and Project Rule Staging:**
   - `src/planner/stage-invariants.ts`: Staging additions creates atomic Markdown rules under `.agent-policy/rules/<namespace>/<rule>.md` and registers Rule IDs in `.agent-policy/invariants.yaml`. Staging removals removes the Rule ID from `invariants.yaml` while preserving rule files on disk.
   - `src/schema/load-project.ts`: Loads namespaced Rule IDs from `invariants.yaml` and parses project rules from `.agent-policy/rules/**/*.md`.
   - `src/compiler/resolve-policy.ts` & `src/adapters/codex/project.ts`: Resolves invariant instructions and renders them into `AGENTS.md` under `## Repository invariants`.

7. **Upstream Scope Confinement & Gating (`--scope upstream`):**
   - `src/planner/upstream-scope.ts`: Validates upstream repository identity via `@agent-policy/agent-policy-toolkit` `package.json` and root `catalog/`.
   - `src/planner/stage-source.ts`: Enforces canonical upstream roots (`catalog/rules/`, `catalog/bundles/`, `catalog/evidence/`, `catalog/migrations/`, `skills/`) and schema validation for upstream authoring.

8. **Canonical Workflow Skill Distribution & Codex Projection:**
   - `skills/policy-maintainer/SKILL.md`: Comprehensive skill providing AI coding agents with the 6-tier classification rubric, evidence standards, operational CLI workflows, and boundary safety invariants.
   - `src/catalog/load-catalog.ts`: Discovers and loads canonical workflow skills from `skills/*/SKILL.md`.
   - `src/adapters/codex/project.ts`: Projects workflow skills to `.agents/skills/<name>/SKILL.md` with generated ownership headers, `materializeArtifactHash`, and lockfile tracking.

9. **CLI Subcommands Integration:**
   - `agent-policy audit [--path <glob>] [--format json|text]`
   - `agent-policy validate-report <path/to/report.json>`
   - `agent-policy stage-source [--scope project|upstream] --spec <spec> --plan <path>`
   - `agent-policy stage-invariant --add <ruleId> [--spec <spec>] --plan <path>`
   - `agent-policy stage-invariant --remove <ruleId> --plan <path>`
   - `agent-policy export-proposal --spec <spec> [--output <path>]`

---

## 3. Verification & Smoke Test Matrix

| Suite / Verification Step | Scope / Target | Result | Evidence / Details |
| :--- | :--- | :---: | :--- |
| `pnpm typecheck` | Whole repository | **PASS** | TypeScript 5.8, 0 diagnostics |
| `pnpm test:unit` | Unit test suite | **PASS** | 16 test files, 127 tests |
| `pnpm test:contracts` | Harness & schema contracts | **PASS** | 5 test files, 43 tests |
| `pnpm test:cli` | End-to-end CLI scenarios | **PASS** | 7 test files, 85 tests |
| `pnpm check` | Combined validation | **PASS** | 28 test files, 255 tests |
| `pnpm build` | Production compilation | **PASS** | Clean build into `dist/` |
| `pnpm pack:check` | Package distribution check | **PASS** | 114 package files, valid exports |
| **Packed-Package Smoke** | Local tarball in isolated consumer | **PASS** | 10/10 checks passed (installation, help, 5 Slice B subcommands, skill presence, read-only init, apply, codex projection, audit, check, idempotent check) |
| **Registry Smoke** | Live npm registry version `0.1.0-alpha.3` | **PASS** | 10/10 checks passed in fresh temporary consumer outside workspace |

---

## 4. Git Lineage for Slice B

* `c6ab261` `feat(schema): add audit-output, classification-report, and proposal v1 schemas` (Task 1)
* `94213a7` `feat(domain): add audit and upstream proposal domain models` (Task 2)
* `e3c6c34` `feat(audit): implement deterministic unmanaged content scanner` (Task 3)
* `f272e7f` `feat(audit): implement report validation with snippet and hash verification` (Task 4)
* `60c5b7b` `feat(proposal): implement portable upstream proposal export` (Task 5)
* `9448f91` `feat(planner): implement immutable invariant and rule staging` (Task 6)
* `f6bcffb` `feat(planner): enforce upstream scope confinement and gating` (Task 7)
* `90da3d9` `feat(skills): add policy-maintainer canonical workflow skill and codex projection` (Task 8)
* `ae01b3e` `docs(skills): align policy-maintainer examples with v1 schemas` (Task 8 fix)
* `aac1da4` `feat(cli): wire Slice B subcommands for audit, validation, staging, and proposal export` (Task 9)
* `77cf479` `docs(record): add Slice B implementation completion record and verification evidence` (Task 10)
* `c565bba` `Merge pull request #2 from paynet/feature/slice-b-policy-maintainer` (Merge into main)
* `1de2f3c` `chore: release 0.1.0-alpha.3` (Release commit, tag `v0.1.0-alpha.3`)
