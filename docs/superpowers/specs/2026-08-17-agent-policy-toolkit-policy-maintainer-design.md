# Agent Policy Toolkit — Slice B Design: `policy-maintainer`, Classification Audit, and Upstream Proposals

**Status:** Proposed design spec (approved for implementation planning)  
**Date:** 2026-08-17  
**Decision:** [ADR-0010](../../adr/0010-adopt-a-layered-agent-policy-toolkit.md)  
**Parent Design:** [2026-08-12 Agent Policy Toolkit Design](2026-08-12-agent-policy-toolkit-design.md)  

---

## 1. Executive Summary & Purpose

Slice B delivers the first **Canonical Workflow Skill** of the Agent Policy Toolkit: **`policy-maintainer`**.

This slice enables AI coding agents and human engineers to:
1. Audit existing, unmanaged guidance and instructions in a codebase (`classify-existing`).
2. Classify candidate instructions using a strict **enforcement-first** rubric.
3. Manage project-level canonical policy sources (`.agent-policy/rules/`, `.agent-policy/invariants.yaml`, `.agent-policy/overlays/`) via deterministic, immutable Change Plans.
4. Generate portable, schema-validated **Upstream Proposals** from consumer projects without mutating external repositories or installed packages.
5. Author and maintain upstream catalog sources when operating inside the upstream toolkit repository (`--scope upstream`).

Slice B maintains the fundamental architectural invariant established in Slice A:
> **LLM judgment may propose canonical intent; only deterministic code validates, plans, diffs, and applies it.**

---

## 2. Architectural Boundaries & Non-Goals

### 2.1 Preserved Architectural Contracts

1. **Judgment vs. Deterministic Mutation:**
   * `policy-maintainer` owns classification, wording judgment, rationale, and recommending the appropriate policy representation.
   * Deterministic CLI modules own schema validation, precondition checking, Change Plan generation, diff formatting, transactional application, and rollback.
   * `policy-maintainer` never directly writes to `.agent-policy/` or Managed Artifacts.
2. **Explicit Invocation:**
   * `policy-maintainer` is a Canonical Workflow Skill and requires explicit invocation (e.g. `$policy-maintainer` or an explicit user request). It does not activate implicitly on arbitrary code changes.
3. **Canonical Skill vs. Projection Ownership:**
   * **Upstream Canonical Skills:** Authored under `skills/<skill-name>/SKILL.md`.
   * **Project Canonical Skills:** Authored under `.agent-policy/skills/<skill-name>/SKILL.md`.
   * **Managed Harness Projections:** Emitted to `.agents/skills/<skill-name>/SKILL.md` (or harness-native discovery paths) with generated ownership headers and checksum verification.
4. **Repository Invariant Storage Semantics:**
   * `.agent-policy/invariants.yaml` contains only an ordered selection of atomic project Rule IDs (`rules: [ "namespace.rule-id", ... ]`). It contains **no free-form invariant prose**.
   * Invariant rules are authored as atomic Markdown files under `.agent-policy/rules/<namespace>/<rule-name>.md` adhering to `rule-v1`.
   * Adding an invariant creates/updates the atomic project rule under `.agent-policy/rules/` AND adds its Rule ID to `.agent-policy/invariants.yaml` within the same atomic Change Plan.
   * Removing an invariant removes the Rule ID from `.agent-policy/invariants.yaml` by default, preserving the underlying atomic project rule file under `.agent-policy/rules/` unless rule deletion is explicitly requested.
5. **Change Plan Immutability & Scope Confinement:**
   * Staging commands (`agent-policy stage-source`, `agent-policy stage-invariant`) create a **brand-new, self-contained, hash-bound Change Plan** from spec inputs.
   * A Change Plan is immutable: planning commands never mutate, append to, or re-hash an existing Change Plan in place.
   * `--scope project` (default) confines canonical source mutations strictly to `.agent-policy/`.
   * `--scope upstream` is valid only inside an Agent Policy Toolkit repository and confines canonical source mutations to `catalog/rules/`, `catalog/bundles/`, `catalog/evidence/`, and `skills/`.
6. **Non-Runtime Upstream Proposals:**
   * Upstream proposals are exported non-runtime artifacts (written to `--output <file>` or `.scratch/`).
   * They are not canonical project configuration, do not participate in `policy.lock.json`, and do not affect runtime projections.
   * In an upstream repository, proposals serve as structured inputs to maintainer judgment, flowing through standard Change Plan compilation before touching `catalog/`.
7. **Preservation of Existing Guidance:**
   * `classify-existing` scans unmanaged regions in `AGENTS.md` and repository documentation, producing an audit report without touching or deleting any files.
   * Migration occurs only after explicit review and approval through the standard Change Plan lifecycle.

---

## 3. Slice B Action Family Scope Matrix

| Action Family | Slice B Status | Execution Contract / Representation |
| :--- | :--- | :--- |
| `classify` | **Implemented** | Interactive prompt-based evaluation of candidate instructions via `policy-maintainer`. |
| `classify-existing` | **Implemented** | CLI `audit` extracts unmanaged blocks; `policy-maintainer` produces validated `classification-report-v1`. |
| `rule create\|revise\|deprecate` | **Implemented (Project)** | CLI `stage-source --scope project` stages atomic rules in `.agent-policy/rules/<namespace>/<rule>.md`. |
| `invariants add\|remove` | **Implemented (Project)** | CLI `stage-invariant` atomically updates `.agent-policy/invariants.yaml` and `.agent-policy/rules/` (selection removal preserves rule by default). |
| `overlay create\|revise` | **Implemented (Project)** | CLI `stage-source --scope project` stages overlay directives in `.agent-policy/overlays/<name>.yaml`. |
| `proposal export` | **Implemented (Consumer)** | CLI `export-proposal` validates and writes portable `proposal-v1` artifact. |
| `catalog authoring` | **Implemented (`--scope upstream`)** | `stage-source --scope upstream` stages modifications to upstream `catalog/rules/`, `catalog/bundles/`, `catalog/evidence/`. |
| `mechanical-control` | **Classification Destination Only** | Recommends manual tool/linter implementation (`recommend-mechanical-control` / `discard`). No runtime lifecycle in Slice B. |
| `shared-core candidate` | **Proposal Destination Only** | Exported via `proposal-v1` with required `cross-project-failure` evidence. |
| `shared-domain-policy candidate` | **Proposal Destination Only** | Exported via `proposal-v1` with required domain/primary-source evidence. |
| `agent-role candidate` | **Classification Destination Only** | Classified via rubric; exported via `proposal-v1`. Role infrastructure is deferred to Slice C. |
| `project workflow skill` | **Classification Destination Only** | Project-specific workflow skills retain existing hand-authored files (`retain-as-project-skill` / `discard`). Skill authoring workflow is deferred. |
| `documentation / speculative` | **Classification Destination Only** | Retained as ordinary markdown docs (`retain-documentation`) or discarded (`discard`). |
| `bundle create\|revise` | **Deferred** | Project-level bundles deferred. Projects use atomic project rules and domain bundles in Slice B. |
| `skill create\|revise` (Project) | **Deferred** | Custom project workflow skill generation deferred. Slice B delivers the shared upstream `policy-maintainer` skill. |
| `role create\|revise` | **Deferred** | Agent Role infrastructure and `DocsExplorer` deferred to Slice C. |
| `target add\|remove` / `uninstall` | **Reused Existing CLI** | Reuses existing Slice A CLI commands (`agent-policy init`, `agent-policy remove`). |
| `update` | **Deferred** | Dedicated update command deferred to later lifecycle slice; updating uses re-init / check / apply workflows. |

---

## 4. Enforcement-First Classification & Evidence Rubric

`policy-maintainer` evaluates every candidate instruction in this strict order:

```text
1. Can a reliable tool enforce the requirement?
   ├── YES ──► Mechanical Control (Lint / Test / Type / Hook / CI) -> Recommend mechanical control; omit from prompt
   └── NO  ──▼
2. Must it guide nearly every task in the repository?
   ├── Technology/Project-Independent? ──► Shared Core Candidate (e.g., core.*) -> Export upstream proposal
   └── Repository Architecture Specific? ──► Repository Invariant -> Stage in .agent-policy/rules/ & invariants.yaml
   └── NO  ──▼
3. Does it apply only to a specific technology or project area?
   ├── Portable Framework / Tool Contract? ──► Shared Domain Policy Candidate -> Export upstream proposal or overlay
   └── Repository-Specific Domain Rule? ──► Project Policy -> Stage in .agent-policy/rules/
   └── NO  ──▼
4. Is it a multi-step interactive procedure?
   └── YES ──► Canonical Workflow Skill (Shared: skills/ | Project: .agent-policy/skills/)
   └── NO  ──▼
5. Does it require isolated context, specialized tools, or parallelism?
   └── YES ──► Agent Role Candidate (Classification target)
   └── NO  ──▼
6. Is it explanatory context or architectural narrative?
   └── YES ──► Ordinary Documentation (docs/*.md) -> Reject as policy; retain as documentation
```

### Evidence Standards by Category

| Classification Tier | Required Evidence Type | Rationale & Sufficiency Contract |
| :--- | :--- | :--- |
| `shared-core` | `cross-project-failure` | Recorded recurring failure across independent codebases, independent of tech stack (without an arbitrary fixed project-count threshold). |
| `shared-domain-policy` | `domain-failure`, `primary-source`, `standard-contract` | Durable framework contract (e.g. React RFC, Next.js contract) or documented domain risk. |
| `repository-invariant` | `local-contract`, `architecture-decision`, `local-failure` | Concrete repository architecture decision (ADR), issue tracking convention, or local contract. |
| `project-policy` | `local-contract`, `architecture-decision`, `local-failure` | Repository-specific domain invariant or component architecture standard. |
| `canonical-workflow-skill` | `local-contract`, `primary-source`, `cross-project-failure` | Multi-step interactive procedural workflow. |
| `agent-role-candidate` | `architecture-decision`, `cross-project-failure` | Workload benefiting from isolated tools, context, or parallelism. |
| `documentation` / `speculative-guidance` | `none`, `speculative` | Explanatory text, narrative, or unproven preferences rejected as prompt policy. |

---

## 5. Schemas and Data Models

### 5.1 `audit-output-v1.schema.json` (Deterministic Audit Scanner Output)

Produced by `agent-policy audit` without LLM judgment:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "audit-output-v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "scannedFiles", "unmanagedBlocks"],
  "properties": {
    "schemaVersion": { "const": "v1" },
    "scannedFiles": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "unmanagedBlocks": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "sourcePath", "sourceSha256", "lineRange", "content"],
        "properties": {
          "id": { "type": "string", "pattern": "^[A-Za-z0-9_-]+$" },
          "sourcePath": { "type": "string" },
          "sourceSha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "lineRange": {
            "type": "object",
            "additionalProperties": false,
            "required": ["start", "end"],
            "properties": {
              "start": { "type": "integer", "minimum": 1 },
              "end": { "type": "integer", "minimum": 1 }
            }
          },
          "content": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

### 5.2 `classification-report-v1.schema.json` (Maintainer Judgment Output)

Produced by `policy-maintainer` and validated deterministically by the CLI:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "classification-report-v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "scannedFiles", "findings"],
  "properties": {
    "schemaVersion": { "const": "v1" },
    "scannedFiles": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true
    },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "sourcePath",
          "sourceSha256",
          "lineRange",
          "snippet",
          "classification",
          "rationale",
          "suggestedAction",
          "evidence"
        ],
        "properties": {
          "id": { "type": "string", "pattern": "^[A-Za-z0-9_-]+$" },
          "sourcePath": { "type": "string" },
          "sourceSha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "lineRange": {
            "type": "object",
            "additionalProperties": false,
            "required": ["start", "end"],
            "properties": {
              "start": { "type": "integer", "minimum": 1 },
              "end": { "type": "integer", "minimum": 1 }
            }
          },
          "snippet": { "type": "string", "minLength": 1 },
          "classification": {
            "enum": [
              "mechanical-control",
              "shared-core",
              "repository-invariant",
              "shared-domain-policy",
              "project-policy",
              "canonical-workflow-skill",
              "agent-role-candidate",
              "documentation",
              "speculative-guidance",
              "insufficient-evidence"
            ]
          },
          "rationale": { "type": "string", "minLength": 1 },
          "suggestedAction": {
            "enum": [
              "recommend-mechanical-control",
              "stage-invariant",
              "create-project-rule",
              "create-overlay",
              "export-upstream-proposal",
              "retain-as-project-skill",
              "retain-documentation",
              "discard"
            ]
          },
          "suggestedDestination": { "type": "string" },
          "evidence": {
            "type": "object",
            "additionalProperties": false,
            "required": ["type", "summary"],
            "properties": {
              "type": {
                "enum": [
                  "cross-project-failure",
                  "domain-failure",
                  "primary-source",
                  "standard-contract",
                  "local-contract",
                  "architecture-decision",
                  "local-failure",
                  "speculative",
                  "none"
                ]
              },
              "summary": { "type": "string", "minLength": 1 },
              "references": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        },
        "allOf": [
          {
            "if": { "properties": { "classification": { "const": "mechanical-control" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["recommend-mechanical-control", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["local-contract", "standard-contract", "primary-source", "domain-failure", "cross-project-failure"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "shared-core" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["export-upstream-proposal", "discard"] },
                "evidence": { "properties": { "type": { "const": "cross-project-failure" } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "repository-invariant" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["stage-invariant", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["local-contract", "architecture-decision", "local-failure"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "shared-domain-policy" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["export-upstream-proposal", "create-overlay", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["domain-failure", "primary-source", "standard-contract"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "project-policy" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["create-project-rule", "create-overlay", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["local-contract", "architecture-decision", "local-failure"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "canonical-workflow-skill" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["export-upstream-proposal", "retain-as-project-skill", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["local-contract", "primary-source", "cross-project-failure"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "const": "agent-role-candidate" } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["export-upstream-proposal", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["architecture-decision", "cross-project-failure"] } } }
              }
            }
          },
          {
            "if": { "properties": { "classification": { "enum": ["documentation", "speculative-guidance", "insufficient-evidence"] } } },
            "then": {
              "properties": {
                "suggestedAction": { "enum": ["retain-documentation", "discard"] },
                "evidence": { "properties": { "type": { "enum": ["speculative", "none", "local-contract", "architecture-decision"] } } }
              }
            }
          }
        ]
      }
    }
  }
}
```

### 5.3 `proposal-v1.schema.json` (Generalized Portable Upstream Proposal)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "proposal-v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "behavioralRole",
    "proposedDestination",
    "semanticChange",
    "evidence",
    "proposer"
  ],
  "properties": {
    "schemaVersion": { "const": "v1" },
    "origin": {
      "type": "object",
      "additionalProperties": false,
      "required": ["findingId", "sourcePath", "sourceSha256", "lineRange"],
      "properties": {
        "findingId": { "type": "string" },
        "sourcePath": { "type": "string" },
        "sourceSha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
        "lineRange": {
          "type": "object",
          "additionalProperties": false,
          "required": ["start", "end"],
          "properties": {
            "start": { "type": "integer", "minimum": 1 },
            "end": { "type": "integer", "minimum": 1 }
          }
        }
      }
    },
    "behavioralRole": {
      "enum": [
        "mechanical-control",
        "shared-core",
        "shared-domain-policy",
        "canonical-workflow-skill",
        "agent-role-candidate",
        "shared-documentation"
      ]
    },
    "proposedDestination": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": {
          "enum": ["rule", "bundle", "skill", "role", "mechanical-control", "documentation"]
        },
        "targetId": { "type": "string" },
        "targetBundle": { "type": "string" }
      }
    },
    "semanticChange": {
      "type": "object",
      "additionalProperties": false,
      "required": ["summary", "rationale"],
      "properties": {
        "summary": { "type": "string" },
        "instruction": { "type": "string" },
        "rationale": { "type": "string" },
        "exceptions": { "type": "string" },
        "examples": { "type": "string" },
        "verification": { "type": "string" }
      }
    },
    "ruleMetadata": {
      "type": "object",
      "additionalProperties": false,
      "required": ["strength", "applicability", "override", "enforcement"],
      "properties": {
        "strength": { "enum": ["required", "recommended"] },
        "applicability": { "type": "object", "additionalProperties": true },
        "override": {
          "enum": [
            "forbidden",
            "project-overlay",
            "explicit-task",
            "project-overlay-or-explicit-task"
          ]
        },
        "enforcement": { "enum": ["prompt", "mechanical", "hybrid", "documentation"] },
        "aliases": { "type": "array", "items": { "type": "string" } }
      }
    },
    "evidence": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "summary"],
      "properties": {
        "type": {
          "enum": [
            "cross-project-failure",
            "domain-failure",
            "primary-source",
            "standard-contract",
            "speculative"
          ]
        },
        "summary": { "type": "string" },
        "references": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "proposer": {
      "type": "object",
      "additionalProperties": false,
      "required": ["context"],
      "properties": {
        "repository": { "type": "string" },
        "context": { "type": "string" }
      }
    }
  },
  "allOf": [
    {
      "if": { "properties": { "behavioralRole": { "const": "shared-core" } } },
      "then": {
        "properties": {
          "proposedDestination": { "properties": { "kind": { "const": "rule" } } },
          "evidence": { "properties": { "type": { "const": "cross-project-failure" } } }
        }
      }
    },
    {
      "if": { "properties": { "behavioralRole": { "const": "shared-domain-policy" } } },
      "then": {
        "properties": {
          "proposedDestination": { "properties": { "kind": { "enum": ["rule", "bundle"] } } },
          "evidence": { "properties": { "type": { "enum": ["domain-failure", "primary-source", "standard-contract"] } } }
        }
      }
    },
    {
      "if": { "properties": { "behavioralRole": { "const": "canonical-workflow-skill" } } },
      "then": { "properties": { "proposedDestination": { "properties": { "kind": { "const": "skill" } } } } }
    },
    {
      "if": { "properties": { "behavioralRole": { "const": "agent-role-candidate" } } },
      "then": { "properties": { "proposedDestination": { "properties": { "kind": { "const": "role" } } } } }
    },
    {
      "if": { "properties": { "behavioralRole": { "const": "mechanical-control" } } },
      "then": { "properties": { "proposedDestination": { "properties": { "kind": { "const": "mechanical-control" } } } } }
    },
    {
      "if": { "properties": { "behavioralRole": { "const": "shared-documentation" } } },
      "then": { "properties": { "proposedDestination": { "properties": { "kind": { "const": "documentation" } } } } }
    },
    {
      "if": { "properties": { "proposedDestination": { "properties": { "kind": { "const": "rule" } } } } },
      "then": {
        "required": ["ruleMetadata"],
        "properties": {
          "semanticChange": { "required": ["instruction"] }
        }
      }
    }
  ]
}
```

---

## 6. Canonical Workflow Skill: `policy-maintainer`

### 6.1 Skill Packaging & Distribution
* **Canonical Upstream Source:** `skills/policy-maintainer/SKILL.md`.
* **Codex Adapter Projection:** Projected to `.agents/skills/policy-maintainer/SKILL.md` with standard generated ownership headers and hash integrity checks.
* **Harness Activation:** Explicit invocation only (`description` instructs agents to load only on explicit maintainer requests).

### 6.2 Skill Structure
```markdown
---
name: policy-maintainer
description: Maintain and audit AI coding-agent policy, audit existing instructions, stage project rules/invariants/overlays, and export upstream proposals. Explicit invocation only.
---

<!-- Generated by @agent-policy/agent-policy-toolkit ... -->

# policy-maintainer

## Mission
Maintain, audit, and evolve AI coding policy while strictly preserving deterministic change safety and enforcement-first classification.

## Capabilities
1. classify-existing: Audit unmanaged guidance and output classification reports.
2. stage-invariant: Create/update project rules and update .agent-policy/invariants.yaml.
3. stage-source: Manage project rules and overlay directives (or upstream catalog when --scope upstream).
4. export-proposal: Export validated upstream proposal documents.
```

---

## 7. Deterministic CLI Pipeline & Subcommands

### 7.1 `agent-policy audit`
* **Purpose:** Scans codebase for unmanaged instructions.
* **Ownership Exclusion Filter:**
  * Skips bounded Managed Regions (`<!-- agent-policy:start -->` ... `<!-- agent-policy:end -->`).
  * Skips fully generated files (`generatedOwnership(content) === true`).
  * Skips canonical `.agent-policy/` sources.
* **Scanned Paths:**
  * By default: `AGENTS.md` (unmanaged lines outside managed regions).
  * Optional: explicitly specified paths or globs via `--path <glob>` (e.g. `--path "docs/agents/*.md"`).
* **Output:** Validated `audit-output-v1` document containing extracted text blocks, exact 1-indexed line spans, and `sourceSha256` digests.

### 7.2 `agent-policy validate-report`
* **Purpose:** Validates a `classification-report-v1` file produced by maintainer judgment.
* **Deterministic Checks:**
  1. Validates against `classification-report-v1.schema.json` (including action and evidence compatibility).
  2. Verifies that every `sourcePath` exists and its current SHA-256 matches `sourceSha256`.
  3. Verifies that `snippet` exactly matches the content slice of `sourcePath` at `lineRange`.

### 7.3 `agent-policy stage-source` & `agent-policy stage-invariant`
* **Purpose:** Generates a fresh, immutable `ChangePlan` staging canonical changes into project sources (or upstream catalog when scoped).
* **Usage:**
  * `agent-policy stage-source [--scope project|upstream] --spec <spec.yaml|json> --plan <output-plan.json>`
  * `agent-policy stage-invariant --add <rule-id> [--spec <rule-spec.yaml|json>] --plan <output-plan.json>`
  * `agent-policy stage-invariant --remove <rule-id> --plan <output-plan.json>`
* **Behavior:**
  * Loads existing project policy and catalog in staging.
  * Validates proposed rule/overlay against `rule-v1` / `overlay-v1` and scope path confinement (`.agent-policy/` for project scope, `catalog/` + `skills/` for upstream scope).
  * For `stage-invariant --add`: stages creation of `.agent-policy/rules/<namespace>/<rule>.md` AND updates `.agent-policy/invariants.yaml` with the Rule ID.
  * For `stage-invariant --remove`: removes the Rule ID from `.agent-policy/invariants.yaml` (preserving the rule file by default).
  * Emits a fresh `ChangePlan` containing `SourceChange` entries and regenerated virtual projections.

### 7.4 `agent-policy export-proposal`
* **Purpose:** Exports a portable, schema-validated `proposal-v1` YAML document.
* **Usage:** `agent-policy export-proposal --spec <proposal.json|yaml> --output <proposal-file.yaml>`
* **Behavior:** Validates against `proposal-v1.schema.json` and writes self-contained YAML with origin provenance.

---

## 8. Verification Strategy

1. **Deterministic Unit & Schema Tests:**
   * Schema validation tests for `audit-output-v1`, `classification-report-v1`, `proposal-v1`.
   * Negative tests for illegal classification/action/evidence combinations.
   * Snippet-matching and line-range boundary validation tests.
2. **Deterministic Contract & CLI Tests:**
   * Audit scanner test verifying exclusion of managed regions, generated files, and `.agent-policy/`.
   * Immutable Change Plan creation test for `stage-source` and `stage-invariant`.
   * Invariant removal test verifying selection removal without rule deletion.
   * Compiler test verifying projection of `skills/policy-maintainer/SKILL.md` to `.agents/skills/policy-maintainer/SKILL.md`.
   * Scope gating test ensuring `--scope upstream` fails in consumer repositories.
3. **Model Evaluation Boundary:**
   * Deterministic tests verify schemas, CLI contracts, and projection fidelity.
   * Model-based evaluation suites independently verify prompt classification accuracy on real-world policy texts.

---

## 9. Dogfood Execution & Slice B Completion Gate

### 9.1 `tms-frontend` Dogfood Scenario
1. **Target:**
   * Unmanaged sections in `AGENTS.md` (Issue Tracker conventions, Triage Labels, Domain Documentation layout).
   * Known preserved hand-authored skills (`applying-tms-patterns`, `implementing-tms-modernization-issue`).
2. **Execution Flow:**
   * Run `policy-maintainer classify-existing`.
   * CLI `audit` extracts unmanaged blocks from `AGENTS.md` and hand-authored skills.
   * `policy-maintainer` produces `classification-report-v1`:
     * Classifies Issue Tracker conventions $\to$ `repository-invariant` (action: `stage-invariant`).
     * Classifies Triage Labels $\to$ `repository-invariant` (action: `stage-invariant`).
     * Classifies `applying-tms-patterns` candidates $\to$ `shared-domain-policy` (action: `export-upstream-proposal`).
   * Dev reviews report and approves invariant migration.
   * CLI `stage-invariant` stages `.agent-policy/rules/tms/issue-tracker.md`, `.agent-policy/rules/tms/triage-labels.md`, and updates `.agent-policy/invariants.yaml` in an external `ChangePlan`.
   * Dev runs `agent-policy diff` and `agent-policy apply`.
   * CLI `export-proposal` exports candidate proposal from `applying-tms-patterns` to `.scratch/proposals/tms-pattern-proposal.yaml`.
   * `AGENTS.md` managed region updates with compiled repository invariants; surrounding unmanaged prose remains byte-for-byte identical.

### 9.2 Slice B Completion Gate Checklist

To close Slice B, all of the following criteria must be satisfied and recorded:

1. [ ] **Upstream Verification:** Full `pnpm check` (typecheck, 100% passing tests across unit/contract/cli, production build) passes cleanly in `agent-policy-toolkit`.
2. [ ] **Slice B Prerelease Publication:** Build and pack exact prerelease (e.g. `@agent-policy/agent-policy-toolkit@0.2.0-alpha.0`) with verified checksum and package contents.
3. [ ] **Consumer Installation:** Pin exact prerelease in `tms-frontend` and update `policy.lock.json`.
4. [ ] **Real Dogfood Audit:** Execute `policy-maintainer classify-existing` against `tms-frontend` unmanaged `AGENTS.md` and legacy hand-authored skills.
5. [ ] **Approved Invariant Migration:** Stage and transactionally apply atomic rules under `.agent-policy/rules/` and update `.agent-policy/invariants.yaml` via Change Plan.
6. [ ] **Upstream Proposal Export:** Export validated portable `proposal-v1` artifact from dogfood findings.
7. [ ] **Unmanaged Preservation:** Verify all non-migrated `AGENTS.md` prose is preserved byte-for-byte.
8. [ ] **Drift & Reproducibility:** `agent-policy check` succeeds with zero drift.
9. [ ] **Completion Record:** Publish `docs/slice-b-completion-record.md` documenting commit hashes, tarball SHA, and dogfood evidence.
