---
id: react.optimization-restraint
status: active
strength: recommended
applicability: { domains: [react] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_REACT_OPTIMIZATION]
---
# Restrain React optimization

## Instruction

Add React memoization only for a concrete measured or API-driven need.

## Rationale

Unnecessary memoization adds dependency bookkeeping and stale-value risk without proven performance benefit.
