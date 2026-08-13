# Defect: `check` false-positives on documentation quoting the Managed Region markers

- **Reported from:** tms-frontend dogfood (first Dogfood Consumer), 2026-08-13
- **Toolkit version:** `0.1.0-alpha.0` (Codex adapter)
- **Severity:** high for lifecycle verification (blocks `agent-policy check` acceptance gate); no mutation/data-loss impact
- **Status:** fixed in `0.1.0-alpha.1` (see `fix: scope Managed Region detection to known entry files`)

## Symptom

```text
$ agent-policy check
...
Unexpected generated artifacts:
! <repo>/docs/superpowers/plans/2026-08-12-agent-policy-toolkit-codex-foundation.md
(exit 1)
```

Any repository file whose text contains the literal marker pair

```text
<!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->
...
<!-- agent-policy:end -->
```

is classified as a toolkit-owned Managed Region, even when it is ordinary documentation.

## Root cause

`findGeneratedFiles` (`src/cli/commands/common.ts`) walks the whole repository and, for
each file, calls `hasManagedRegion(content)`, which returns true whenever the exact
`MANAGED_REGION_START`/`MANAGED_REGION_END` markers appear anywhere in the file. The walk
does not require generated-header ownership (`generatedOwnership`) and does not restrict
managed-region detection to declared entry files (e.g. `AGENTS.md`). `check` then reports
the file under "Unexpected generated artifacts" and exits `1`.

The same helper is shared by `remove --generated`, so that command is likely affected the
same way.

## Minimal fixture

1. Install the toolkit into a consumer repo; `init` + `apply` to produce projections.
2. Add an ordinary file `docs/foo.md` containing exactly:

   ```text
   <!-- agent-policy:start owner=@agent-policy/agent-policy-toolkit -->
   <!-- agent-policy:end -->
   ```

3. `agent-policy check` → exit `1`, reports `docs/foo.md` as an unexpected generated artifact.

## Control (isolation evidence)

Moving the marker-quoting file out of the repository makes `agent-policy check` exit `0`
(`Check passed: compiled policy matches committed Codex artifacts`); restoring it makes the
failure return. The generated projections themselves are clean.

## Suggested remediation direction

Scope managed-region detection so a file is treated as toolkit-owned only when it is a
declared entry file (e.g. `AGENTS.md`) or otherwise requires the generated-header ownership
marker, rather than matching marker text anywhere in an arbitrary file. Exclude
documentation from the `findGeneratedFiles` walk, or require `generatedOwnership` before
`hasManagedRegion` classification outside the known entry-file set.
