---
id: async-control-flow.explicit-failure-behavior
status: active
strength: required
applicability: { domains: [async-control-flow] }
override: explicit-task
enforcement: prompt
aliases: [RULE_ERROR_HANDLING]
---
# Define failure behavior

## Instruction

Define deliberate behavior for relevant failure modes without silently swallowing errors or exposing sensitive details.

## Rationale

Implicit failure paths leave operations in unknown states and can leak internal details or conceal data loss.
