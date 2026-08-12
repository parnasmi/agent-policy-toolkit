import { readdir, readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { Bundle } from '../domain/policy.js'
import { PolicyError } from '../domain/diagnostics.js'
import { parseYamlDocument } from '../schema/frontmatter.js'
import { validateDocument } from '../schema/validator.js'

interface ActivationFixture {
  readonly id: string
  readonly task: string
  readonly repositorySignals: readonly string[]
  readonly expectedBundle: string | null
  readonly reason: string
}

const defaultToolkitRoot = fileURLToPath(new URL('../../', import.meta.url))

function bundleError(code: string, message: string, path: string): PolicyError {
  return new PolicyError([{ code, severity: 'error', message, path }])
}

function sourcePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function isWithin(parent: string, child: string): boolean {
  const childPath = relative(parent, child)
  return childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath)
}

async function confinedFile(root: string, file: string): Promise<string> {
  const path = sourcePath(root, file)
  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(file)])
    if (!isWithin(canonicalRoot, canonicalFile)) {
      throw bundleError('PATH_ESCAPES_TOOLKIT', 'Bundle source resolves outside the toolkit root', path)
    }
    return canonicalFile
  } catch (error) {
    if (error instanceof PolicyError) throw error
    throw bundleError(
      'MISSING_BUNDLE_SOURCE',
      error instanceof Error ? error.message : 'Unable to read bundle source',
      path,
    )
  }
}

function bundleApplicability(bundle: Bundle, path: string): void {
  const keys = Object.keys(bundle.applicability)
  if (bundle.id === 'core') {
    if (keys.length > 0) throw bundleError('CORE_ACTIVATION_HINTS', 'Core must not declare activation hints', path)
    return
  }

  const expectedKeys = ['exclusions', 'filePatterns', 'taskIntents', 'technologies']
  if (keys.sort().join(',') !== expectedKeys.join(',')) {
    throw bundleError('INVALID_BUNDLE_HINTS', 'Domain bundles require semantic activation hints', path)
  }

  for (const key of expectedKeys) {
    const value = bundle.applicability[key]
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item.trim())) {
      throw bundleError('INVALID_BUNDLE_HINTS', `Bundle applicability ${key} must be a non-empty string array`, path)
    }
  }

  const filePatterns = bundle.applicability.filePatterns as readonly string[]
  if (filePatterns.includes('**/*')) {
    throw bundleError('UNCONDITIONAL_FILE_TRIGGER', 'Bundle file patterns must not unconditionally activate a bundle', path)
  }
}

function activationFixture(value: unknown, path: string): ActivationFixture {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw bundleError('INVALID_ACTIVATION_FIXTURE', 'Activation fixture must be an object', path)
  }

  const candidate = value as Partial<ActivationFixture>
  if (
    typeof candidate.id !== 'string' ||
    !candidate.id.trim() ||
    typeof candidate.task !== 'string' ||
    !candidate.task.trim() ||
    !Array.isArray(candidate.repositorySignals) ||
    candidate.repositorySignals.length === 0 ||
    candidate.repositorySignals.some((signal) => typeof signal !== 'string' || !signal.trim()) ||
    (typeof candidate.expectedBundle !== 'string' && candidate.expectedBundle !== null) ||
    typeof candidate.reason !== 'string' ||
    !candidate.reason.trim()
  ) {
    throw bundleError(
      'INVALID_ACTIVATION_FIXTURE',
      'Activation fixtures require id, task, repositorySignals, expectedBundle, and reason',
      path,
    )
  }

  return candidate as ActivationFixture
}

/** Validate shipped activation-fixture structure; this deliberately does not evaluate semantic model selection. */
export async function validateActivationFixtures(
  toolkitRoot = defaultToolkitRoot,
  suppliedBundles?: ReadonlyMap<string, Bundle>,
): Promise<void> {
  const root = resolve(toolkitRoot)
  const bundles = suppliedBundles ?? (await loadBundles(root))
  const fixturesRoot = await confinedFile(root, resolve(root, 'tests/fixtures/activation'))
  const seenIds = new Set<string>()

  for (const bundleId of bundles.keys()) {
    if (bundleId === 'core') continue

    for (const polarity of ['positive', 'negative'] as const) {
      const fixtureFile = await confinedFile(root, resolve(fixturesRoot, bundleId, `${polarity}.yaml`))
      const fixturePath = sourcePath(root, fixtureFile)
      const contents = parseYamlDocument(await readFile(fixtureFile, 'utf8'), fixturePath)
      if (!Array.isArray(contents) || contents.length < 5) {
        throw bundleError(
          'INSUFFICIENT_ACTIVATION_FIXTURES',
          `${polarity} fixtures must contain at least five cases`,
          fixturePath,
        )
      }

      for (const value of contents) {
        const fixture = activationFixture(value, fixturePath)
        if (seenIds.has(fixture.id)) {
          throw bundleError('DUPLICATE_ACTIVATION_FIXTURE', `Fixture ID ${fixture.id} is already declared`, fixturePath)
        }
        seenIds.add(fixture.id)

        if (fixture.expectedBundle !== null && !bundles.has(fixture.expectedBundle)) {
          throw bundleError('UNKNOWN_ACTIVATION_BUNDLE', `Fixture references unknown bundle ${fixture.expectedBundle}`, fixturePath)
        }
        if (polarity === 'positive' && fixture.expectedBundle !== bundleId) {
          throw bundleError('INVALID_ACTIVATION_POLARITY', 'Positive fixtures must select their directory bundle', fixturePath)
        }
        if (polarity === 'negative' && fixture.expectedBundle === bundleId) {
          throw bundleError('INVALID_ACTIVATION_POLARITY', 'Negative fixtures must not select their directory bundle', fixturePath)
        }
      }
    }
  }
}

function validateDependencies(bundles: ReadonlyMap<string, Bundle>, paths: ReadonlyMap<string, string>): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw bundleError('BUNDLE_DEPENDENCY_CYCLE', `Bundle dependency cycle includes ${id}`, paths.get(id) ?? id)
    const bundle = bundles.get(id)
    if (bundle === undefined) throw bundleError('UNKNOWN_BUNDLE_DEPENDENCY', `Unknown bundle dependency ${id}`, id)

    visiting.add(id)
    for (const dependency of bundle.dependencies) {
      if (!bundles.has(dependency)) {
        throw bundleError(
          'UNKNOWN_BUNDLE_DEPENDENCY',
          `Bundle dependency ${dependency} is not declared`,
          paths.get(id) ?? id,
        )
      }
      visit(dependency)
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of bundles.keys()) visit(id)
}

/** Load and validate the shipped bundle manifests; activation fixtures use the separate validator. */
export async function loadBundles(toolkitRoot = defaultToolkitRoot): Promise<ReadonlyMap<string, Bundle>> {
  const root = resolve(toolkitRoot)
  const bundlesDirectory = await confinedFile(root, resolve(root, 'catalog/bundles'))
  const entries = await readdir(bundlesDirectory, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => resolve(bundlesDirectory, entry.name))
    .sort((left, right) => sourcePath(root, left).localeCompare(sourcePath(root, right), 'en'))
  const bundles = new Map<string, Bundle>()
  const paths = new Map<string, string>()

  for (const file of files) {
    const canonicalFile = await confinedFile(root, file)
    const path = sourcePath(root, canonicalFile)
    const bundle = validateDocument<Bundle>('bundle-v1', parseYamlDocument(await readFile(canonicalFile, 'utf8'), path), path)
    if (bundles.has(bundle.id)) throw bundleError('DUPLICATE_BUNDLE_ID', `Bundle ${bundle.id} is already declared`, path)
    if (bundle.dependencies.includes(bundle.id)) throw bundleError('BUNDLE_SELF_DEPENDENCY', 'Bundle cannot depend on itself', path)
    bundleApplicability(bundle, path)
    bundles.set(bundle.id, bundle)
    paths.set(bundle.id, path)
  }

  validateDependencies(bundles, paths)
  return bundles
}
