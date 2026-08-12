---
id: core.verify-before-completion
status: active
strength: required
applicability: { domains: [core] }
override: explicit-task
enforcement: prompt
aliases: [RULE_VERIFICATION, RULE_DIFF_REVIEW]
---
# Verify before completion

## Instruction

Inspect the final diff and report only verification that actually ran successfully.

## Rationale

Unchecked diffs and unexecuted verification claims conceal defects and mislead downstream reviewers about delivery risk.
