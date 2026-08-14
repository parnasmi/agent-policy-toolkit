# Agent Policy Init Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `agent-policy init` prepare a fresh consumer repository by staging a minimal `.agent-policy/policy.yaml` as a reviewed canonical-source creation.

**Architecture:** Keep bootstrap at the `init` command boundary. When the manifest is absent, `init` constructs the consumer-owned manifest in memory from the explicit or confirmed Bundle Selection and passes it through the existing compiler as a source override. Extend the already-declared `SourceChange: create` operation so the Change Plan records an absent-source precondition and the existing transactional applier creates the manifest only after review; `check`, `remove`, and normal compilation continue to fail closed when no manifest exists.

**Tech Stack:** TypeScript 5.9 ESM, Node.js 22.20+ and 24, pnpm 11, YAML 2.8.1, Vitest 4.1.6, existing Change Plan hashing and transactional filesystem ports.

**Spec:** [approved design](../specs/2026-08-12-agent-policy-toolkit-design.md); defect: `.superpowers/defects/2026-08-13-init-requires-pre-existing-manifest.md`

## Global Constraints

- `.agent-policy/` and `policy.yaml` remain consumer-owned canonical source; generated Codex files and `policy.lock.json` remain projections.
- Bootstrap is a reviewed source mutation: planning, diffing, and compilation remain read-only; only `apply` may create `.agent-policy/policy.yaml`.
- The bootstrap manifest contains `schemaVersion: v1`, the exact running toolkit version, the selected non-Core bundle IDs, and the required target; Core remains implicit as it is today.
- The manifest is created only when `.agent-policy/policy.yaml` is absent. Existing manifests, invalid paths, unsafe symlinks, and other declared sources retain fail-closed validation; no existing prose or policy source is classified or rewritten.
- The existing `SourceChange.operation` union is reused: `create` means the current canonical source must be absent, while `replace` retains the current SHA-256 precondition.
- A stale bootstrap plan must fail before mutation if the manifest appears or any other reviewed precondition changes. No clobbering fallback or direct write from `init` is permitted.
- Existing `AGENTS.md` bytes outside the Managed Region and existing hand-authored skills remain byte-preserved.
- `check` and removal keep their current source-preserving behavior; this plan adds no source purge, package uninstall, CI integration, new adapter, or new CLI command.
- No tms-frontend files are changed. Release/version bump and publication are a separate release decision after the fix passes the upstream gate.

---

## Planned file map

| File | Responsibility in this fix |
| --- | --- |
| `src/cli/commands/common.ts` | Detect an absent manifest for `init`, build the deterministic in-memory bootstrap source, and compile using the reviewed source override. |
| `src/schema/load-project.ts` | Parse a supplied manifest override without requiring the on-disk manifest; all other declared-source loading and path checks remain unchanged. |
| `src/planner/create-plan.ts` | Encode a missing canonical source as the precondition for a `SourceChange` with `operation: create`. |
| `src/applier/preconditions.ts` | Revalidate create-versus-replace source preconditions and prepare a non-existing source operation for the existing transaction. |
| `src/cli/format-diff.ts` | Include source creations in the reviewed source diff and report an absent current source clearly. |
| `src/cli/main.ts` | State the bootstrap behavior in CLI help. |
| `tests/unit/schema-validation.test.ts` | Verify manifest-override loading is read-only and works without a manifest file. |
| `tests/unit/planner.test.ts` | Verify deterministic source creation plans, absent-source preconditions, and source-appearance rejection. |
| `tests/cli/apply.test.ts` | Verify source creation uses the existing transactional applier and rolls back with other operations. |
| `tests/unit/bootstrap.test.ts` | Verify deterministic in-memory bootstrap preparation without filesystem writes. |
| `tests/cli/lifecycle.test.ts` | Verify fresh-repository `init → diff → apply → check → remove` behavior and unchanged existing-manifest behavior. |
| `tests/cli/help.test.ts` | Verify help documents bootstrap without filesystem access. |
| `README.md` | Update the lifecycle entry point and requirements for a fresh consumer. |
| `docs/consumer-lifecycle.md` | Document the in-memory bootstrap, reviewed source creation, and safety boundary. |

## Interfaces and invariants

The implementation keeps the public `ChangePlan` shape and the existing `compileCodex` call shape. The following existing interfaces gain the precise behavior needed by bootstrap:

- `loadProjectPolicy(root, options?: { readonly manifestOverride?: string }): Promise<ProjectPolicySource>` parses `manifestOverride` for `.agent-policy/policy.yaml` when provided, while still loading optional invariants and declared overlays from the repository.
- `prepareBundleSelection(context, bundles, requiredTarget)` returns a `SourceChange` with `operation: create` and a matching override when the manifest path is absent. The created content is deterministic and contains no inferred overlays, profiles, or Repository Invariants.
- `compileCodex(context, requestedBundles?, sourceOverrides?)` passes the manifest override into the loader before resolving policy. A missing manifest without an override still raises the current diagnostic.
- A create source change has no entry in `ChangePlan.sourceHashes`; its precondition is the explicit `operation: create` plus current absence. A replace source change must have the current source SHA-256 in `sourceHashes`. The plan hash covers both the operation and source content.
- `revalidatePreconditions` prepares a create source operation with `existed: false` and a replace operation with `existed: true`; both are installed by the existing transaction, which already creates missing parent directories and refuses target clobbering.

### Task 1: Add an in-memory bootstrap source path

**Files:**

- Modify: `src/schema/load-project.ts`
- Modify: `src/cli/commands/common.ts`
- Test: `tests/unit/schema-validation.test.ts`
- Create: `tests/unit/bootstrap.test.ts`

**Interfaces:**

- Consumes: explicit or confirmed bundle IDs, `CommandContext.toolkitVersion`, and the existing `sourceOverrides` map.
- Produces: a deterministic `.agent-policy/policy.yaml` `SourceChange` with `operation: create` when the manifest is absent; a parsed `ProjectPolicySource` for compiler use without filesystem writes.

- [ ] **Step 1: Write the failing manifest-override loader test**

Create a temporary repository with no `.agent-policy/` directory. Call the extended loader with this exact override shape:

~~~ts
const manifest = [
  'schemaVersion: v1',
  'toolkitVersion: 0.1.0-alpha.1',
  'bundles: [react]',
  'targets: [codex]',
  '',
].join('\n')

await expect(loadProjectPolicy(root, { manifestOverride: manifest })).resolves.toMatchObject({
  path: '.agent-policy/policy.yaml',
  toolkitVersion: '0.1.0-alpha.1',
  bundles: ['react'],
  targets: ['codex'],
  overlayPaths: [],
})
~~~

Also assert that the repository still has no `.agent-policy/policy.yaml` after the call.

- [ ] **Step 2: Run the focused loader test and verify it fails**

Run: `pnpm test:unit -- tests/unit/schema-validation.test.ts`

Expected: FAIL because `loadProjectPolicy` has no override parameter and still attempts to read the missing manifest.

- [ ] **Step 3: Add the read-only loader option**

Add an options type with `manifestOverride?: string`. In `loadProjectPolicy`, use the override only for parsing the fixed manifest path; retain `readDeclaredFile` for the optional invariants file and every manifest-declared overlay. Do not make the default call permissive: `loadProjectPolicy(root)` must continue to raise `MISSING_MANIFEST_REFERENCE` when the manifest is absent.

- [ ] **Step 4: Write the failing bootstrap-preparation test**

Add a unit case whose root contains no `.agent-policy/` directory. Call `prepareBundleSelection` directly with an explicit selection and assert:

~~~ts
const result = await prepareBundleSelection(
  { repositoryRoot: root, toolkitRoot: root, toolkitVersion: '0.1.0-alpha.1' },
  ['core', 'react'],
  'codex',
)

expect(result.sourceChanges[0]).toMatchObject({
  path: '.agent-policy/policy.yaml',
  operation: 'create',
})

expect(parseYamlDocument(result.sourceChanges[0]?.content ?? '', '.agent-policy/policy.yaml')).toMatchObject({
  schemaVersion: 'v1',
  toolkitVersion: '0.1.0-alpha.1',
  bundles: ['react'],
  targets: ['codex'],
})

expect(await exists(join(root, '.agent-policy/policy.yaml'))).toBe(false)
~~~

- [ ] **Step 5: Implement deterministic bootstrap selection**

In `prepareBundleSelection`, use an `lstat`-based check of the exact manifest path and branch only on `ENOENT` before calling `loadProjectPolicy`. For that case, render only the minimal manifest from the selected non-Core bundles and required target, compute its UTF-8 SHA-256, and return:

~~~ts
{
  sourceChanges: [{
    path: '.agent-policy/policy.yaml',
    content,
    sha256: sha256Utf8(content),
    operation: 'create',
  }],
  overrides: new Map([['.agent-policy/policy.yaml', content]]),
}
~~~

Use the existing YAML dependency or a fixed serializer so repeated inputs produce identical bytes. Do not create the directory, add `invariants.yaml`, infer project policy, or modify an existing path. Existing manifest paths continue through the current bundle/target replacement logic byte-for-byte.

- [ ] **Step 6: Compile the override without changing normal commands**

Have `compileCodex` pass `sourceOverrides.get('.agent-policy/policy.yaml')` to `loadProjectPolicy` when present. Keep the current `manifestSource` override, toolkit-version check, source-path hashing, lock generation, and adapter projection. A direct `check`, `remove`, or compilation call with no source override must still fail on a missing manifest.

- [ ] **Step 7: Run the focused schema and bootstrap tests**

Run: `pnpm test:unit -- tests/unit/schema-validation.test.ts`

Run: `pnpm test:unit -- tests/unit/bootstrap.test.ts`

Expected: the loader override and in-memory bootstrap tests pass; no consumer file is created; existing-manifest behavior is unchanged.

- [ ] **Step 8: Commit the source-loading boundary**

~~~bash
git add src/schema/load-project.ts src/cli/commands/common.ts tests/unit/schema-validation.test.ts tests/unit/bootstrap.test.ts
git commit -m "feat: stage a bootstrap policy manifest during init"
~~~

### Task 2: Make `SourceChange: create` a real hash-bound plan operation

**Files:**

- Modify: `src/planner/create-plan.ts`
- Modify: `src/applier/preconditions.ts`
- Modify: `src/cli/format-diff.ts`
- Test: `tests/unit/planner.test.ts`
- Test: `tests/cli/apply.test.ts`

**Interfaces:**

- Consumes: the existing `SourceChange` union and source override produced by Task 1.
- Produces: plans that distinguish an absent canonical source from a present, hashed source without adding a second mutation path or changing the transaction API.

- [ ] **Step 1: Write the failing planner creation test**

Create a repository with no `.agent-policy/` directory and request a plan with:

~~~ts
const planRequest: PlanRequest = {
  command: 'init',
  toolkitVersion: '0.1.0-alpha.1',
  repositoryRoot: root,
  planPath,
  sourcePaths: ['.agent-policy/policy.yaml'],
  sourceChanges: [{
    path: '.agent-policy/policy.yaml',
    content,
    sha256: hash(content),
    operation: 'create',
  }],
  desiredArtifacts: [],
  createdAt: '2026-08-14T00:00:00.000Z',
}

const plan = await createChangePlan(planRequest)
~~~

The relevant request fields are:

~~~ts
const content = [
  'schemaVersion: v1',
  'toolkitVersion: 0.1.0-alpha.1',
  'bundles: []',
  'targets: [codex]',
  '',
].join('\n')
~~~

Assert that planning succeeds without creating `.agent-policy`, the source change remains `operation: create`, and `.agent-policy/policy.yaml` is not inserted into `sourceHashes` because its reviewed current state is absence. Add the inverse test: `operation: create` fails without writing a plan when the source already exists.

- [ ] **Step 2: Run the focused planner test and verify it fails**

Run: `pnpm test:unit -- tests/unit/planner.test.ts`

Expected: FAIL because `createChangePlan` unconditionally reads every `sourcePaths` entry.

- [ ] **Step 3: Implement source precondition encoding in the planner**

Index `sourceChanges` by path before collecting `sourceHashes`. For each declared source:

~~~ts
const current = await readCurrent(sourcePath)
const change = sourceChangesByPath.get(sourcePath)
if (current === undefined) {
  if (change?.operation !== 'create') throw new Error(`Missing canonical source: ${sourcePath}`)
  continue // absence is the create precondition; do not invent a hash
}
if (change?.operation === 'create') {
  throw new Error(`Canonical source already exists for create: ${sourcePath}`)
}
sourceHashes[sourcePath] = sha256Utf8(current)
~~~

Keep path confinement, source-content hashing, source-change overlap checks, canonical serialization, and atomic external plan saving unchanged. A source change with `operation: replace` must continue to require a current hash.

- [ ] **Step 4: Implement create-aware plan-shape and immutable checks**

In `validatePlanShape`, require a `sourceHashes` entry for `replace` and require it to be absent for `create`. In both `revalidateImmutablePreconditions` and `revalidatePreconditions`, validate every create source as `current === undefined`; report `source-drift` if it appears. Preserve the existing hash comparison for replace sources.

When preparing the transaction operation, map source creation to:

~~~ts
{
  relativePath: source.path,
  targetPath,
  content: source.content,
  existed: false,
}
~~~

Map source replacement exactly as today with `existed: true`, its expected hash, and its existing pre-install recheck behavior. The existing transaction then creates missing parent directories, uses no backup for a new source, and links the reviewed bytes without clobbering a concurrently created target.

- [ ] **Step 5: Make reviewed diffs show source creation**

Build the source path list in `formatChangePlanDiff` from the sorted union of `Object.keys(plan.sourceHashes)` and `plan.sourceChanges.map(({ path }) => path)`. For a create change, print `expected: absent` and the full reviewed new content with an explicit `(new)` label. Keep `detectChangePlanDrift` aligned with the same union: a create source is clean only while absent; a replace source is clean only when its expected hash matches.

- [ ] **Step 6: Add apply and rollback regression tests**

Extend `tests/cli/apply.test.ts` to verify:

1. a reviewed create source and generated artifact apply together, creating the source directory and source file;
2. a source that appears after planning returns `source-drift` and leaves the generated target absent;
3. an injected later transaction failure removes the newly created source and generated files, leaving no partial `.agent-policy/` tree except any pre-existing content.

Do not alter `src/applier/transaction.ts` unless a test proves the existing `existed: false` path cannot handle a canonical source; the intended fix feeds it the correct operation metadata.

- [ ] **Step 7: Run focused planner and applier tests**

Run: `pnpm test:unit -- tests/unit/planner.test.ts`

Run: `pnpm test:cli -- tests/cli/apply.test.ts`

Expected: create and replace source paths are distinguished, stale plans fail before mutation, and existing artifact/rollback tests remain green.

- [ ] **Step 8: Commit the generic source-create semantics**

~~~bash
git add src/planner/create-plan.ts src/applier/preconditions.ts src/cli/format-diff.ts tests/unit/planner.test.ts tests/cli/apply.test.ts
git commit -m "fix: honor canonical source creation preconditions"
~~~

### Task 3: Close the CLI lifecycle and documentation boundary

**Files:**

- Modify: `src/cli/main.ts`
- Modify: `tests/cli/lifecycle.test.ts`
- Modify: `tests/cli/help.test.ts`
- Modify: `README.md`
- Modify: `docs/consumer-lifecycle.md`

**Interfaces:**

- Consumes: the bootstrap source and create-aware planner/applier from Tasks 1–2.
- Produces: user-visible lifecycle guidance and a regression gate covering a fresh consumer from plan through source-preserving removal.

- [ ] **Step 1: Complete the fresh-consumer lifecycle test**

In the fresh-root test, assert this sequence:

~~~ts
const planPath = join(parent, 'fresh-init-plan.json')
const removePlanPath = join(parent, 'fresh-remove-plan.json')

await runCli(['init', '--target', 'codex', '--bundles', 'core,react', '--plan', planPath], realIo(root))
await runCli(['diff', planPath], realIo(root))
await runCli(['apply', planPath, '--yes'], realIo(root))
await runCli(['check'], realIo(root))
await runCli(['remove', '--target', 'codex', '--plan', removePlanPath], realIo(root))
await runCli(['apply', removePlanPath, '--yes'], realIo(root))
~~~

The assertions must prove that:

- `init` and `diff` leave the repository unchanged before apply;
- the plan contains the exact minimal manifest as a reviewed `create` source change;
- `apply` creates `.agent-policy/policy.yaml`, the lock, and the expected Codex projections only after review;
- `check` passes read-only after apply;
- `check` and `remove --target codex` fail closed before apply if invoked while the manifest is still absent;
- target removal removes projections but preserves the newly bootstrapped `.agent-policy/policy.yaml` and its canonical bytes;
- the original unmanaged `AGENTS.md` text remains byte-identical outside its Managed Region;
- a second initialization from the preserved manifest is idempotent.

Add a stale-plan branch where the absent manifest is created manually after `init`; `diff` and `apply` must report source drift and must not overwrite it.

- [ ] **Step 2: Document the bootstrap behavior in help**

Extend `helpText` with one concise statement that `init` stages a minimal consumer-owned `.agent-policy/policy.yaml` when it is absent, and that the file is created only by applying the reviewed plan. Update `tests/cli/help.test.ts` to assert the statement while retaining the zero-filesystem-write assertion.

- [ ] **Step 3: Update consumer lifecycle documentation**

Revise `docs/consumer-lifecycle.md` so the initialize section says:

- a fresh repository may begin without `.agent-policy/`;
- explicit or confirmed Bundle Selection is rendered into an in-memory minimal manifest;
- the plan shows that manifest as a canonical `create` source change and remains external/read-only;
- only `apply` creates `.agent-policy/policy.yaml` transactionally;
- existing `.agent-policy` content, unmanaged harness prose, and invalid/unsafe paths are not classified or silently overwritten;
- after bootstrap, the ordinary source → plan → diff → apply → check lifecycle applies.

Keep the ownership table and source-preserving removal ruling unchanged.

- [ ] **Step 4: Align README entry points**

Change the Requirements and lifecycle-at-a-glance text in `README.md` from “the consumer must already have human-owned `.agent-policy/` sources” to “the consumer owns `.agent-policy/` after reviewed initialization; `init` can bootstrap the missing manifest.” Retain the exact plan-outside-worktree, explicit-selection, and apply-only mutation guidance.

- [ ] **Step 5: Run the complete upstream verification gate**

Run:

~~~bash
pnpm check
pnpm pack:check
~~~

Then perform an installed-package smoke test in a temporary empty consumer with an external absolute plan path. Use `/private/tmp/agent-policy-bootstrap-smoke-plan.json` as the plan path after confirming it is outside the temporary consumer. Verify `agent-policy init --target codex --bundles core --plan /private/tmp/agent-policy-bootstrap-smoke-plan.json`, `diff`, `apply --yes`, and `check`; inspect that no consumer file or directory was written before apply.

- [ ] **Step 6: Commit the lifecycle and documentation boundary**

~~~bash
git add src/cli/main.ts tests/cli/lifecycle.test.ts tests/cli/help.test.ts README.md docs/consumer-lifecycle.md
git commit -m "docs: support fresh consumer initialization"
~~~

## Acceptance gate

The fix is ready for a new prerelease only when all of the following are true:

- a repository with no `.agent-policy/` can produce a reviewed external `init` plan;
- planning and diffing create no consumer files or directories;
- the plan exposes the exact bootstrap manifest and encodes current absence as a precondition;
- apply creates the manifest and projections transactionally, and stale or concurrent source appearance fails closed;
- the existing-manifest selection, drift, ownership, and rollback suites remain green;
- `check` and removal preserve their current fail-closed/source-preserving behavior;
- existing unmanaged `AGENTS.md` text and hand-authored skills remain byte-identical;
- `pnpm check`, package-content validation, and the installed empty-consumer smoke test pass;
- documentation no longer instructs consumers to hand-author `policy.yaml` before every first `init`.

No model-based activation or cross-harness compatibility claim is added by this defect fix.
