---
id: core.architecture-consistency
status: active
strength: required
applicability: { domains: [core] }
override: explicit-task
enforcement: prompt
aliases: [RULE_ARCHITECTURE_CONSISTENCY]
---
# Respect existing architecture

## Instruction

Respect the existing technology-independent architecture; keep concrete repository contracts in project policy.

## Rationale

Embedding concrete architecture assumptions in shared policy can violate repository boundaries and cause cross-layer regressions.
