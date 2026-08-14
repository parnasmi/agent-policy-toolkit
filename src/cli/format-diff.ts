import { resolve } from 'node:path'

import type { ChangePlan } from '../domain/change-plan.js'
import { sha256Utf8 } from '../planner/hash.js'

export interface DiffContents {
  readonly path: string
  readonly content?: string
}

export interface DiffFormatOptions {
  readonly repositoryRoot: string
  readonly contents: ReadonlyMap<string, string | undefined>
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function absolute(repositoryRoot: string, path: string): string {
  return resolve(repositoryRoot, ...path.split('/'))
}

function lines(value: string | undefined): string[] {
  if (value === undefined || value.length === 0) return []
  return value.replace(/\r\n/g, '\n').split('\n').map((line) => line)
}

function unified(oldValue: string | undefined, nextValue: string): string[] {
  const oldLines = lines(oldValue)
  const nextLines = lines(nextValue)
  const output: string[] = []
  for (const line of oldLines) output.push(`-${line}`)
  for (const line of nextLines) output.push(`+${line}`)
  return output
}

function currentHash(
  value: string | undefined,
): string | undefined {
  return value === undefined ? undefined : sha256Utf8(value)
}

/** Return all reviewed paths whose current bytes no longer satisfy the plan. */
export function detectChangePlanDrift(
  plan: ChangePlan,
  contents: ReadonlyMap<string, string | undefined>,
): readonly string[] {
  const drift: string[] = []
  const sourceChangesByPath = new Map(
    (plan.sourceChanges ?? []).map((source) => [source.path, source]),
  )
  const sourcePaths = new Set([
    ...Object.keys(plan.sourceHashes),
    ...sourceChangesByPath.keys(),
  ])
  for (const path of sourcePaths) {
    const content = contents.get(path)
    if (sourceChangesByPath.get(path)?.operation === 'create') {
      if (content !== undefined) drift.push(path)
    } else if (content === undefined || sha256Utf8(content) !== plan.sourceHashes[path]) {
      drift.push(path)
    }
  }
  for (const artifact of plan.desiredArtifacts) {
    const current = contents.get(artifact.path)
    const expected = currentHash(current)
    const plannedExpected = plan.currentArtifactHashes[artifact.path]
    if (plannedExpected === undefined ? current !== undefined : expected !== plannedExpected) drift.push(artifact.path)
  }
  for (const path of plan.removals) {
    const current = contents.get(path)
    if (current === undefined || sha256Utf8(current) !== plan.currentArtifactHashes[path]) drift.push(path)
  }
  return [...new Set(drift)].sort(compareStrings)
}

/** Render a review-oriented, deterministic diff with complete policy and generated contents. */
export function formatChangePlanDiff(plan: ChangePlan, options: DiffFormatOptions): string {
  const sourcePaths = [...new Set([
    ...Object.keys(plan.sourceHashes),
    ...(plan.sourceChanges ?? []).map(({ path }) => path),
  ])].sort(compareStrings)
  const paths = new Set<string>([
    ...sourcePaths,
    ...plan.desiredArtifacts.map(({ path }) => path),
    ...plan.removals,
  ])
  const orderedPaths = [...paths].sort(compareStrings)
  const linesOut: string[] = [
    `Repository: ${options.repositoryRoot}`,
    `Command scope: ${plan.command}`,
    `Toolkit version: ${plan.toolkitVersion}`,
    `Plan hash: ${plan.planHash}`,
    'Resolved paths:',
    ...orderedPaths.map((path) => `- ${absolute(options.repositoryRoot, path)}`),
    '',
    'Source changes:',
  ]

  if (sourcePaths.length === 0) linesOut.push('(none)')
  for (const path of sourcePaths) {
    const content = options.contents.get(path)
    const change = plan.sourceChanges?.find((candidate) => candidate.path === path)
    linesOut.push(`### ${absolute(options.repositoryRoot, path)}`)
    if (change?.operation === 'create') {
      linesOut.push('expected: absent')
      linesOut.push(`+++ ${absolute(options.repositoryRoot, path)} (new)`)
      linesOut.push(...lines(change.content).map((line) => `+${line}`))
      continue
    }
    linesOut.push(`expected sha256: ${plan.sourceHashes[path]}`)
    if (content === undefined) linesOut.push('! missing source')
    else {
      if (change === undefined) linesOut.push(...lines(content).map((line) => ` ${line}`))
      else {
        linesOut.push(`--- ${absolute(options.repositoryRoot, path)}`)
        linesOut.push(`+++ ${absolute(options.repositoryRoot, path)} (reviewed)`)
        linesOut.push(...unified(content, change.content))
      }
    }
  }

  linesOut.push('', 'Generated changes:')
  if (plan.desiredArtifacts.length === 0) linesOut.push('(none)')
  for (const artifact of [...plan.desiredArtifacts].sort((left, right) => compareStrings(left.path, right.path))) {
    const current = options.contents.get(artifact.path)
    linesOut.push(`--- ${absolute(options.repositoryRoot, artifact.path)}`)
    linesOut.push(`+++ ${absolute(options.repositoryRoot, artifact.path)} (reviewed)`)
    linesOut.push(...unified(current, artifact.content))
  }

  linesOut.push('', 'Drift:')
  const drift = detectChangePlanDrift(plan, options.contents)
  if (drift.length === 0) linesOut.push('(none)')
  else linesOut.push(...drift.map((path) => `! ${absolute(options.repositoryRoot, path)}`))

  linesOut.push('', 'Deletions:')
  if (plan.removals.length === 0) linesOut.push('(none)')
  for (const path of [...plan.removals].sort(compareStrings)) {
    const current = options.contents.get(path)
    linesOut.push(`--- ${absolute(options.repositoryRoot, path)}`)
    if (current === undefined) linesOut.push('! already absent')
    else linesOut.push(...lines(current).map((line) => `-${line}`))
  }

  if (plan.diagnostics.length > 0) {
    linesOut.push('', 'Diagnostics:')
    for (const diagnostic of plan.diagnostics) linesOut.push(`${diagnostic.severity}: ${diagnostic.path}: ${diagnostic.message}`)
  }
  return `${linesOut.join('\n')}\n`
}
