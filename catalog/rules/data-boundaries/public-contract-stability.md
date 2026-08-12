---
id: data-boundaries.public-contract-stability
status: active
strength: required
applicability: { domains: [data-boundaries] }
override: explicit-task
enforcement: prompt
aliases: [RULE_API_STABILITY]
---
# Preserve public contracts

## Instruction

Preserve public fields, shapes, signatures, errors, and route behavior unless the task explicitly requires a contract change.

## Rationale

Unplanned contract changes break consumers that cannot coordinate with the implementation change.
