---
id: react.component-responsibility
status: active
strength: recommended
applicability: { domains: [react] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_COMPONENT_RESPONSIBILITY]
---
# Keep component responsibility clear

## Instruction

Keep each component focused, extracting only when responsibility, reuse, testing, or readability materially improves.

## Rationale

Both overloaded components and needless fragmentation obscure ownership and make behavior harder to trace.
