---
name: policy-maintainer
description: Maintain and audit AI coding-agent policy, audit existing instructions, stage project rules/invariants/overlays, and export upstream proposals. Explicit invocation only.
---

# policy-maintainer

## Mission

Maintain, audit, and evolve AI coding policy while strictly preserving deterministic change safety, enforcement-first classification, and harness-agnostic portability.

`policy-maintainer` owns human/LLM judgment (classification, wording, rationales, and recommending policy structures), while delegating all verification, schema validation, and filesystem mutations to the deterministic `agent-policy` CLI and immutable Change Plans.

---

## Boundaries and Safety Invariants

1. **Explicit Invocation Only:** Load and activate this workflow only upon explicit maintainer instruction (e.g., user request or `$policy-maintainer`). Do not run during normal feature development or opportunistic refactoring.
2. **No Direct Mutation of Managed Projections:** Never edit generated files (`.agents/skills/**/SKILL.md`, `.agent-policy/policy.lock.json`, or the Managed Region inside `AGENTS.md`) directly. All projections are generated deterministically by the CLI.
3. **No Direct Mutation of Canonical Sources:** Never directly edit files under `.agent-policy/` (or `catalog/` when upstream). Always use CLI staging commands (`agent-policy stage-invariant`, `agent-policy stage-source`) to generate an immutable `ChangePlan`, review the plan with `agent-policy diff`, and apply it with `agent-policy apply`.
4. **Preserve Unmanaged Content:** Hand-written guidance outside managed markers in `AGENTS.md` or other docs must be preserved byte-for-byte until explicitly classified, staged, and reviewed.
5. **Change Plan Immutability:** Change Plans are self-contained and hash-bound. If changes are needed, generate a fresh plan rather than modifying an existing plan.

---

## Enforcement-First Classification Rubric

Evaluate every candidate rule or instruction in strict top-to-bottom priority order:

```text
1. Can a reliable tool enforce the requirement?
   ├── YES ──► Mechanical Control (Lint / Test / Type / Hook / CI)
   │           Suggested Action: recommend-mechanical-control (omit from prompt)
   └── NO  ──▼
2. Must it guide nearly every task in the repository?
   ├── Technology/Project-Independent? ──► Shared Core Candidate (e.g. core.*)
   │                                       Suggested Action: export-upstream-proposal
   └── Repository Architecture Specific? ──► Repository Invariant
   │                                       Suggested Action: stage-invariant
   └── NO  ──▼
3. Does it apply only to a specific technology or project area?
   ├── Portable Framework / Tool Contract? ──► Shared Domain Policy Candidate
   │                                           Suggested Action: export-upstream-proposal or create-overlay
   └── Repository-Specific Domain Rule? ──► Project Policy
   │                                        Suggested Action: create-project-rule
   └── NO  ──▼
4. Is it a multi-step interactive procedure?
   └── YES ──► Canonical Workflow Skill (Shared: skills/ | Project: .agent-policy/skills/)
               Suggested Action: export-upstream-proposal or retain-as-project-skill
   └── NO  ──▼
5. Does it require isolated context, specialized tools, or parallelism?
   └── YES ──► Agent Role Candidate
               Suggested Action: discard or export-upstream-proposal
   └── NO  ──▼
6. Is it explanatory context or architectural narrative?
   ├── Relevant Documentation? ──► Ordinary Documentation (docs/*.md)
   │                               Suggested Action: retain-documentation
   └── Unproven / Speculative? ──► Speculative Guidance
                                   Suggested Action: discard
```

### Evidence Standards by Category

| Classification Tier | Required Evidence Type | Rationale & Sufficiency Contract | Compatible Suggested Actions |
| :--- | :--- | :--- | :--- |
| `mechanical-control` | `primary-source`, `standard-contract`, `local-contract` | Linters, typecheckers, tests, or CI checks can deterministically enforce this constraint without prompt tokens. | `recommend-mechanical-control`, `discard` |
| `shared-core` | `cross-project-failure` | Recorded recurring failure across independent codebases, independent of tech stack. | `export-upstream-proposal` |
| `repository-invariant` | `local-contract`, `architecture-decision`, `local-failure` | Concrete repository architecture decision (ADR), issue tracking convention, or local contract that applies repository-wide. | `stage-invariant` |
| `shared-domain-policy` | `domain-failure`, `primary-source`, `standard-contract` | Durable framework contract (e.g., React RFC, TypeScript safety) or documented ecosystem risk. | `export-upstream-proposal`, `create-overlay` |
| `project-policy` | `local-contract`, `architecture-decision`, `local-failure` | Repository-specific domain invariant or component architecture standard. | `create-project-rule`, `create-overlay` |
| `canonical-workflow-skill` | `local-contract`, `primary-source`, `cross-project-failure` | Multi-step interactive procedural workflow. | `export-upstream-proposal`, `retain-as-project-skill` |
| `agent-role-candidate` | `architecture-decision`, `cross-project-failure` | Workload benefiting from isolated tools, context, or parallelism. | `discard`, `export-upstream-proposal` |
| `documentation` | `none`, `local-contract` | Explanatory context, architectural narrative, or historical design rationale. | `retain-documentation` |
| `speculative-guidance` | `none`, `speculative` | Unproven personal preference, premature optimization, or speculative rule without recorded failure evidence. | `discard` |
| `insufficient-evidence` | `none`, `speculative` | Candidate instruction lacks verifiable justification to qualify for prompt inclusion. | `discard` |

---

## Workflow 1: Classify Existing Instructions (`classify-existing`)

Use this workflow to audit hand-written, unmanaged instructions across the repository and convert them into structured classification reports.

### Step 1: Scan Unmanaged Content
Run the deterministic audit scanner to extract all unmanaged prose blocks:
```bash
agent-policy audit [--path "<glob>"]
```
This outputs a validated `audit-output-v1` document containing:
- `scannedFiles`: list of scanned markdown files.
- `unmanagedBlocks`: array of `{ id, sourcePath, sourceSha256, lineRange: { start, end }, content }`.

### Step 2: Apply Rubric Judgment
For each unmanaged block in `unmanagedBlocks`:
1. Analyze the text against the 6-tier classification rubric.
2. Determine the exact `classification`, `rationale`, and `suggestedAction`.
3. If recommending a destination, set `suggestedDestination` (e.g. `tms.issue-tracker`, `docs/architecture.md`, `core.verify-before-completion`).
4. Gather evidence conforming to the tier's required evidence type.

### Step 3: Produce Classification Report
Format findings into a JSON document adhering to `classification-report-v1.schema.json`:
```json
{
  "schemaVersion": "v1",
  "scannedFiles": ["AGENTS.md"],
  "findings": [
    {
      "id": "block-1",
      "sourcePath": "AGENTS.md",
      "sourceSha256": "4b825dc...",
      "lineRange": { "start": 1, "end": 6 },
      "snippet": "## Agent skills\n\n### Issue tracker\n\nIssues and PRDs are tracked as local Markdown files...",
      "classification": "repository-invariant",
      "rationale": "Repository-specific architecture decision for git-native issue tracking that applies repository-wide.",
      "suggestedAction": "stage-invariant",
      "suggestedDestination": "tms.issue-tracker",
      "evidence": {
        "type": "architecture-decision",
        "summary": "Local markdown issue tracker defined in docs/agents/issue-tracker.md",
        "references": ["docs/agents/issue-tracker.md"]
      }
    }
  ]
}
```

### Step 4: Validate Report
Run the deterministic report validator:
```bash
agent-policy validate-report <path/to/report.json>
```
The CLI verifies:
- Report conforms strictly to `classification-report-v1.schema.json`.
- Action and evidence types match classification compatibility rules.
- Target `sourcePath` exists and its current SHA-256 matches `sourceSha256`.
- `snippet` exactly matches lines `[start, end]` of `sourcePath`.

---

## Workflow 2: Repository Invariant Management (`stage-invariant`)

Repository invariants are repository-specific rules that must guide nearly every task in the repository.

### Storage Semantics
- **Rule Body:** Stored as an atomic `rule-v1` Markdown file under `.agent-policy/rules/<namespace>/<rule>.md`.
- **Invariant Registration:** `.agent-policy/invariants.yaml` contains only the ordered list of Rule IDs (`rules: string[]`).
- **Codex Projection:** Rendered into the `## Repository invariants` section of `AGENTS.md`.

### Staging an Invariant Addition
1. Prepare the invariant rule specification YAML/JSON or inline rule spec:
   ```yaml
   id: tms.issue-tracker
   status: active
   strength: required
   override: project-overlay
   enforcement: prompt
   aliases: []
   instruction: Issues and PRDs are tracked as local Markdown files under `.scratch/`.
   rationale: Local markdown files maintain self-contained, auditable task state.
   ```
2. Run the staging command:
   ```bash
   agent-policy stage-invariant --add tms.issue-tracker --spec invariant-spec.yaml --plan /tmp/add-invariant.plan.json
   ```
3. Inspect the generated plan:
   ```bash
   agent-policy diff /tmp/add-invariant.plan.json
   ```
4. Apply the plan transactionally:
   ```bash
   agent-policy apply /tmp/add-invariant.plan.json --yes
   ```

### Staging an Invariant Removal
1. Run the staging command:
   ```bash
   agent-policy stage-invariant --remove tms.issue-tracker --plan /tmp/remove-invariant.plan.json
   ```
2. Inspect and apply:
   ```bash
   agent-policy diff /tmp/remove-invariant.plan.json
   agent-policy apply /tmp/remove-invariant.plan.json --yes
   ```
*(Note: Removing an invariant unregisters it from `invariants.yaml` while preserving the rule file in `.agent-policy/rules/` by default).*

---

## Workflow 3: Project Rules and Overlays (`stage-source`)

Use `stage-source` to stage canonical additions and updates to project-owned rules and overlay directives.

### Staging Project Rules
1. Create a `rule-v1` specification.
2. Stage the change:
   ```bash
   agent-policy stage-source --spec rule-spec.yaml --plan /tmp/stage-rule.plan.json
   ```
3. Review and apply:
   ```bash
   agent-policy diff /tmp/stage-rule.plan.json
   agent-policy apply /tmp/stage-rule.plan.json --yes
   ```

### Staging Overlays
Overlays modify or disable upstream canonical rules for the consumer repository.
```yaml
ruleId: core.minimal-change
operation: addendum
reason: Project requires specific staging steps for database migrations.
content: When altering database schemas, generate corresponding test migrations.
```
Stage with `agent-policy stage-source --spec overlay-spec.yaml --plan /tmp/stage-overlay.plan.json`.

---

## Workflow 4: Export Upstream Proposals (`export-proposal`)

When a rule or workflow pattern is discovered in a consumer repository that is broadly applicable across independent repositories, export it as a portable upstream proposal instead of modifying upstream packages directly.

### Proposal Structure
A proposal conforms to `proposal-v1.schema.json` and records origin provenance:
```yaml
schemaVersion: v1
behavioralRole: shared-core
proposedDestination:
  kind: rule
  targetId: core.verify-diff-boundaries
origin:
  findingId: block-1
  sourcePath: AGENTS.md
  sourceSha256: 4b825dc6394593457a1e0915f0eb5e61a4e2efd9a74c76b97b6e927c348f95c1
  lineRange:
    start: 1
    end: 10
semanticChange:
  summary: Verify git diff boundaries before marking tasks complete
  instruction: Verify that git diff contains only files related to the requested task.
  rationale: Prevents unintended modification of unmanaged files.
ruleMetadata:
  strength: required
  applicability: {}
  override: explicit-task
  enforcement: prompt
  aliases: []
evidence:
  type: cross-project-failure
  summary: Multiple repositories observed accidental modification of root build configs.
  references:
    - Observed accidental modification of root config in multiple frontend projects
proposer:
  repository: paynet/infokiosk/tms-frontend
  context: Discovered during AGENTS.md classification audit
```

### Exporting the Proposal
Run:
```bash
agent-policy export-proposal --spec proposal-spec.json --output proposals/verify-diff-boundaries.yaml
```
The CLI validates the document against `proposal-v1.schema.json` and formats it with standard proposal headers. Proposals are non-runtime artifacts and are never compiled into runtime projections or `policy.lock.json`.

---

## Workflow 5: Upstream Scope Catalog Authoring (`--scope upstream`)

When operating directly inside the `agent-policy-toolkit` source repository (where root `catalog/` and package `@agent-policy/agent-policy-toolkit` exist), use `--scope upstream` to stage changes into the canonical catalog:

```bash
agent-policy stage-source --scope upstream --spec canonical-rule.yaml --plan /tmp/upstream.plan.json
```
The CLI confines modifications strictly to `catalog/rules/`, `catalog/bundles/`, and `skills/`. If executed inside a consumer repository without root `catalog/`, the CLI halts immediately with `NOT_UPSTREAM_REPOSITORY`.
