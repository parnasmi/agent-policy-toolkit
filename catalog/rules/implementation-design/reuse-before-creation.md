---
id: implementation-design.reuse-before-creation
status: active
strength: recommended
applicability: { domains: [implementation-design] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_REUSE_EXISTING]
---
# Reuse before creating

## Instruction

Inspect and reuse suitable project primitives before creating new ones.

## Rationale

Duplicate primitives drift in behavior and force maintainers to reconcile competing project conventions.
