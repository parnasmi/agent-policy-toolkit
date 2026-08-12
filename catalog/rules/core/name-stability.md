---
id: core.name-stability
status: active
strength: required
applicability: { domains: [core] }
override: explicit-task
enforcement: prompt
aliases: [RULE_NAME_STABILITY]
---
# Preserve names

## Instruction

Preserve existing identifiers and public names unless the task or correctness requires a rename.

## Rationale

Unnecessary renames can break imports, integrations, and downstream consumers while imposing migration cost.
