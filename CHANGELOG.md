# Changelog

All notable changes to Agent Policy Toolkit are documented here.

## [0.1.0-alpha.0] - 2026-08-13

The first Codex foundation prerelease. This is experimental evaluation software, not a stable cross-harness support release.

### Added

- A versioned canonical catalog with compact Core and six contextual domain bundles.
- Project-owned `.agent-policy/` sources, overlays, scoped profiles, migrations, and hash-bound Change Plans.
- Deterministic render profiles and a pure Codex projection adapter.
- Codex `AGENTS.md` Managed Regions and ordinary `.agents/skills/*/SKILL.md` projections with ownership metadata.
- Read-only `init`, `diff`, and `check` commands plus reviewed transactional `apply` and source-preserving `remove` commands.
- Explicit drift reconciliation proposals (`adopt`, `regenerate`, and `abort`).
- Deterministic Activation Fixture structure/polarity validation for the six domain bundles.
- Maintainer and consumer lifecycle documentation, including the portable hard-link safety ruling.
- MIT licensing.

### Review fixes included in the prerelease

- Canonical `.agent-policy/invariants.yaml` loading, validation, ordered projection, and empty-selection behavior.
- Fail-closed target/generated removal when an owned artifact has drifted from canonical desired bytes.
- Source-less generated cleanup using self-contained artifact hashes, with unverifiable legacy output rejected.
- Exact Managed Region byte preservation for non-final-newline and newline-only `AGENTS.md` inputs.
- Published `docs/` and `CHANGELOG.md` files so installed-package documentation links remain usable.
- Adapter Knowledge wording distinguishes directly contract-tested discovery from declared experimental profile values.
- Overlay schemas accept canonical IDs and legacy `RULE_*` aliases, while content-bearing directives reject empty content.
- Codex target selection is authoritative and initialization records any target addition as a reviewed manifest source change.
- Generated `.agent-policy/policy.lock.json` records exact release/Adapter Knowledge versions and managed artifact hashes; removal reconciles stale Codex skills and lock state.
- Interactive drift choices are wired to new reviewed external plans, and generated skill ownership accepts verified LF/CRLF variants.

### Support boundary

- Codex support is experimental and tied to Adapter Knowledge `codex-2026-08-12`.
- Native roles are not available in this slice; no Agent Role support is claimed.
- Fixture validation is deterministic data validation only. No model-based Activation Eval has been run or claimed.
- Claude Code, OpenCode, Pi, Google Antigravity, policy-maintainer, DocsExplorer, code review, further domain bundles, CI integration, package-wiring uninstall, source purge, and crash journaling remain deferred.

### Release evidence

The verified package tarball path and SHA-256, frozen-install/check/pack evidence, capability-contract result, lifecycle fixture result, registry ownership check, and publish outcome are recorded in the Task 13 report under `.superpowers/sdd/2026-08-12-agent-policy-toolkit-codex-foundation/task-13-report.md`.
