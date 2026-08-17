# Agent Policy Toolkit — Slice B (`policy-maintainer`, Classification Audit, Upstream Proposals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, verify, and dogfood Slice B: the `policy-maintainer` canonical workflow skill, deterministic classification audit and report validation, project invariant and rule staging into immutable Change Plans, portable upstream proposal export, and `--scope upstream` catalog authoring.

**Architecture:** Strict separation between LLM judgment (`skills/policy-maintainer/SKILL.md`) and deterministic CLI validation/staging (`audit`, `validate-report`, `stage-source`, `stage-invariant`, `export-proposal`). All state transitions produce and apply hash-bound, immutable Change Plans.

**Tech Stack:** TypeScript 5.9 ESM, Node.js >= 22.20, pnpm 11, Ajv (JSON Schema Draft 2020-12), YAML 2.8.1, Vitest 4.1.6.

**Spec:** [`docs/superpowers/specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md`](../specs/2026-08-17-agent-policy-toolkit-policy-maintainer-design.md)

---

## Global Constraints

- **Judgment vs Deterministic Execution:** The `policy-maintainer` skill produces judgment; the CLI strictly validates schema structure, source path existence, line ranges, and `sourceSha256` integrity.
- **Repository Invariant Storage Semantics:** `.agent-policy/invariants.yaml` contains only ordered Rule IDs (`rules: string[]`). Invariant rule bodies are stored as atomic `rule-v1` files in `.agent-policy/rules/<namespace>/<rule>.md`.
- **Change Plan Immutability:** Planning and staging commands create a fresh, self-contained, hash-bound Change Plan. They never mutate, append to, or re-hash an existing Change Plan.
- **Scope Confinement:**
  - `--scope project` (default): strictly confines canonical mutations to `.agent-policy/`.
  - `--scope upstream`: valid only in an Agent Policy Toolkit source repository; confines canonical mutations to `catalog/` and `skills/`.
- **Proposals are Non-Runtime:** Exported upstream proposals are non-runtime YAML artifacts. They are never locked into `policy.lock.json` or compiled into project projections.
- **Ownership Exclusion in Audit:** `agent-policy audit` excludes Managed Regions (`<!-- agent-policy:start -->`), fully generated files (`generatedOwnership`), and `.agent-policy/`.

---

## Planned File Map

| File | Responsibility |
| --- | --- |
| `schemas/audit-output-v1.schema.json` | JSON Schema for deterministic audit scanner output. |
| `schemas/classification-report-v1.schema.json` | JSON Schema for maintainer judgment reports with action/evidence compatibility. |
| `schemas/proposal-v1.schema.json` | JSON Schema for portable upstream proposals with origin provenance. |
| `src/schema/validator.ts` | Ajv validator registration for new v1 schemas. |
| `src/domain/audit.ts` | TypeScript domain types for audit blocks and classification findings. |
| `src/domain/proposal.ts` | TypeScript domain types for upstream proposals. |
| `src/domain/policy.ts` | Updated invariant rule interfaces. |
| `src/audit/scan.ts` | Deterministic scanner extracting unmanaged prose blocks from markdown files. |
| `src/audit/validate-report.ts` | Deterministic validation of classification reports (hashes, line ranges, snippets). |
| `src/proposal/export.ts` | Formatter and validator for portable YAML upstream proposals. |
| `src/schema/load-project.ts` | Project loader loading invariant rules from `.agent-policy/rules/`. |
| `src/planner/stage-source.ts` | Immutable Change Plan generator for canonical rule/overlay additions. |
| `src/planner/stage-invariants.ts` | Atomic staging of project rules and invariant list updates. |
| `src/planner/upstream-scope.ts` | Upstream repository detection and scope confinement validator. |
| `skills/policy-maintainer/SKILL.md` | Canonical upstream workflow skill definition. |
| `src/catalog/load-catalog.ts` | Loader for upstream canonical workflow skills under `skills/`. |
| `src/adapters/codex/project.ts` | Codex projection of canonical workflow skills to `.agents/skills/`. |
| `src/cli/arguments.ts` | CLI argument parser extended with Slice B commands and flags. |
| `src/cli/commands/audit.ts` | CLI handler for `agent-policy audit`. |
| `src/cli/commands/validate-report.ts` | CLI handler for `agent-policy validate-report`. |
| `src/cli/commands/stage-source.ts` | CLI handler for `agent-policy stage-source`. |
| `src/cli/commands/stage-invariant.ts` | CLI handler for `agent-policy stage-invariant`. |
| `src/cli/commands/export-proposal.ts` | CLI handler for `agent-policy export-proposal`. |
| `src/cli/main.ts` | Top-level CLI router wiring new subcommands. |
| `tests/unit/slice-b-schemas.test.ts` | Unit tests for new schema validation and negative matrices. |
| `tests/unit/audit-scanner.test.ts` | Unit tests for deterministic markdown extraction and ownership filtering. |
| `tests/unit/validate-report.test.ts` | Unit tests for report verification, hash checking, and snippet slicing. |
| `tests/unit/proposal-export.test.ts` | Unit tests for proposal formatting and provenance retention. |
| `tests/unit/invariants-staging.test.ts` | Unit tests for immutable invariant and rule staging into Change Plans. |
| `tests/unit/upstream-scope.test.ts` | Unit tests for `--scope upstream` vs `--scope project` gating. |
| `tests/contracts/workflow-skill-projection.test.ts` | Contract tests for `policy-maintainer` skill projection. |
| `tests/cli/slice-b-lifecycle.test.ts` | End-to-end CLI tests for audit $\to$ classify $\to$ stage $\to$ apply. |

---

### Task 1: Add Schemas for Slice B and Register in Validator

**Files:**
- Create: `schemas/audit-output-v1.schema.json`
- Create: `schemas/classification-report-v1.schema.json`
- Create: `schemas/proposal-v1.schema.json`
- Modify: `src/schema/validator.ts`
- Create: `tests/unit/slice-b-schemas.test.ts`

- [ ] **Step 1: Write failing schema validation tests**
  Create `tests/unit/slice-b-schemas.test.ts` testing:
  - Valid `audit-output-v1` document validation.
  - Valid `classification-report-v1` document validation.
  - Negative tests: illegal `classification` $\to$ `suggestedAction` combinations (e.g. `documentation` $\to$ `stage-invariant` fails; `shared-core` with non-cross-project evidence fails).
  - Valid `proposal-v1` document validation with origin metadata.
  - Negative tests: `proposal-v1` with `kind: "rule"` missing `ruleMetadata` fails.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/slice-b-schemas.test.ts`
  Expected: FAIL because schemas do not exist and are not registered.

- [ ] **Step 3: Create schema files and update validator**
  - Create `schemas/audit-output-v1.schema.json` with exact schema from Spec §5.1.
  - Create `schemas/classification-report-v1.schema.json` with exact schema from Spec §5.2.
  - Create `schemas/proposal-v1.schema.json` with exact schema from Spec §5.3.
  - Update `src/schema/validator.ts` to load and compile `audit-output-v1`, `classification-report-v1`, and `proposal-v1`.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/slice-b-schemas.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add schemas/ src/schema/validator.ts tests/unit/slice-b-schemas.test.ts
  git commit -m "feat(schema): add audit-output, classification-report, and proposal v1 schemas"
  ```

---

### Task 2: Domain Models for Proposals, Audits, and Invariant Rules

**Files:**
- Create: `src/domain/audit.ts`
- Create: `src/domain/proposal.ts`
- Modify: `src/domain/policy.ts`
- Create: `tests/unit/slice-b-domain.test.ts`

- [ ] **Step 1: Write failing domain type and helper tests**
  Create `tests/unit/slice-b-domain.test.ts` testing:
  - `ClassificationReport`, `Finding`, `AuditOutput`, `UnmanagedBlock` domain constructors / validation helpers.
  - `UpstreamProposal` type-guard and origin formatting helpers.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/slice-b-domain.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement domain types**
  - Create `src/domain/audit.ts` defining `AuditOutput`, `UnmanagedBlock`, `ClassificationReport`, `Finding`, `ClassificationCategory`, `MaintainerAction`, `EvidenceType`.
  - Create `src/domain/proposal.ts` defining `UpstreamProposal`, `ProposalOrigin`, `ProposalDestination`, `RuleMetadataProposal`.
  - Update `src/domain/policy.ts` to clarify invariant rule structure.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/slice-b-domain.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/domain/ tests/unit/slice-b-domain.test.ts
  git commit -m "feat(domain): add audit and upstream proposal domain models"
  ```

---

### Task 3: Deterministic Audit Scanner (`src/audit/scan.ts`)

**Files:**
- Create: `src/audit/scan.ts`
- Create: `tests/unit/audit-scanner.test.ts`

- [ ] **Step 1: Write failing scanner tests**
  Create `tests/unit/audit-scanner.test.ts` testing:
  - Scanning `AGENTS.md` containing an unmanaged section outside the managed region: returns unmanaged block with exact 1-indexed start/end lines and `sourceSha256`.
  - Scanning `AGENTS.md` containing only a managed region: returns zero unmanaged blocks.
  - Scanning a fully generated skill file (`generatedOwnership === true`): ignored.
  - Scanning files inside `.agent-policy/`: ignored.
  - Explicit `--path` glob scanning: extracts blocks from specified markdown files.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/audit-scanner.test.ts`
  Expected: FAIL because `scan.ts` does not exist.

- [ ] **Step 3: Implement audit scanner**
  Create `src/audit/scan.ts`:
  - `scanUnmanagedContent(repositoryRoot: string, options?: { readonly paths?: readonly string[] }): Promise<AuditOutput>`
  - Uses `generatedOwnership` from `src/cli/commands/common.ts` to skip generated files.
  - Extracts text outside `MANAGED_REGION_START` ... `MANAGED_REGION_END` markers.
  - Computes exact line numbers (1-indexed) and `sourceSha256` digest for each unmanaged block.
  - Emits valid `AuditOutput` conforming to `audit-output-v1`.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/audit-scanner.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/audit/scan.ts tests/unit/audit-scanner.test.ts
  git commit -m "feat(audit): implement deterministic unmanaged content scanner"
  ```

---

### Task 4: Report Validator (`src/audit/validate-report.ts`)

**Files:**
- Create: `src/audit/validate-report.ts`
- Create: `tests/unit/validate-report.test.ts`

- [ ] **Step 1: Write failing report validator tests**
  Create `tests/unit/validate-report.test.ts` testing:
  - Schema validity using `validateDocument('classification-report-v1', ...)`.
  - File existence check: reports error if `sourcePath` does not exist.
  - Hash freshness check: reports error if on-disk SHA-256 does not match `sourceSha256`.
  - Snippet slice check: verifies `snippet` matches the exact lines between `lineRange.start` and `lineRange.end`.
  - Negative test: report fails when snippet text differs from disk.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/validate-report.test.ts`
  Expected: FAIL because `validate-report.ts` does not exist.

- [ ] **Step 3: Implement report validator**
  Create `src/audit/validate-report.ts`:
  - `validateClassificationReport(repositoryRoot: string, reportContent: string): Promise<ClassificationReport>`
  - Runs Ajv validation against `classification-report-v1`.
  - Reads each target file, checks SHA-256 against `sourceSha256`.
  - Extracts lines `[start - 1, end]` and confirms normalized text matches `snippet`.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/validate-report.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/audit/validate-report.ts tests/unit/validate-report.test.ts
  git commit -m "feat(audit): implement report validation with snippet and hash verification"
  ```

---

### Task 5: Upstream Proposal Exporter (`src/proposal/export.ts`)

**Files:**
- Create: `src/proposal/export.ts`
- Create: `tests/unit/proposal-export.test.ts`

- [ ] **Step 1: Write failing proposal export tests**
  Create `tests/unit/proposal-export.test.ts` testing:
  - `exportProposal(spec, outputPath)` validates against `proposal-v1`.
  - Formats output as clean, portable YAML with standard header comment.
  - Origin metadata is preserved byte-for-byte.
  - Rejects proposals missing required rule metadata when `kind: "rule"`.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/proposal-export.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement proposal exporter**
  Create `src/proposal/export.ts`:
  - `exportProposalDocument(spec: unknown, outputPath: string): Promise<string>`
  - Validates document with `validateDocument('proposal-v1', ...)`.
  - Serializes to YAML with deterministic formatting and comments.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/proposal-export.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/proposal/ tests/unit/proposal-export.test.ts
  git commit -m "feat(proposal): implement portable upstream proposal export"
  ```

---

### Task 6: Repository Invariant and Project Rule Staging into Immutable Change Plans

**Files:**
- Create: `src/planner/stage-invariants.ts`
- Create: `src/planner/stage-source.ts`
- Modify: `src/schema/load-project.ts`
- Modify: `src/adapters/codex/project.ts`
- Create: `tests/unit/invariants-staging.test.ts`

- [ ] **Step 1: Write failing invariant staging tests**
  Create `tests/unit/invariants-staging.test.ts` testing:
  - Staging a new invariant rule creates `.agent-policy/rules/tms/issue-tracker.md` AND updates `.agent-policy/invariants.yaml` with `rules: ["tms.issue-tracker"]`.
  - Creating the Change Plan produces an immutable plan file with `SourceChange` entries for both files.
  - Removing an invariant (`--remove tms.issue-tracker`) removes the ID from `invariants.yaml` while preserving `.agent-policy/rules/tms/issue-tracker.md` on disk.
  - The Codex projection renders the invariant rule body into the `## Repository invariants` section of `AGENTS.md`.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/invariants-staging.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement invariant staging and compiler updates**
  - Update `src/schema/load-project.ts` to load project rules from `.agent-policy/rules/` for IDs listed in `invariants.yaml`.
  - Create `src/planner/stage-invariants.ts`:
    - `stageAddInvariant(request: AddInvariantRequest): Promise<ChangePlan>`
    - `stageRemoveInvariant(request: RemoveInvariantRequest): Promise<ChangePlan>`
  - Create `src/planner/stage-source.ts`:
    - `stageSourceChange(request: StageSourceRequest): Promise<ChangePlan>`
  - Update `src/adapters/codex/project.ts` to render invariant rule instructions into the root body.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/invariants-staging.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/planner/ src/schema/load-project.ts src/adapters/codex/project.ts tests/unit/invariants-staging.test.ts
  git commit -m "feat(planner): implement immutable invariant and rule staging"
  ```

---

### Task 7: Upstream Scope Staging and Gating (`--scope upstream`)

**Files:**
- Create: `src/planner/upstream-scope.ts`
- Modify: `src/planner/stage-source.ts`
- Create: `tests/unit/upstream-scope.test.ts`

- [ ] **Step 1: Write failing upstream scope tests**
  Create `tests/unit/upstream-scope.test.ts` testing:
  - When in a consumer repo (no `catalog/`), staging with `--scope upstream` fails with `NOT_UPSTREAM_REPOSITORY`.
  - When inside the toolkit repo, staging with `--scope upstream` allows staging `SourceChange` against `catalog/rules/` and `catalog/bundles/`.
  - When inside a consumer repo, staging with `--scope project` confines changes to `.agent-policy/`.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:unit -- tests/unit/upstream-scope.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement upstream scope validation**
  - Create `src/planner/upstream-scope.ts` checking for root `catalog/` directory and package `@agent-policy/agent-policy-toolkit`.
  - Update `src/planner/stage-source.ts` to enforce path confinement based on scope.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:unit -- tests/unit/upstream-scope.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/planner/upstream-scope.ts src/planner/stage-source.ts tests/unit/upstream-scope.test.ts
  git commit -m "feat(planner): enforce upstream scope confinement and gating"
  ```

---

### Task 8: Canonical Workflow Skill Distribution and Codex Projection

**Files:**
- Create: `skills/policy-maintainer/SKILL.md`
- Modify: `src/catalog/load-catalog.ts`
- Modify: `src/adapters/codex/project.ts`
- Create: `tests/contracts/workflow-skill-projection.test.ts`

- [ ] **Step 1: Write failing workflow skill projection tests**
  Create `tests/contracts/workflow-skill-projection.test.ts` testing:
  - `loadCatalog` loads canonical workflow skills from `skills/*/SKILL.md`.
  - Codex adapter projects `skills/policy-maintainer/SKILL.md` into `.agents/skills/policy-maintainer/SKILL.md` with generated ownership header and hash placeholder replacement.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:contracts -- tests/contracts/workflow-skill-projection.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Create `policy-maintainer` skill and update compiler projection**
  - Create `skills/policy-maintainer/SKILL.md` with complete mission, 6-tier rubric, action guidance, and CLI command references.
  - Update `src/catalog/load-catalog.ts` to discover and load canonical workflow skills from `skills/`.
  - Update `src/adapters/codex/project.ts` to emit projected workflow skills into `.agents/skills/<name>/SKILL.md`.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:contracts -- tests/contracts/workflow-skill-projection.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add skills/ src/catalog/load-catalog.ts src/adapters/codex/project.ts tests/contracts/workflow-skill-projection.test.ts
  git commit -m "feat(skills): add policy-maintainer canonical workflow skill and codex projection"
  ```

---

### Task 9: CLI Commands Integration and Argument Parsing

**Files:**
- Modify: `src/cli/arguments.ts`
- Create: `src/cli/commands/audit.ts`
- Create: `src/cli/commands/validate-report.ts`
- Create: `src/cli/commands/stage-source.ts`
- Create: `src/cli/commands/stage-invariant.ts`
- Create: `src/cli/commands/export-proposal.ts`
- Modify: `src/cli/main.ts`
- Create: `tests/cli/slice-b-lifecycle.test.ts`

- [ ] **Step 1: Write failing CLI lifecycle test**
  Create `tests/cli/slice-b-lifecycle.test.ts` testing:
  - `agent-policy audit` outputs valid JSON `audit-output-v1`.
  - `agent-policy validate-report <report.json>` validates report.
  - `agent-policy stage-invariant --add tms.issue-tracker --spec invariant.yaml --plan plan.json` creates a valid Change Plan.
  - `agent-policy diff plan.json` shows source and projected invariant changes.
  - `agent-policy apply plan.json --yes` applies the changes transactionally.
  - `agent-policy export-proposal --spec proposal.yaml --output out.yaml` writes validated proposal.

- [ ] **Step 2: Run test and verify it fails**
  Run: `pnpm test:cli -- tests/cli/slice-b-lifecycle.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement CLI commands and update router**
  - Extend `src/cli/arguments.ts` with new commands (`audit`, `validate-report`, `stage-source`, `stage-invariant`, `export-proposal`) and flags (`--spec`, `--rule-id`, `--add`, `--remove`, `--scope`, `--format`, `--output`, `--path`).
  - Create command handlers under `src/cli/commands/`.
  - Wire command handlers into `src/cli/main.ts`.

- [ ] **Step 4: Run test and verify it passes**
  Run: `pnpm test:cli -- tests/cli/slice-b-lifecycle.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/cli/ tests/cli/slice-b-lifecycle.test.ts
  git commit -m "feat(cli): wire Slice B subcommands for audit, validation, staging, and proposal export"
  ```

---

### Task 10: Full Upstream Verification, Prerelease Packaging, and Completion Gate

**Files:**
- Create: `docs/slice-b-completion-record.md`
- Modify: `package.json` / `CHANGELOG.md`

- [ ] **Step 1: Run full verification suite**
  Run: `pnpm check`
  Expected: PASS (0 type errors, all tests passing in unit, contracts, and CLI projects, build succeeds cleanly).

- [ ] **Step 2: Verify package contents dry-run**
  Run: `pnpm pack --dry-run`
  Expected: Verify package includes `dist/`, `catalog/`, `schemas/` (including 3 new v1 schemas), `skills/` (including `policy-maintainer`), `docs/`, `README.md`.

- [ ] **Step 3: Publish Slice B completion record**
  Create `docs/slice-b-completion-record.md` documenting:
  - Delivered Slice B capabilities.
  - Test matrix results and coverage.
  - Exact prerelease tag/version (`0.2.0-alpha.0`).
  - Dogfood execution plan for `tms-frontend`.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/slice-b-completion-record.md CHANGELOG.md
  git commit -m "docs: record Slice B completion and prerelease readiness"
  ```
