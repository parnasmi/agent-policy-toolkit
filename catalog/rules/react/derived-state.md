---
id: react.derived-state
status: active
strength: recommended
applicability: { domains: [react] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_DERIVED_STATE]
---
# Derive state

## Instruction

Derive values from existing props, state, server data, or URL state instead of synchronizing duplicate state.

## Rationale

Duplicated state can fall out of sync and display values that no longer match their source.
