---
id: react.hook-safety
status: active
strength: required
applicability: { domains: [react] }
override: explicit-task
enforcement: prompt
aliases: [RULE_HOOK_SAFETY]
---
# Preserve hook safety

## Instruction

Call hooks unconditionally at the React level with correct dependencies and current closures.

## Rationale

Broken hook ordering and stale dependencies can associate state incorrectly or execute logic with obsolete values.
