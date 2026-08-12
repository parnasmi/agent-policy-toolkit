---
id: react.unidirectional-data-flow
status: active
strength: required
applicability: { domains: [react] }
override: explicit-task
enforcement: prompt
aliases: [RULE_REACT_DATA_FLOW]
---
# Preserve unidirectional data flow

## Instruction

Keep state in React's unidirectional data flow and as close as practical to its consumers.

## Rationale

Unnecessary global or duplicated state creates competing owners and inconsistent render outcomes.
