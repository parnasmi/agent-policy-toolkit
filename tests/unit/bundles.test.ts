import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PolicyError } from '../../src/domain/diagnostics.js'

const expectedBundles = {
  'async-control-flow': {
    description: 'Async operation overlap, explicit failure behavior, and user-visible states.',
    members: [
      'async-control-flow.overlap-safety',
      'async-control-flow.explicit-failure-behavior',
      'async-control-flow.user-visible-states',
    ],
  },
  core: {
    description:
      'Always-on technology-independent policy for task fidelity, minimal changes, stable names, style, inspection, architecture, and verification.',
    members: [
      'core.task-fidelity',
      'core.minimal-change',
      'core.name-stability',
      'core.style-consistency',
      'core.inspect-before-change',
      'core.architecture-consistency',
      'core.verify-before-completion',
    ],
  },
  'data-boundaries': {
    description: 'Public contracts, external-data normalization, and runtime validation at untrusted boundaries.',
    members: [
      'data-boundaries.public-contract-stability',
      'data-boundaries.normalize-external-data',
      'data-boundaries.runtime-validation',
    ],
  },
  'implementation-design': {
    description:
      'Structural implementation choices: reuse, restrained abstractions and dependencies, simple solutions, and localized side effects.',
    members: [
      'implementation-design.reuse-before-creation',
      'implementation-design.abstraction-restraint',
      'implementation-design.simplicity',
      'implementation-design.dependency-restraint',
      'implementation-design.localized-side-effects',
    ],
  },
  react: {
    description: 'React component state, effects, hooks, events, and rendering decisions.',
    members: [
      'react.unidirectional-data-flow',
      'react.derived-state',
      'react.effect-discipline',
      'react.optimization-restraint',
      'react.component-responsibility',
      'react.hook-safety',
      'react.event-logic',
    ],
  },
  testing: {
    description: 'Test behavior and coverage decisions driven by changed behavior.',
    members: ['testing.behavior-over-implementation', 'testing.change-driven-coverage'],
  },
  typescript: {
    description: 'TypeScript type-safety and source-type reuse decisions.',
    members: ['typescript.preserve-type-safety', 'typescript.reuse-source-types'],
  },
} as const

const expectedDescriptions = Object.fromEntries(
  Object.entries(expectedBundles).map(([id, { description }]) => [id, description]),
)

describe('canonical Slice A bundles', () => {
  it('loads the seven exact bundles with ordered members and future adapter-facing descriptions', async () => {
    const { loadBundles } = await import('../../src/catalog/load-bundles.js')
    const bundles = await loadBundles()

    expect(Object.fromEntries([...bundles].map(([id, bundle]) => [id, bundle.description]))).toEqual(expectedDescriptions)
    expect(Object.fromEntries([...bundles].map(([id, bundle]) => [id, bundle.members]))).toEqual(
      Object.fromEntries(Object.entries(expectedBundles).map(([id, { members }]) => [id, members])),
    )
    expect(bundles.get('core')).toMatchObject({ applicability: {}, dependencies: [] })

    for (const [id, bundle] of bundles) {
      expect(bundle.dependencies).toEqual([])
      expect(new Set(bundle.members).size).toBe(bundle.members.length)
      expect(id === 'core' || Object.keys(bundle.applicability).sort().join(',')).toBe(
        id === 'core' ? true : 'exclusions,filePatterns,taskIntents,technologies',
      )
      expect(bundle.applicability.unconditionalFileTrigger).toBeUndefined()
    }
  })

  it('validates deterministic activation fixture structure rather than semantic model evaluation', async () => {
    const { loadBundles, validateActivationFixtures } = await import('../../src/catalog/load-bundles.js')
    const bundles = await loadBundles()

    await expect(validateActivationFixtures()).resolves.toBeUndefined()
    expect(bundles).toBeInstanceOf(Map)
  })

  it('rejects a positive fixture that does not select its directory bundle', async () => {
    const { loadBundles, validateActivationFixtures } = await import('../../src/catalog/load-bundles.js')
    const toolkitRoot = new URL('../..', import.meta.url).pathname
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-bundles-'))
    await Promise.all([
      cp(join(toolkitRoot, 'catalog/bundles'), join(root, 'catalog/bundles'), { recursive: true }),
      cp(join(toolkitRoot, 'tests/fixtures/activation'), join(root, 'tests/fixtures/activation'), { recursive: true }),
    ])
    const fixture = join(root, 'tests/fixtures/activation/react/positive.yaml')
    await writeFile(
      fixture,
      (await readFile(fixture, 'utf8')).replace('expectedBundle: react', 'expectedBundle: core'),
    )

    await expect(validateActivationFixtures(root, await loadBundles(root))).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'INVALID_ACTIVATION_POLARITY' })],
    } satisfies Partial<PolicyError>)
  })
})
