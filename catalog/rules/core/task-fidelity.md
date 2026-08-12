---
id: core.task-fidelity
status: active
strength: required
applicability: { domains: [core] }
override: forbidden
enforcement: prompt
aliases: [RULE_TASK_FIDELITY]
---
# Honor the task

## Instruction

Implement the explicit task without speculative scope expansion.

## Rationale

Speculative work changes unrequested behavior and makes acceptance against the stated requirement impossible to judge.
