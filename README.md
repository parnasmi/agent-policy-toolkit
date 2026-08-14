# Agent Policy Toolkit

Agent Policy Toolkit is a portable, layered policy compiler for AI coding-agent harnesses. It keeps a small Core Policy Bundle in startup context, projects contextual bundles into discoverable skills, and makes every repository mutation go through a reviewed, hash-bound Change Plan.

`0.1.0-alpha.1` is the first prerelease. Codex is the only implemented adapter and is explicitly experimental. The package is intended for evaluation and dogfooding; it does not claim stable cross-harness compatibility or semantic model-activation accuracy.

## Requirements

- Node.js `>=22.20.0` (the CI matrix also exercises Node 24)
- pnpm `11.3.0` through Corepack
- a consumer repository; the consumer owns `.agent-policy/` after reviewed initialization, and `init` can bootstrap the missing manifest

The toolkit owns shared catalog sources under `catalog/`. A consumer owns its project policy under `.agent-policy/`. Harness files are projections, not canonical policy.

The final-fix verification run in this workspace used Node.js `v24.15.0`; an exact Node.js `22.20.0` executable was not installed locally. CI retains the exact `22.20.0` matrix entry and is the authority for that environment.

The published package includes the maintainer and consumer guidance under `docs/` and this changelog; the links below therefore work from an installed tarball as well as from the repository.

## Install

Pin the exact prerelease in a consumer repository:

```bash
corepack pnpm add --save-dev --save-exact @agent-policy/agent-policy-toolkit@0.1.0-alpha.1
```

For dogfood before registry publication, install the verified tarball recorded in the Task 13 release report:

```bash
corepack pnpm add --save-dev --save-exact /absolute/path/to/agent-policy-agent-policy-toolkit-0.1.0-alpha.1.tgz
```

Do not use a workspace, link, branch, or version range for a dogfood installation. Keep the recorded SHA-256 with the consumer evidence.

## Lifecycle at a glance

1. Create or review the consumer-owned `.agent-policy/policy.yaml`, or let reviewed initialization bootstrap the missing manifest.
2. Run `agent-policy init --target codex --bundles ... --plan /absolute/path/plan.json`. Initialization is read-only, stages a minimal consumer-owned manifest when it is missing, adds `codex` to `policy.yaml.targets` through the reviewed plan when needed, and saves the plan outside the consumer worktree.
3. Review `agent-policy diff /absolute/path/plan.json`. The diff includes resolved paths, canonical source changes, generated content, drift, and deletions.
4. Apply only that reviewed plan with `agent-policy apply /absolute/path/plan.json --yes`.
5. Run `agent-policy check` to compile into temporary staging and verify committed projections without writing to the consumer.

When `--bundles` is omitted, detection is advisory and must be confirmed interactively. `--yes` confirms application of a reviewed plan; it never confirms an advisory Bundle Selection. Existing prose in `AGENTS.md` remains unmanaged and byte-preserved outside the bounded Managed Region.

Successful initialization also generates `.agent-policy/policy.lock.json`. It is not canonical source: the lock records the exact toolkit release, Codex Adapter Knowledge version, canonical source digest, and owned integrity records for every generated Codex artifact. Managed Region records hash only the canonical region (with operation and owner metadata), so unmanaged `AGENTS.md` prose and boundary line-ending changes do not rewrite the lock; fully managed files record their canonical generated-content hash. `check` reproduces it read-only; projection removal removes the generated lock while preserving `policy.yaml` and other canonical sources.

For drift, interactive clients offer `adopt`, `regenerate`, or `abort`. The strict non-interactive form is `--reconcile adopt|regenerate|abort`; unresolved drift fails without writing. Regeneration and any representable adoption produce a new external reviewed plan or proposal; neither choice edits files directly.

Optional `.agent-policy/invariants.yaml` contains the consumer's ordered, atomic Repository Invariants. The CLI validates and projects their `instruction` text into the Codex Managed Region; `rules: []` selects none. The file is canonical input, never inferred from existing `AGENTS.md` prose.

The CLI never creates a Git commit. A successful apply ends with `Ready to commit`; the human reviews and commits the resulting source and projection changes.

For exact ownership, drift, removal, and rollback behavior, read [Consumer Lifecycle](docs/consumer-lifecycle.md). For source authoring, read [Authoring Rules](docs/authoring-rules.md).

## Implemented boundary

The Codex Adapter Knowledge declared for this experimental prerelease is:

- root instructions discovered from `AGENTS.md` (directly contract-tested);
- shared skills discovered from `.agents/skills/*/SKILL.md` (directly contract-tested);
- Codex native roles are unavailable in this slice (declared profile value; no native role projection is emitted);
- isolated work, parallel work, harness-native tools, and scoped instructions are declared experimental profile knowledge, not independently verified toolkit behavior.

The adapter emits ordinary files rather than symlinks. It projects compact Core policy, selected Repository Invariants, and concise routing into a bounded `AGENTS.md` Managed Region. Domain bundles are emitted as root-discoverable skills with semantic positive hints and explicit exclusions.

The adapter contract and its experimental status are documented in [Adapter Contracts](docs/adapter-contracts.md). The deterministic boundary around activation fixtures and future model-based evaluation is documented in [Activation Evals](docs/activation-evals.md).

## What is not in this release

The foundation deliberately stops after the Codex Slice A lifecycle. Toolkit update, package-wiring uninstall, source purge, CI integration, policy-maintainer, Agent Roles, DocsExplorer, code review, non-Codex adapters, Next.js, security, accessibility, debugging, React Native, and Expo remain deferred. No deferred capability is silently represented as implemented.

## License

MIT. See [LICENSE](LICENSE).
