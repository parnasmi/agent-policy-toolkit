---
id: data-boundaries.runtime-validation
status: active
strength: recommended
applicability: { domains: [data-boundaries] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_RUNTIME_VALIDATION]
---
# Validate runtime input

## Instruction

Validate untrusted runtime data at the boundary where it enters the application.

## Rationale

Static types disappear at runtime and cannot prevent malformed external values from violating internal assumptions.
