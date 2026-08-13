# Agent Policy Toolkit

Agent Policy Toolkit is a portable, layered policy compiler for AI coding-agent harnesses. It keeps a small Core Policy Bundle in startup context, projects contextual bundles into discoverable skills, and makes every repository mutation go through a reviewed, hash-bound Change Plan.

`0.1.0-alpha.0` is the first prerelease. Codex is the only implemented adapter and is explicitly experimental. The package is intended for evaluation and dogfooding; it does not claim stable cross-harness compatibility or semantic model-activation accuracy.

## Requirements

- Node.js `>=22.20.0` (the CI matrix also exercises Node 24)
- pnpm `11.3.0` through Corepack
- a consumer repository with human-owned `.agent-policy/` sources

The toolkit owns shared catalog sources under `catalog/`. A consumer owns its project policy under `.agent-policy/`. Harness files are projections, not canonical policy.

## Install

Pin the exact prerelease in a consumer repository:

```bash
corepack pnpm add --save-dev --save-exact @agent-policy/agent-policy-toolkit@0.1.0-alpha.0
```

For dogfood before registry publication, install the verified tarball recorded in the Task 13 release report:

```bash
corepack pnpm add --save-dev --save-exact /absolute/path/to/agent-policy-agent-policy-toolkit-0.1.0-alpha.0.tgz
```

Do not use a workspace, link, branch, or version range for a dogfood installation. Keep the recorded SHA-256 with the consumer evidence.

## Lifecycle at a glance

1. Create or review the consumer-owned `.agent-policy/policy.yaml`.
2. Run `agent-policy init --target codex --bundles ... --plan /absolute/path/plan.json`. Initialization is read-only and saves a plan outside the consumer worktree.
3. Review `agent-policy diff /absolute/path/plan.json`. The diff includes resolved paths, canonical source changes, generated content, drift, and deletions.
4. Apply only that reviewed plan with `agent-policy apply /absolute/path/plan.json --yes`.
5. Run `agent-policy check` to compile into temporary staging and verify committed projections without writing to the consumer.

When `--bundles` is omitted, detection is advisory and must be confirmed interactively. `--yes` confirms application of a reviewed plan; it never confirms an advisory Bundle Selection. Existing prose in `AGENTS.md` remains unmanaged and byte-preserved outside the bounded Managed Region.

The CLI never creates a Git commit. A successful apply ends with `Ready to commit`; the human reviews and commits the resulting source and projection changes.

For exact ownership, drift, removal, and rollback behavior, read [Consumer Lifecycle](docs/consumer-lifecycle.md). For source authoring, read [Authoring Rules](docs/authoring-rules.md).

## Implemented boundary

The Codex Adapter Knowledge tested in this prerelease is:

- root instructions discovered from `AGENTS.md`;
- shared skills discovered from `.agents/skills/*/SKILL.md`;
- Codex native roles are unavailable in this slice;
- isolated work, parallel work, harness-native tools, and scoped instructions are recorded as capabilities of the tested profile.

The adapter emits ordinary files rather than symlinks. It projects compact Core policy, selected Repository Invariants, and concise routing into a bounded `AGENTS.md` Managed Region. Domain bundles are emitted as root-discoverable skills with semantic positive hints and explicit exclusions.

The adapter contract and its experimental status are documented in [Adapter Contracts](docs/adapter-contracts.md). The deterministic boundary around activation fixtures and future model-based evaluation is documented in [Activation Evals](docs/activation-evals.md).

## What is not in this release

The foundation deliberately stops after the Codex Slice A lifecycle. Toolkit update, package-wiring uninstall, source purge, CI integration, policy-maintainer, Agent Roles, DocsExplorer, code review, non-Codex adapters, Next.js, security, accessibility, debugging, React Native, and Expo remain deferred. No deferred capability is silently represented as implemented.

## License

MIT. See [LICENSE](LICENSE).
