# Agent Policy Toolkit Codex Foundation Implementation Plan

> *Provenance note: Originally authored in tms-frontend before the standalone Agent Policy Toolkit repository was established.*

> **Status:** Completed and formally closed. See [Slice A Completion Record](../../slice-a-completion-record.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish the first independently usable Agent Policy Toolkit prerelease with the compact Core, six contextual domain bundles, a Codex adapter, and the complete plan/diff/apply/check/remove lifecycle.

**Architecture:** Work in a new standalone `agent-policy-toolkit` repository, not inside `tms-frontend`. Parse versioned YAML and Markdown sources into a normalized intermediate representation, compile virtual artifacts without filesystem writes, create a hash-bound Change Plan, and permit only the applier to mutate a consumer repository. The Codex adapter is the first capability adapter; every compiler and lifecycle contract remains harness-neutral.

**Tech Stack:** TypeScript 5.9 ESM, Node.js 22.20+ and 24, pnpm 11, Ajv 8.17.1, YAML 2.8.1, Vitest 4.1.6, native `node:util` `parseArgs`, native `node:crypto` SHA-256, native filesystem APIs.

## Global Constraints

- Execute this plan in a new standalone repository named `agent-policy-toolkit`; do not add toolkit runtime code to `tms-frontend`.
- Use product name **Agent Policy Toolkit**, executable `agent-policy`, provisional package name `@agent-policy/agent-policy-toolkit`, MIT license, and consumer source directory `.agent-policy/` exactly.
- Do not publish unless the executor controls the `@agent-policy` npm scope; inability to prove scope ownership stops only the publish step, not local packing or dogfood testing.
- Support Node `>=22.20.0`; run CI on Node 22.20 and 24.
- Keep one package and one release version. Do not add workspaces or component packages.
- Canonical project sources are human-owned; harness-native files are generated or contain bounded Managed Regions.
- Planning, validation, compilation, and diffing must not mutate the consumer worktree.
- `apply` may consume only a saved, validated, hash-bound plan and must recheck all preconditions before writing.
- Every removal mode implemented in Slice A must preserve `.agent-policy/`; the separately confirmed `--purge-sources` lifecycle is deferred.
- Preserve all existing text outside Managed Regions byte-for-byte.
- Technology detection is advisory and cannot persist Bundle Selection without confirmation.
- Deterministic tests validate fixture structure and projections; they must not claim to prove model-based semantic activation.
- The implementation must stop after Slice A. Toolkit update, package-wiring uninstall, source purge, CI integration, `policy-maintainer`, Agent Roles, `DocsExplorer`, `code-review`, non-Codex adapters, Next.js, security, accessibility, debugging, React Native, and Expo are later plans.
- Follow [ADR-0010](../../adr/0010-adopt-a-layered-agent-policy-toolkit.md) and the [approved design](../specs/2026-08-12-agent-policy-toolkit-design.md).

## Planned file map

```text
agent-policy-toolkit/
├── package.json                         package metadata, CLI bin, scripts, runtime dependencies
├── pnpm-lock.yaml                       exact dependency resolution
├── tsconfig.json                        production TypeScript build
├── vitest.config.ts                     unit, contract, and CLI test projects
├── catalog/
│   ├── rules/                           29 initial atomic rule Markdown sources
│   ├── bundles/                         core plus six domain bundle manifests
│   ├── evidence/                        initial migration evidence and provenance
│   └── migrations/                      deterministic schema migration registry
├── schemas/                             committed JSON Schemas for public source formats
├── src/
│   ├── domain/                          normalized types, diagnostics, errors
│   ├── schema/                          YAML/frontmatter loading and Ajv validation
│   ├── catalog/                         catalog discovery and migration provenance
│   ├── compiler/                        overlay, dependency, ordering, and rendering logic
│   ├── adapters/codex/                  capability profile and virtual Codex projection
│   ├── planner/                         hashes, drift analysis, and Change Plan creation
│   ├── applier/                         precondition checks and transactional writes
│   └── cli/                             strict argument parsing and command orchestration
├── tests/
│   ├── unit/                            pure schema/compiler/planner tests
│   ├── contracts/                       adapter and ownership contracts
│   ├── cli/                             temporary-repository lifecycle tests
│   ├── fixtures/                        input repositories and activation fixtures
│   └── snapshots/                       deterministic projection snapshots
└── docs/                                maintainer and consumer documentation
```

---

### Task 1: Scaffold the standalone package and executable smoke test

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/cli/bin.ts`
- Create: `src/cli/main.ts`
- Create: `tests/cli/help.test.ts`
- Create: `tests/helpers/memory-io.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `runCli(argv: readonly string[], io: CliIo): Promise<number>` and executable `agent-policy`.
- Produces: test projects named `unit`, `contracts`, and `cli`.

- [ ] **Step 1: Initialize Git and package metadata**

Create the repository, then use this exact package contract:

```json
{
  "name": "@agent-policy/agent-policy-toolkit",
  "version": "0.1.0-alpha.0",
  "description": "Portable, layered policy compilation for AI coding-agent harnesses",
  "type": "module",
  "bin": { "agent-policy": "./dist/cli/bin.js" },
  "files": ["dist", "catalog", "schemas", "README.md", "LICENSE"],
  "engines": { "node": ">=22.20.0" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:contracts": "vitest run --project contracts",
    "test:cli": "vitest run --project cli",
    "check": "pnpm typecheck && pnpm test && pnpm build",
    "pack:check": "pnpm pack --dry-run"
  },
  "dependencies": {
    "ajv": "8.17.1",
    "yaml": "2.8.1"
  },
  "devDependencies": {
    "@types/node": "22.18.0",
    "typescript": "5.9.3",
    "vitest": "4.1.6"
  }
}
```

- [ ] **Step 2: Add TypeScript and Vitest configuration**

`tsconfig.json` targets `ES2024` with `NodeNext` module resolution, strict mode enabled, and `noEmit` disabled for the build output. `vitest.config.ts` defines three projects: `unit` (`tests/unit/**/*.test.ts`), `contracts` (`tests/contracts/**/*.test.ts`), and `cli` (`tests/cli/**/*.test.ts`).

- [ ] **Step 3: Write the failing CLI entry smoke test**

Create `tests/helpers/memory-io.ts` implementing `CliIo` with in-memory streams. Write `tests/cli/help.test.ts` asserting that `agent-policy --help` returns exit code 0 and prints the product name and command list.

- [ ] **Step 4: Run the smoke test and verify it fails**

Run: `pnpm test:cli`

Expected: FAIL because `src/cli/main.ts` does not exist.

- [ ] **Step 5: Implement minimal CLI entry and help dispatch**

Create `src/cli/bin.ts` (executable banner and top-level execution) and `src/cli/main.ts` parsing flags with `node:util` `parseArgs` and writing help text to `stdout`.

- [ ] **Step 6: Run tests and verify they pass**

Run: `pnpm check && pnpm pack:check`

Expected: typecheck, tests, and build pass cleanly. Dry-run pack confirms declared file entries.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src tests .github
git commit -m "feat: scaffold agent-policy-toolkit package and CLI smoke test"
```

---

### Task 2: Implement domain types, error models, and diagnostics

**Files:**
- Create: `src/domain/policy.ts`
- Create: `src/domain/artifacts.ts`
- Create: `src/domain/change-plan.ts`
- Create: `src/domain/diagnostics.ts`
- Create: `tests/unit/domain.test.ts`

**Interfaces:**
- Produces: `Rule`, `BundleManifest`, `ProjectPolicy`, `OverlayDirective`, `RenderProfile`, `VirtualArtifact`, `ChangePlan`, `Diagnostic`, `DiagnosticCode`.

- [ ] **Step 1: Write failing unit tests for domain invariants**

Test that diagnostic formatting contains code, severity, file path, rule ID when applicable, message, and actionable remediation text. Test serialization and round-tripping of domain primitives.

- [ ] **Step 2: Run domain tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing module imports.

- [ ] **Step 3: Implement domain types and diagnostic helpers**

Define readonly domain types, string-literal unions for status (`active`, `deprecated`, `retired`), strength (`required`, `recommended`), and override policies (`none`, `additive-only`, `explicit-task`, `project-overlay`). Implement `formatDiagnostic(d: Diagnostic): string`.

- [ ] **Step 4: Run domain tests and verify they pass**

Run: `pnpm test:unit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/unit/domain.test.ts
git commit -m "feat: add domain types and structured diagnostics"
```

---

### Task 3: Implement JSON schemas and Ajv validation

**Files:**
- Create: `schemas/rule-v1.schema.json`
- Create: `schemas/bundle-v1.schema.json`
- Create: `schemas/overlay-v1.schema.json`
- Create: `schemas/project-policy-v1.schema.json`
- Create: `schemas/policy-lock-v1.schema.json`
- Create: `src/schema/validator.ts`
- Create: `src/schema/frontmatter.ts`
- Create: `src/schema/load-project.ts`
- Create: `tests/unit/schema-validation.test.ts`
- Create: `tests/fixtures/schema/**`

**Interfaces:**
- Produces: `validateRuleSchema(data: unknown): ValidationResult<RuleMetadata>`
- Produces: `validateBundleSchema(data: unknown): ValidationResult<BundleManifest>`
- Produces: `validateProjectPolicySchema(data: unknown): ValidationResult<ProjectPolicyManifest>`
- Produces: `parseRuleMarkdown(content: string): ParsedRule`

- [ ] **Step 1: Write failing schema validation tests**

Create fixture files: valid rule, missing required metadata, invalid Rule ID pattern, invalid frontmatter, and unpermitted override value. Test that validator returns exact diagnostic codes and JSON-pointer error paths.

- [ ] **Step 2: Run schema tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing schemas and validator.

- [ ] **Step 3: Author committed JSON Schemas and Ajv validator**

Implement strict schemas using JSON Schema draft-07. Implement frontmatter parsing using `yaml`. Configure Ajv with `allErrors: true` and `strict: true`.

- [ ] **Step 4: Run schema tests and verify they pass**

Run: `pnpm test:unit`

Expected: PASS for all valid and invalid fixtures.

- [ ] **Step 5: Commit**

```bash
git add schemas src/schema tests/unit/schema-validation.test.ts tests/fixtures/schema
git commit -m "feat: add schema definitions and Ajv validator"
```

---

### Task 4: Author initial canonical catalog and migration registry

**Files:**
- Create: `catalog/rules/core/**` (7 rules)
- Create: `catalog/rules/implementation-design/**` (5 rules)
- Create: `catalog/rules/typescript/**` (2 rules)
- Create: `catalog/rules/react/**` (7 rules)
- Create: `catalog/rules/async-control-flow/**` (3 rules)
- Create: `catalog/rules/data-boundaries/**` (3 rules)
- Create: `catalog/rules/testing/**` (2 rules)
- Create: `catalog/bundles/**` (7 bundle manifests)
- Create: `catalog/evidence/universal-rules-migration.yaml`
- Create: `catalog/migrations/index.yaml`
- Create: `src/catalog/load-catalog.ts`
- Create: `src/catalog/load-bundles.ts`
- Create: `tests/unit/catalog.test.ts`

**Interfaces:**
- Produces: `loadCanonicalCatalog(): Promise<Catalog>`
- Produces: `loadBundle(id: string): Promise<BundleManifest>`
- Produces: 29 atomic rule files and 7 bundle files validating against Task 3 schemas.

- [ ] **Step 1: Write failing catalog integrity tests**

Assert:
- Every rule Markdown file parses and passes `rule-v1.schema.json`.
- Every rule has non-empty `# Title`, `## Instruction`, and `## Rationale` sections.
- Every bundle YAML parses and passes `bundle-v1.schema.json`.
- Every bundle rule reference resolves to an existing Rule ID.
- Rule aliases recorded in `catalog/evidence/universal-rules-migration.yaml` match the 44-rule normalization table from the design document.

- [ ] **Step 2: Run catalog tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing catalog files.

- [ ] **Step 3: Author the 29 Markdown rules, 7 bundle manifests, and migration provenance**

Port rules faithfully from the Canonical Input Document according to the design mapping.

- [ ] **Step 4: Run catalog tests and verify they pass**

Run: `pnpm test:unit`

Expected: PASS (all 29 rules and 7 bundles valid).

- [ ] **Step 5: Commit**

```bash
git add catalog src/catalog tests/unit/catalog.test.ts
git commit -m "feat: author canonical rules, bundles, and migration provenance"
```

---

### Task 5: Author deterministic activation fixtures

**Files:**
- Create: `tests/fixtures/activation/async-control-flow/**`
- Create: `tests/fixtures/activation/data-boundaries/**`
- Create: `tests/fixtures/activation/implementation-design/**`
- Create: `tests/fixtures/activation/react/**`
- Create: `tests/fixtures/activation/testing/**`
- Create: `tests/fixtures/activation/typescript/**`
- Create: `tests/unit/bundles.test.ts`

**Interfaces:**
- Produces: positive and negative scenario manifests for the six contextual bundles.
- Produces: structural validation tests verifying trigger polarity and description syntax.

- [ ] **Step 1: Write failing tests for activation fixture structure**

Verify each bundle directory contains `positive/` and `negative/` test case definitions with task intent, changed files, and expected activation assertion. Verify no fixture uses broad unconditional trigger patterns.

- [ ] **Step 2: Run activation fixture tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing fixtures.

- [ ] **Step 3: Author positive and negative fixture scenarios**

Add 2 positive and 2 negative cases per bundle reflecting genuine task situations.

- [ ] **Step 4: Run fixture tests and verify they pass**

Run: `pnpm test:unit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/activation tests/unit/bundles.test.ts
git commit -m "test: add deterministic activation fixture structure"
```

---

### Task 6: Implement compiler, overlays, and Render Profiles

**Files:**
- Create: `src/compiler/resolve-policy.ts`
- Create: `src/compiler/overlays.ts`
- Create: `src/compiler/render-rule.ts`
- Create: `src/compiler/render-bundle.ts`
- Create: `src/compiler/migrations.ts`
- Create: `tests/unit/compiler.test.ts`
- Create: `tests/unit/overlays.test.ts`
- Create: `tests/unit/migrations.test.ts`
- Create: `tests/snapshots/render-profiles.snap`

**Interfaces:**
- Produces: `resolveProjectPolicy(manifest: ProjectPolicyManifest, catalog: Catalog): ResolvedPolicy`
- Produces: `applyOverlays(rules: readonly Rule[], overlays: readonly OverlayDirective[]): OverlayResult`
- Produces: `renderRule(rule: Rule, profile: RenderProfile): string`
- Produces: `renderSkill(bundle: BundleManifest, rules: readonly Rule[], profile: RenderProfile): string`

- [ ] **Step 1: Write failing compiler and overlay tests**

Test:
- Render profile `core`: includes instruction and exceptions, omits rationale and examples.
- Render profile `domain-skill`: includes instruction, concise rationale, and exceptions.
- Overlay `disable`: removes rule if override policy permits; fails if override is `none`.
- Overlay `addendum`: appends text to instruction.
- Overlay `replace-with`: substitutes rule body.
- Schema migrator runs cleanly in staging and rejects unmigratable gaps.

- [ ] **Step 2: Run compiler tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing compiler modules.

- [ ] **Step 3: Implement compiler, overlay engine, and section renderers**

Implement pure rendering functions. No filesystem IO or global state.

- [ ] **Step 4: Run compiler tests and snapshot tests**

Run: `pnpm test:unit`

Expected: PASS. Snapshots match expected profile outputs.

- [ ] **Step 5: Commit**

```bash
git add src/compiler tests/unit/compiler.test.ts tests/unit/overlays.test.ts tests/unit/migrations.test.ts tests/snapshots
git commit -m "feat: implement policy compilation, overlays, and render profiles"
```

---

### Task 7: Implement pure Codex projection adapter

**Files:**
- Create: `src/adapters/types.ts`
- Create: `src/adapters/codex/capabilities.ts`
- Create: `src/adapters/codex/project.ts`
- Create: `src/adapters/codex/managed-region.ts`
- Create: `tests/contracts/codex-adapter.test.ts`
- Create: `tests/snapshots/codex-projection.snap`

**Interfaces:**
- Produces: `CodexAdapter: HarnessAdapter`
- Produces: `projectCodex(policy: ResolvedPolicy, options: ProjectionOptions): ProjectionResult`
- Produces: `renderManagedRegion(content: string, region: string): string`

- [ ] **Step 1: Write failing Codex adapter contract tests**

Test:
- Declares capability profile: `codex-2026-08-12`, experimental support, entry file `AGENTS.md`, shared skills path `.agents/skills/`.
- Projects compact Core into `AGENTS.md` Managed Region with exact marker delimiters.
- Projects each enabled domain bundle into `.agents/skills/<bundle-name>/SKILL.md`.
- Emits explicit ownership metadata headers in every generated skill.
- Preserves pre-existing text outside Managed Region markers byte-for-byte.
- Emits ordinary files; never emits symlinks.

- [ ] **Step 2: Run adapter tests and verify failure**

Run: `pnpm test:contracts`

Expected: FAIL on missing adapter.

- [ ] **Step 3: Implement Codex adapter and Managed Region renderer**

Implement pure projection functions producing `VirtualArtifact[]`.

- [ ] **Step 4: Run adapter tests and verify they pass**

Run: `pnpm test:contracts`

Expected: PASS. Snapshots match exact Codex layout.

- [ ] **Step 5: Commit**

```bash
git add src/adapters tests/contracts/codex-adapter.test.ts tests/snapshots/codex-projection.snap
git commit -m "feat: implement pure Codex projection adapter"
```

---

### Task 8: Implement planner, drift analysis, and Change Plan serialization

**Files:**
- Create: `src/planner/create-plan.ts`
- Create: `src/planner/inspect.ts`
- Create: `src/planner/hash.ts`
- Create: `src/planner/serialize-plan.ts`
- Create: `src/planner/policy-lock.ts`
- Create: `tests/unit/planner.test.ts`

**Interfaces:**
- Produces: `createChangePlan(context: PlanningContext): Promise<ChangePlan>`
- Produces: `computePlanHash(plan: ChangePlan): string`
- Produces: `detectDrift(desired: VirtualArtifact[], current: PhysicalArtifact[]): DriftResult`
- Produces: `generatePolicyLock(policy: ResolvedPolicy, artifacts: VirtualArtifact[]): PolicyLock`

- [ ] **Step 1: Write failing planner unit tests**

Test:
- Deterministic SHA-256 calculation over canonical sources, desired artifacts, and actions.
- Plan creation detects new files, modified files, deleted files, and unchanged files.
- Drift detection reports manual modifications inside Managed Regions or generated skills.
- Planner fails if requested target is not in manifest `targets`.
- Advisory bundle detection produces recommendation with evidence and requires interactive confirmation.

- [ ] **Step 2: Run planner tests and verify failure**

Run: `pnpm test:unit`

Expected: FAIL on missing planner modules.

- [ ] **Step 3: Implement planner, hashing, and lockfile generation**

Implement pure planning pipeline. File reads go through abstract reader interface.

- [ ] **Step 4: Run planner tests and verify they pass**

Run: `pnpm test:unit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/planner tests/unit/planner.test.ts
git commit -m "feat: implement change planning, hashing, and drift detection"
```

---

### Task 9: Implement transactional applier and preconditions

**Files:**
- Create: `src/applier/apply-plan.ts`
- Create: `src/applier/preconditions.ts`
- Create: `src/applier/transaction.ts`
- Create: `src/applier/reconcile.ts`
- Create: `tests/cli/apply.test.ts`

**Interfaces:**
- Produces: `applyChangePlan(plan: ChangePlan, options: ApplyOptions): Promise<ApplyResult>`
- Produces: `revalidatePreconditions(plan: ChangePlan, fs: FileSystem): Promise<Diagnostic[]>`

- [ ] **Step 1: Write failing applier tests in temporary repositories**

Test:
- Revalidates plan hash, source hashes, and target file hashes immediately before writing.
- Refuses to apply a stale or tampered plan.
- Atomic apply: writes all artifacts or rolls back on failure.
- Managed Region replacement touches only the bounded marker region.
- Drift reconciliation: `regenerate` overwrites drift with desired; `abort` exits without change.
- Never makes a Git commit; outputs "Ready to commit".

- [ ] **Step 2: Run applier tests and verify failure**

Run: `pnpm test:cli`

Expected: FAIL on missing applier.

- [ ] **Step 3: Implement transactional filesystem operations and precondition checks**

Implement staged writes, hash checks, and rollback on error.

- [ ] **Step 4: Run applier tests and verify they pass**

Run: `pnpm test:cli`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/applier tests/cli/apply.test.ts
git commit -m "feat: implement transactional change plan applier"
```

---

### Task 10: Implement CLI commands: init, diff, check, remove

**Files:**
- Create: `src/cli/commands/init.ts`
- Create: `src/cli/commands/diff.ts`
- Create: `src/cli/commands/check.ts`
- Create: `src/cli/commands/remove.ts`
- Create: `src/cli/format-diff.ts`
- Create: `src/cli/arguments.ts`
- Create: `tests/cli/lifecycle.test.ts`

**Interfaces:**
- Produces: `agent-policy init --target codex [--bundles ...] --plan <file>`
- Produces: `agent-policy diff <file>`
- Produces: `agent-policy apply <file> [--yes]`
- Produces: `agent-policy check`
- Produces: `agent-policy remove --target codex|--generated --plan <file>`

- [ ] **Step 1: Write failing full-lifecycle integration tests**

Test complete user journeys in temporary repositories:
1. `init` on empty repository: read-only, produces plan file outside worktree.
2. `diff`: displays formatted change preview without mutating files.
3. `apply`: creates `.agent-policy/`, `AGENTS.md`, and `.agents/skills/`.
4. `check`: passes with exit code 0 on clean tree.
5. Manual edit to generated skill: `check` fails with drift diagnostic.
6. `remove --target codex`: removes Managed Region and skills; preserves `.agent-policy/`.
7. Re-apply restores exact projections.

- [ ] **Step 2: Run lifecycle tests and verify failure**

Run: `pnpm test:cli`

Expected: FAIL on missing CLI command implementations.

- [ ] **Step 3: Implement CLI commands, argument validation, and diff formatter**

Wire commands to domain, schema, compiler, adapter, planner, and applier modules. Enforce `--plan` requirement for mutating commands.

- [ ] **Step 4: Run lifecycle tests and verify they pass**

Run: `pnpm test:cli`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli tests/cli/lifecycle.test.ts tests/cli/format-diff.test.ts
git commit -m "feat: implement init, diff, check, and remove CLI commands"
```

---

### Task 11: Harden lifecycle and ownership contracts

**Files:**
- Create: `tests/contracts/ownership.test.ts`
- Create: `tests/contracts/removal.test.ts`
- Create: `tests/contracts/cross-platform-paths.test.ts`
- Create: `tests/fixtures/repositories/drifted/**`
- Create: `tests/fixtures/repositories/scoped-profile/**`
- Create: `tests/fixtures/repositories/unmanaged-agents/**`

**Interfaces:**
- Consumes: only public adapter, planner, applier, and CLI interfaces.
- Produces: release-gating contract suite for Slice A.

- [ ] **Step 1: Add ownership and unmanaged-content contracts**

Fixture `unmanaged-agents` must contain meaningful text before and after a Managed Region. Test byte preservation across update and removal, duplicate-marker rejection, and refusal to claim an existing foreign-managed file.

- [ ] **Step 2: Add scoped profile contracts**

Test one root manifest with two workspace profiles. Assert both skills are root-discoverable, each description contains explicit paths, and no nested `AGENTS.md` is created without subtree invariants.

- [ ] **Step 3: Add path and rollback contracts**

Feed Windows separators, case-distinct paths, Unicode names, symlinks, and traversal attempts. Assert normalized POSIX plan paths and native filesystem resolution remain inside the repository root.

- [ ] **Step 4: Add removal and drift contracts**

Test generated-copy hash divergence, manual Managed Region edits, missing generated files, source-preserving uninstall, and independent target removal. Non-interactive drift must fail without selecting adoption or regeneration.

- [ ] **Step 5: Run the full matrix locally**

Run: `pnpm check && pnpm pack:check`

Expected: all unit, contract, CLI, build, and package-content checks pass.

- [ ] **Step 6: Commit**

```bash
git add tests/contracts tests/fixtures/repositories
git commit -m "test: harden lifecycle and ownership contracts"
```

---

### Task 12: Author maintainer and consumer documentation

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `docs/authoring-rules.md`
- Create: `docs/consumer-lifecycle.md`
- Create: `docs/adapter-contracts.md`
- Create: `docs/activation-evals.md`
- Create: `CHANGELOG.md`

**Interfaces:**
- Produces: installable tarball and verified documentation.
- Produces: documented boundary between deterministic Activation Fixtures and model-based Activation Evals.

- [ ] **Step 1: Write consumer and maintainer documentation**

Document canonical source ownership, authoring metadata and sections, bundle composition, explicit update lifecycle, drift reconciliation, source-preserving removal, and the fact that initialization preserves existing `AGENTS.md` prose unmanaged.

- [ ] **Step 2: Document adapter and activation claims**

State that Codex support is experimental in `0.1.0-alpha.0`. Document exact tested Adapter Knowledge, fallback contract, positive/negative fixture validation, and the separate future model-based eval gate. Do not call fixture tests semantic activation tests.

- [ ] **Step 3: Verify package contents from a clean checkout**

Run:

```bash
corepack pnpm install --frozen-lockfile
pnpm check
pnpm pack:check
pnpm pack
```

Install the produced `.tgz` into a temporary empty repository and verify `agent-policy --help` and `agent-policy init --target codex --plan plan.json`.

- [ ] **Step 4: Release only when the scope precondition passes**

Verify registry authentication and ownership of `@agent-policy`. If ownership is unavailable, retain the verified tarball for the dogfood plan and report publishing as blocked without renaming the package. If ownership is available, run `pnpm publish --tag alpha --access public` and verify the registry reports exactly `0.1.0-alpha.0`.

- [ ] **Step 5: Commit release documentation**

```bash
git add README.md LICENSE docs CHANGELOG.md
git commit -m "docs: publish Codex foundation lifecycle"
```

---

## Foundation completion gate

Before moving to the dogfood plan, record all of the following:

- clean `pnpm check` on Node 22.20 and 24;
- clean package-content check;
- SHA-256 and absolute path of the verified tarball or the exact published npm version;
- Codex adapter capability-contract result;
- lifecycle fixture result for unmanaged `AGENTS.md`, drift, scoped profiles, and source-preserving removal;
- explicit statement that no model-based Activation Eval has yet been claimed;
- remaining deferred slices from the approved design.
