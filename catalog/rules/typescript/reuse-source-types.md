---
id: typescript.reuse-source-types
status: active
strength: recommended
applicability: { domains: [typescript] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_TYPE_REUSE]
---
# Reuse source types

## Instruction

Reuse or safely derive source-of-truth types instead of duplicating them.

## Rationale

Copied type definitions silently drift from the runtime or domain contract they are meant to represent.
