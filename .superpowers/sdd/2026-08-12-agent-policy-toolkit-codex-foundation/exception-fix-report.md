# Exceptional second final-fix report

## Status

DONE. This is the human-authorized exceptional second final-fix wave from baseline `6d3c60a`, limited to the two load-bearing lifecycle defects recorded in `progress.md` and `final-fix-report.md`.

Commit: the single exceptional fix commit `fix: close exceptional lifecycle review gaps`.

## RED evidence

The new contracts were written before the production changes and were replayed against the defective behavior:

- With the former `policyLockArtifact()` full-file hash behavior restored, `keeps policy lock clean when unmanaged AGENTS bytes change` failed because `check` returned `1` after an unmanaged footer edit.
- With the former `generatedRemoval()` compile-first behavior restored, `removes generated projections after Codex is removed from the manifest` failed because `remove --generated` returned `1` (`TARGET_NOT_SELECTED`) and did not create a plan.

These RED runs were restored to the final implementation before GREEN verification.

## GREEN evidence

Focused final-fix contracts:

```text
corepack pnpm exec vitest run --project cli tests/cli/final-fixes.test.ts --testTimeout=30000
PASS — 1 file, 11 tests
```

The suite covers lock metadata and canonical hashing, unmanaged prose and CRLF boundaries, Managed Region drift, and generated cleanup after the Codex target is removed. Existing lifecycle and removal contracts also pass.

Pinned full verification used Corepack pnpm `11.3.0` with the repository's temporary Corepack-enabled PATH shim for nested scripts:

```text
corepack pnpm check       PASS — 17 test files, 166 tests, typecheck, build
git diff --check         PASS
corepack pnpm pack:check  PASS
corepack pnpm pack        PASS
```

## Implemented scope

- `policy.lock.json` now stores per-artifact integrity records with `sha256`, `operation`, and exact toolkit `owner`. Managed Region entries hash only canonical marker-delimited region bytes; fully managed entries hash canonical generated content. The lock self-hash remains deterministic and schema-validated.
- Unmanaged `AGENTS.md` prose and CRLF/LF changes outside the Managed Region leave the lock byte-identical and clean under `check`; edits inside the Managed Region remain drift.
- `remove --generated` enumerates recognized toolkit-owned projections independently, without calling target-enforcing `compileCodex`. It works when `policy.yaml` exists without `codex`, and when canonical sources are missing; it preserves policy sources, package wiring, and foreign output while enforcing exact self-hash/ownership.

## Exact verified tarball

- Package: `@agent-policy/agent-policy-toolkit@0.1.0-alpha.0`
- Tarball: `/Users/ilhom.maksadkulov/Custom/projects/agent-policy-toolkit/agent-policy-agent-policy-toolkit-0.1.0-alpha.0.tgz`
- SHA-256: `10bacefbff01525d9a8120787bb90d3d4b1ce883abaf08828e38cb45df4fea63`

Exact tarball smoke used Corepack pnpm `11.3.0` in `/var/folders/1n/kd0hrd0n3f32sc5mb120_z900000gn/T/agent-policy-exception-smoke-final.XXXXXX.ibClRiKu9F/consumer`:

- `agent-policy --help`: PASS, exit 0.
- `init --target codex --bundles core --plan <external>`: PASS, exit 0; plan SHA-256 `d508304127f6d27bbf32dfd00e7696bf63a52424ced0c273134e09ac3c4b797c`.
- Exact reviewed plan apply: PASS, exit 0.
- `check`: PASS, exit 0.
- Generated `.agent-policy/policy.lock.json`: present after apply.

No publish was attempted.
