---
id: implementation-design.simplicity
status: active
strength: recommended
applicability: { domains: [implementation-design] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_SIMPLICITY]
---
# Prefer simplicity

## Instruction

Prefer the simplest straightforward implementation that fully satisfies the requirement.

## Rationale

Clever or compressed control flow obscures edge cases and raises the cost of safe maintenance.
