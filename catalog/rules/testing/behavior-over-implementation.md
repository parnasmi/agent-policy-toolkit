---
id: testing.behavior-over-implementation
status: active
strength: recommended
applicability: { domains: [testing] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_TEST_BEHAVIOR]
---
# Test behavior

## Instruction

Test observable behavior and important contracts instead of private implementation details.

## Rationale

Implementation-coupled tests break during safe refactoring while failing to protect the behavior consumers depend on.
