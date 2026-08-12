---
id: implementation-design.dependency-restraint
status: active
strength: recommended
applicability: { domains: [implementation-design] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_DEPENDENCY_RESTRAINT]
---
# Restrain dependencies

## Instruction

Add a dependency only when existing platform and project capabilities cannot provide a clearer, safer solution.

## Rationale

Every new dependency expands supply-chain, compatibility, maintenance, and bundle-size risk.
