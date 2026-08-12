---
id: core.inspect-before-change
status: active
strength: required
applicability: { domains: [core] }
override: explicit-task
enforcement: prompt
aliases: [RULE_INSPECT_BEFORE_CHANGE, RULE_NO_GUESSING, RULE_ASSUMPTIONS]
---
# Inspect before changing

## Instruction

Inspect discoverable code, consumers, types, tests, and configuration before acting; label only genuinely unverifiable assumptions.

## Rationale

Changes made without available evidence routinely miss consumers, contracts, and configuration and produce avoidable regressions.
