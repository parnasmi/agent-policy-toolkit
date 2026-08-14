# Defect: `init` requires `.agent-policy/policy.yaml` to pre-exist (no bootstrap path)

- **Reported from:** tms-frontend dogfood (first Dogfood Consumer), 2026-08-13
- **Toolkit version:** `0.1.0-alpha.1` (Codex adapter)
- **Severity:** low (lifecycle/documentation gap; workaround is authoring the manifest by hand)
- **Status:** open (deferred; separate from the marker-detection fix)

## Symptom

On a repository with no `.agent-policy/` directory, `agent-policy init` exits `1`:

```text
.agent-policy/policy.yaml MISSING_MANIFEST_REFERENCE: ENOENT: no such file or directory,
realpath '<repo>/.agent-policy'
```

## Root cause

`init` calls `prepareBundleSelection` → `loadProjectPolicy`, which requires
`.agent-policy/policy.yaml` to already exist (it reads, validates, and edits the `bundles`
and `targets` fields of an existing manifest). There is no documented bootstrap path that
creates the initial manifest from scratch.

This is consistent with the design (`.agent-policy/policy.yaml` is human-owned canonical
source; §4.2, §5.2, §11), but it is not documented: `docs/consumer-lifecycle.md` shows the
source layout and the `init` command without stating that the consumer must author the
initial manifest first.

## Workaround

Author a minimal manifest by hand before `init`, e.g.:

```yaml
schemaVersion: v1
toolkitVersion: 0.1.0-alpha.1
bundles: []
targets: [codex]
```

## Suggested remediation direction

Either document the pre-existing manifest requirement explicitly in
`docs/consumer-lifecycle.md` (and the init help/README), or add a bootstrap path (a
scaffold command or `init` behavior that writes a reviewed minimal manifest when
`.agent-policy/` is absent).
