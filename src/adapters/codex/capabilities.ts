import type { HarnessCapabilityProfile } from '../types.js'

/** Versioned knowledge of Codex's verified repository-local discovery mechanisms. */
export const codexCapabilities = {
  harness: 'codex',
  adapterKnowledgeVersion: 'codex-2026-08-12',
  support: 'experimental',
  instructionDiscovery: ['AGENTS.md'],
  skillDiscovery: ['.agents/skills/*/SKILL.md'],
  nativeRoles: false,
  isolatedWork: true,
  parallelWork: true,
  toolAccess: 'harness-native',
  scopedInstructions: true,
} as const satisfies HarnessCapabilityProfile
