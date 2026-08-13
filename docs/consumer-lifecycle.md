# Consumer Lifecycle

The consumer repository owns `.agent-policy/`; the toolkit owns shared catalog sources and deterministic projection code. Treat the source tree and projections as one reviewed change, but never treat a harness-native file as the canonical policy source.

## Consumer source layout

A consumer's root manifest is `.agent-policy/policy.yaml`. It pins the schema, exact toolkit version, selected bundles, and target harnesses. Optional declared overlays and profiles remain beneath `.agent-policy/` and are loaded only from paths that resolve inside that directory.

Typical project-owned sources are:

```text
.agent-policy/
├── policy.yaml
├── policy.lock.json       # generated integrity record; never human-authored source
├── invariants.yaml
├── overlays/rules.yaml
├── rules/<namespace>/<rule>.md
├── bundles/<bundle>.yaml
├── skills/<name>/SKILL.md
├── roles/<name>/
└── evidence/<case>.md
```

The foundation CLI consumes the root manifest, optional `.agent-policy/invariants.yaml`, and declared overlays. Invariants use an ordered `rules` list of unique namespaced IDs and non-empty instructions; the list is the selection and order, and `rules: []` selects none. The CLI projects only those instructions into Codex's Managed Region and includes the file in the canonical source hash. It does not infer Repository Invariants from existing prose, rewrite a consumer's source into a generated format, or create an unreviewed source selection.

The manifest `targets` field is authoritative. Codex compilation, checking, and Codex-target removal fail closed when `codex` is absent. `init --target codex` adds that target to the canonical manifest through the reviewed `policy.yaml` source change in the plan; the source is unchanged until apply.

## Plan, review, apply

The safe lifecycle is:

```text
canonical sources → init plan → diff review → exact apply → check
                         ↘ drift reconciliation when needed
```

### Initialize

Run from the consumer root:

```bash
agent-policy init \
  --target codex \
  --bundles core,implementation-design,typescript,react,async-control-flow,data-boundaries,testing \
  --plan /absolute/path/to/init-plan.json
```

`--plan` must be an explicit absolute path outside the consumer worktree. Planning compiles sources and virtual artifacts but does not write the consumer. The plan itself is saved atomically at the external path.

If `--bundles` is omitted, package, lockfile, source-extension, and test-configuration inspection proposes a Bundle Selection with evidence. Detection is advisory: it requires interactive confirmation. `--yes` does not confirm this proposal. Use an explicit `--bundles` list for a non-interactive plan. If the explicit list or required `codex` target differs from the source manifest, the plan contains a reviewed source change; the existing source remains unchanged until apply.

Initialization preserves all existing `AGENTS.md` prose outside the exact bounded Managed Region and does not overwrite existing hand-authored skills. A foreign or malformed managed marker is drift and fails closed.

### Review the plan

```bash
agent-policy diff /absolute/path/to/init-plan.json
```

The diff reports the repository, command scope, toolkit version, plan hash, resolved absolute paths, complete canonical source changes, complete generated changes, drift, deletions, and diagnostics. Review every source and generated line. The reviewed plan is the only unit that may cross the mutation boundary.

### Apply the exact plan

```bash
agent-policy apply /absolute/path/to/init-plan.json --yes
```

Apply revalidates the plan hash, repository fingerprint, toolkit version, canonical source hashes, full current artifact hashes, Managed Region hashes when present, ownership, and confined target paths immediately before mutation and again at mutation boundaries. It writes through a transactional sequence and reports rollback failures rather than hiding them. It never makes a Git commit; successful output says `Ready to commit`.

## Portable safety ruling

The foundation deliberately chooses portable no-clobber safety over a literal prepared-file `rename`.

1. A sibling temporary is created and `fsync`ed where supported.
2. Reviewed source, artifact, root, version, and plan preconditions are revalidated.
3. Installation uses a hard link to create the target without overwriting a target that appeared concurrently.
4. The installed bytes are verified and the temporary link is removed.

This requires same-filesystem hard links in the destination directory. If link creation fails because the filesystem or permissions do not support it, application fails safely. It does not fall back to clobbering `rename`. For a replacement that has already moved the original to a backup, restoration may also be unavailable; the target can remain absent while the original `.backup` stays recoverable and is reported prominently as `ROLLBACK FAILED`.

The implementation provides in-process failure recovery and visible rollback diagnostics. It does not claim crash-unambiguous recovery after process death, kernel failure, or a lost acknowledgement between a completed filesystem syscall and its acknowledgement. Crash journaling and a native descriptor-relative filesystem adapter are deferred.

## Check and reproducibility

```bash
agent-policy check
```

`check` compiles into temporary external staging, validates schemas, aliases, overlays, dependencies, migrations, projections, ownership, and hashes, and compares the result with committed output. It is read-only, creates no consumer cache, and reports stale toolkit-owned generated files. A clean result means the source and committed Codex projections match this exact toolkit version.

The check also reproduces `.agent-policy/policy.lock.json`, including its exact toolkit and Adapter Knowledge versions and managed-artifact hashes. A missing, malformed, stale, or tampered lock is drift.

## Drift reconciliation

Drift is never silently adopted. Interactive clients offer the following choices; strict callers may pass `--reconcile adopt|regenerate|abort`:

- `adopt` — propose a canonical-source change only when the adapter can represent the artifact edit as canonical source intent; the proposal still requires a fresh reviewed plan;
- `regenerate` — discard artifact edits and create a fresh plan from canonical sources; the new output still requires review;
- `abort` — write nothing.

Non-interactive unresolved drift fails. A manual edit to a generated skill, an unmanaged edit around a Managed Region, a foreign owner, duplicate markers, or a changed source hash must be resolved before application. Current Codex output has no general artifact-to-source adopter, so an unrepresentable `adopt` request reports the limitation and writes nothing.

## Removal

Plan and apply projection removal independently:

```bash
agent-policy remove --target codex --plan /absolute/path/to/remove-codex.json
agent-policy apply /absolute/path/to/remove-codex.json --yes

agent-policy remove --generated --plan /absolute/path/to/remove-generated.json
agent-policy apply /absolute/path/to/remove-generated.json --yes
```

`--target codex` removes only the Codex projection: it removes this toolkit's Managed Region while retaining surrounding `AGENTS.md` bytes and removes every current or stale Codex skill owned by this toolkit. `--generated` removes every recognized projection owned by this toolkit, preserving unrelated foreign or hand-written files. Both modes remove the generated policy lock when no retained target record remains.

Both modes preserve `.agent-policy/`, the toolkit dependency, and local scripts. Source purge, package-wiring uninstall, and a flag implying either operation are deliberately absent from this release. Reinitializing from the preserved source must produce identical projection bytes and hashes.

Removal planning also recompiles the canonical projection and compares every present owned artifact with its desired bytes before creating a removal plan. A drifted Managed Region or generated skill fails closed and asks for reconciliation; it does not use the edited bytes to construct a deletion plan. Stale generated skills are eligible only when their exact owner and self-contained hash verify. When canonical project sources are already absent, `--generated` can still remove current-release projections by verifying their self-contained artifact hashes; missing or invalid metadata fails closed rather than allowing an unverifiable deletion. Generated skill ownership and hashes accept LF or CRLF line endings without accepting a changed owner or content.

## Scope and profiles

The root manifest may declare multiple workspace profiles. Profiles remain root-discoverable; generated skill descriptions include explicit paths and optional workspace names. This release does not create nested `AGENTS.md` files merely because a profile is scoped.

## Ownership summary

| Area | Owner | Editing rule |
| --- | --- | --- |
| `catalog/` shared rules and bundles | Toolkit maintainers | Author canonical sources and run deterministic checks |
| `.agent-policy/` | Consumer maintainers | Change source, then plan/diff/apply |
| `AGENTS.md` outside marker region | Consumer maintainers | Existing prose remains unmanaged and byte-preserved |
| Codex Managed Region and generated skills | Toolkit projection | Do not hand-edit; regenerate from reviewed source |
| Git history | Human maintainer | CLI prepares changes but never commits |
