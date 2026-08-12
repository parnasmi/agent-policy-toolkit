---
id: implementation-design.localized-side-effects
status: active
strength: recommended
applicability: { domains: [implementation-design] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_SIDE_EFFECTS]
---
# Localize side effects

## Instruction

Keep side effects explicit, intentional, and localized to the owning boundary.

## Rationale

Hidden shared mutation makes behavior order-dependent and creates regressions far from the initiating operation.
