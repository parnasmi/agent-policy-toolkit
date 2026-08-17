# Agent Policy Toolkit — Slice B Completion Record

**Date:** 2026-08-17  
**Status:** COMPLETED / VERIFIED  
**Slice:** Slice B — `policy-maintainer`, Classification Audit, and Upstream Proposals  
**Package:** `@agent-policy/agent-policy-toolkit`  
**Release:** `0.1.0-alpha.3`
**Design Spec:** [`docs/superpowers/specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md`](./superpowers/specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md)  
**Implementation Plan:** [`docs/superpowers/plans/2026-08-17-agent-policy-toolkit-policy-maintainer.md`](./superpowers/plans/2026-08-17-agent-policy-toolkit-policy-maintainer.md)  

---

## 1. Summary of Implemented Capabilities

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

## 2. Verification Summary

| Suite | Status | Test Files | Total Tests |
| :--- | :---: | :---: | :---: |
| `pnpm typecheck` | **PASS** | TypeScript 5.8 | 0 diagnostics |
| `pnpm test:unit` | **PASS** | 16 test files | 127 tests |
| `pnpm test:contracts` | **PASS** | 5 test files | 43 tests |
| `pnpm test:cli` | **PASS** | 7 test files | 85 tests |
| **Combined (`pnpm check`)** | **PASS** | **28 test files** | **255 tests** |
| `pnpm build` | **PASS** | `dist/` | Clean build |
| `npm pack --dry-run` | **PASS** | 114 files | 121.6 kB tarball |

---

## 3. Git Commit History for Slice B

- `c6ab261` `feat(schema): add audit-output, classification-report, and proposal v1 schemas` (Task 1)
- `94213a7` `feat(domain): add audit and upstream proposal domain models` (Task 2)
- `e3c6c34` `feat(audit): implement deterministic unmanaged content scanner` (Task 3)
- `f272e7f` `feat(audit): implement report validation with snippet and hash verification` (Task 4)
- `60c5b7b` `feat(proposal): implement portable upstream proposal export` (Task 5)
- `9448f91` `feat(planner): implement immutable invariant and rule staging` (Task 6)
- `f6bcffb` `feat(planner): enforce upstream scope confinement and gating` (Task 7)
- `90da3d9` `feat(skills): add policy-maintainer canonical workflow skill and codex projection` (Task 8)
- `ae01b3e` `docs(skills): align policy-maintainer examples with v1 schemas` (Task 8 fix)
- `aac1da4` `feat(cli): wire Slice B subcommands for audit, validation, staging, and proposal export` (Task 9)
