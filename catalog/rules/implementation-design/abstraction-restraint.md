---
id: implementation-design.abstraction-restraint
status: active
strength: recommended
applicability: { domains: [implementation-design] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_ABSTRACTION_RESTRAINT]
---
# Restrain abstraction

## Instruction

Introduce an abstraction only for a concrete repeated concept.

## Rationale

Speculative abstractions add indirection and couple unrelated cases before their shared contract is understood.
