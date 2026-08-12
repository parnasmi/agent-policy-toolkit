---
id: async-control-flow.user-visible-states
status: active
strength: recommended
applicability: { domains: [async-control-flow] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_ASYNC_UI]
---
# Represent asynchronous states

## Instruction

Represent the user-visible initial, loading, success, empty, error, and retry states that the interaction requires.

## Rationale

Missing asynchronous states strand users without feedback or a recovery path when work is delayed or fails.
