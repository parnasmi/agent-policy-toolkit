---
id: react.event-logic
status: active
strength: recommended
applicability: { domains: [react] }
override: project-overlay-or-explicit-task
enforcement: prompt
aliases: [RULE_EVENT_LOGIC]
---
# Keep event logic in events

## Instruction

Keep logic caused by a user action in the corresponding event handler.

## Rationale

Routing action-driven behavior through effects disconnects cause from execution and introduces avoidable timing races.
