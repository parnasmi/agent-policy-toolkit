---
id: core.minimal-change
status: active
strength: required
applicability: { domains: [core] }
override: explicit-task
enforcement: prompt
aliases: [RULE_MINIMAL_CHANGE, RULE_NO_OPPORTUNISTIC_REFACTOR]
---
# Make minimal changes

## Instruction

Make the smallest correct change and exclude unrelated cleanup.

## Rationale

Expanded diffs obscure intent, increase review surface, and expose unrelated behavior to regression risk.
