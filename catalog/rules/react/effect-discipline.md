---
id: react.effect-discipline
status: active
strength: required
applicability: { domains: [react] }
override: explicit-task
enforcement: prompt
aliases: [RULE_EFFECT_DISCIPLINE]
---
# Use effects for synchronization

## Instruction

Use effects only to synchronize React with external systems, with necessary cleanup.

## Rationale

Application logic in effects creates feedback loops, stale synchronization, leaked subscriptions, and timing-dependent behavior.
