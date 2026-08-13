import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import { reconcileDrift } from '../../applier/reconcile.js'
import { inspectArtifact } from '../../planner/inspect.js'
import { normalizeGeneratedLineEndings } from '../../planner/hash.js'
import {
  chooseReconciliation,
  compileCodex,
  formatError,
  prepareBundleSelection,
  reconciliationPlanPath,
  saveProjectionPlan,
  generatedOwnership,
  hasManagedRegion,
  readText,
  type CommandContext,
} from './common.js'

interface Detection {
  readonly bundles: readonly string[]
  readonly evidence: readonly string[]
}

async function readJson(root: string, path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolve(root, path), 'utf8'))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    return undefined
  }
}

async function fileNames(root: string): Promise<readonly string[]> {
  const names: string[] = []
  const visit = async (directory: string, prefix: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(resolve(root, directory), { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await visit(path, path)
      else if (entry.isFile()) names.push(path)
    }
  }
  await visit('', '')
  return names.sort()
}

function dependencyNames(packageJson: Record<string, unknown> | undefined): Set<string> {
  const names = new Set<string>()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const dependencies = packageJson?.[field]
    if (typeof dependencies !== 'object' || dependencies === null || Array.isArray(dependencies)) continue
    for (const name of Object.keys(dependencies)) names.add(name)
  }
  return names
}

/** Detect likely bundles as advisory evidence; this never silently chooses a policy. */
export async function detectBundles(root: string): Promise<Detection> {
  const packageJson = await readJson(root, 'package.json')
  const dependencies = dependencyNames(packageJson)
  const files = await fileNames(root)
  const proposed = new Set<string>(['core'])
  const evidence: string[] = []
  const lockfile = files.find((name) => /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lock(?:b)?)/.test(name))
  if (lockfile !== undefined) evidence.push(`lockfile evidence: ${lockfile}`)
  const typescriptSource = files.find((name) => /\.(?:ts|tsx|mts|cts)$/.test(name))
  const javascriptSource = files.find((name) => /\.(?:js|jsx|mjs|cjs)$/.test(name))
  if (typescriptSource !== undefined || javascriptSource !== undefined || files.includes('tsconfig.json')) {
    proposed.add('implementation-design')
    evidence.push(
      typescriptSource === undefined
        ? `source/configuration evidence: ${files.includes('tsconfig.json') ? 'tsconfig.json' : javascriptSource}`
        : `source extension evidence: ${typescriptSource}`,
    )
  }
  if (dependencies.has('typescript') || files.includes('tsconfig.json')) {
    proposed.add('typescript')
    evidence.push(dependencies.has('typescript') ? 'package.json dependency: typescript' : 'configuration evidence: tsconfig.json')
  }
  if (dependencies.has('react') || files.some((name) => /\.(?:tsx|jsx)$/.test(name))) {
    proposed.add('react')
    evidence.push(dependencies.has('react') ? 'package.json dependency: react' : 'source extension evidence: JSX/TSX')
  }
  if (
    dependencies.has('vitest')
    || dependencies.has('jest')
    || dependencies.has('@playwright/test')
    || files.some((name) => /(?:\.test\.|\.spec\.|vitest\.config|jest\.config|playwright\.config)/.test(name))
  ) {
    proposed.add('testing')
    evidence.push('test configuration or test source evidence')
  }
  return { bundles: [...proposed], evidence }
}

function displayDetection(detection: Detection): string {
  const lines = [
    'Bundle Selection (advisory; requires confirmation):',
    `Proposed bundles: ${detection.bundles.join(', ')}`,
  ]
  if (detection.evidence.length === 0) lines.push('Evidence: no recognized package, source, or test signals; Core only.')
  else {
    lines.push('Evidence:')
    lines.push(...detection.evidence.map((evidence) => `- ${evidence}`))
  }
  return `${lines.join('\n')}\n`
}

async function planningDrift(
  context: CommandContext,
  artifacts: Awaited<ReturnType<typeof compileCodex>>['artifacts'],
): Promise<{ readonly artifactPath: string; readonly currentContent: string } | undefined> {
  const sourceHash = (content: string): string | undefined =>
    /(?:Canonical source hash|canonicalSourceHash)["']?\s*:\s*["']?([0-9a-f]{64})/.exec(content)?.[1]
  for (const artifact of [...artifacts].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)) {
    const current = await readText(context.repositoryRoot, artifact.path)
    if (current === undefined || normalizeGeneratedLineEndings(current) === normalizeGeneratedLineEndings(artifact.content)) continue
    if (artifact.operation === 'managed-region') {
      try {
        if (!hasManagedRegion(current)) continue
      } catch {
        return { artifactPath: artifact.path, currentContent: current }
      }
    } else if (!generatedOwnership(current)) {
      return { artifactPath: artifact.path, currentContent: current }
    }
    const inspection = await inspectArtifact(context.repositoryRoot, artifact)
    const expectedSourceHash = sourceHash(artifact.content)
    const currentSourceHash = sourceHash(inspection.currentContent ?? '')
    const sourceChanged = expectedSourceHash !== undefined
      && currentSourceHash !== undefined
      && expectedSourceHash !== currentSourceHash
    const legacyOwned = inspection.state === 'managed-drift'
      && currentSourceHash === undefined
      && (artifact.operation === 'managed-region' || generatedOwnership(inspection.currentContent ?? ''))
    const isUnmanagedReplacement = inspection.state === 'unmanaged' && artifact.operation !== 'managed-region'
    if (
      inspection.state === 'invalid-marker'
      || isUnmanagedReplacement
      || (inspection.state === 'managed-drift' && !sourceChanged && !legacyOwned)
    ) {
      return {
        artifactPath: artifact.path,
        currentContent: inspection.currentContent ?? '',
      }
    }
  }
  return undefined
}

export async function runInit(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  if (args.positionals.length > 0) throw new Error(`Unexpected positional argument: ${args.positionals[0]}`)
  if (args.target.length !== 1 || args.target[0] !== 'codex') {
    throw new Error('init requires exactly one supported --target codex')
  }
  if (args.generated) throw new Error('--generated is not valid for init')
  if (args.plan === undefined) throw new Error('init requires --plan')

  try {
    let bundles = args.bundles
    if (bundles.length === 0) {
      const detected = await detectBundles(context.repositoryRoot)
      io.stdout += displayDetection(detected)
      if (!(await io.confirm('Confirm the proposed Bundle Selection?'))) {
        io.stderr += 'Bundle Selection was not confirmed; pass --bundles for non-interactive initialization.\n'
        return 1
      }
      bundles = detected.bundles
    }
    const selection = await prepareBundleSelection(context, bundles, 'codex')
    const compilation = await compileCodex(context, bundles, selection.overrides)
    const drift = await planningDrift(context, compilation.artifacts)
    if (drift !== undefined) {
      const choice = await chooseReconciliation(args, io, `Drift detected at ${drift.artifactPath}; choose reconciliation`)
      const proposal = reconcileDrift(choice, drift)
      if (proposal.kind === 'abort') {
        io.stderr += 'Drift reconciliation aborted; no plan was created.\n'
        return 1
      }
      if (proposal.kind === 'replan' && proposal.choice === 'regenerate') {
        const regeneratedPath = reconciliationPlanPath(args.plan)
        const regenerated = await saveProjectionPlan(
          context,
          'init:regenerate',
          regeneratedPath,
          compilation.sourcePaths,
          compilation.artifacts,
          [],
          [],
          selection.sourceChanges,
        )
        io.stdout += `Regeneration Change Plan saved: ${regeneratedPath}\n`
        io.stdout += `Planned ${regenerated.desiredArtifacts.length} generated artifact(s). Apply this reviewed plan after resolving drift.\n`
        return 1
      }
      io.stderr += proposal.kind === 'unresolved'
        ? 'Drift remains unresolved; no plan was created.\n'
        : 'Adoption requires a representable canonical-source proposal; no plan was created.\n'
      return 1
    }
    const plan = await saveProjectionPlan(
      context,
      'init',
      args.plan,
      compilation.sourcePaths,
      compilation.artifacts,
      [],
      [],
      selection.sourceChanges,
    )
    io.stdout += `Change Plan saved: ${resolve(args.plan)}\n`
    io.stdout += `Planned ${plan.desiredArtifacts.length} generated artifact(s).\n`
    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
