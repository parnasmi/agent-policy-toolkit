---
id: testing.change-driven-coverage
status: active
strength: recommended
applicability: { domains: [testing] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_TEST_CHANGES]
---
# Cover meaningful changes

## Instruction

Add risk-proportionate tests for meaningful behavior changes, including relevant success, edge, and failure paths.

## Rationale

Changed behavior without targeted coverage can regress silently, while coverage-only tests provide false confidence.
