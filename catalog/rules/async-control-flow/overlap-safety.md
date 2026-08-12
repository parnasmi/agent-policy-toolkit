---
id: async-control-flow.overlap-safety
status: active
strength: required
applicability: { domains: [async-control-flow] }
override: explicit-task
enforcement: prompt
aliases: [RULE_ASYNC_SAFETY]
---
# Make overlap safe

## Instruction

Make overlapping asynchronous operations safe against cancellation, stale results, unmounting, duplication, and out-of-order completion.

## Rationale

Uncontrolled overlap allows older work to overwrite current state or update resources that no longer exist.
