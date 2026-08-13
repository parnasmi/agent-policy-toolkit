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
  let prefix = 0
  while (prefix < oldLines.length && prefix < nextLines.length && oldLines[prefix] === nextLines[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < nextLines.length - prefix
    && oldLines[oldLines.length - suffix - 1] === nextLines[nextLines.length - suffix - 1]
  ) suffix += 1
  const output: string[] = []
  for (const line of oldLines.slice(prefix, oldLines.length - suffix)) output.push(`-${line}`)
  for (const line of nextLines.slice(prefix, nextLines.length - suffix)) output.push(`+${line}`)
  return output
}

function currentHash(
  plan: ChangePlan,
  path: string,
  value: string | undefined,
): string | undefined {
  const expected = plan.currentArtifactHashes[path]
  if (expected !== undefined) return expected
  return value === undefined ? undefined : sha256Utf8(value)
}

/** Render a review-oriented, deterministic diff with complete policy and generated contents. */
export function formatChangePlanDiff(plan: ChangePlan, options: DiffFormatOptions): string {
  const paths = new Set<string>([
    ...Object.keys(plan.sourceHashes),
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

  const sourcePaths = Object.keys(plan.sourceHashes).sort(compareStrings)
  if (sourcePaths.length === 0) linesOut.push('(none)')
  for (const path of sourcePaths) {
    const content = options.contents.get(path)
    linesOut.push(`### ${absolute(options.repositoryRoot, path)}`)
    linesOut.push(`expected sha256: ${plan.sourceHashes[path]}`)
    if (content === undefined) linesOut.push('! missing source')
    else linesOut.push(...lines(content).map((line) => ` ${line}`))
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
  const drift: string[] = []
  for (const path of sourcePaths) {
    const content = options.contents.get(path)
    if (content === undefined || sha256Utf8(content) !== plan.sourceHashes[path]) drift.push(path)
  }
  for (const artifact of plan.desiredArtifacts) {
    const current = options.contents.get(artifact.path)
    const expected = currentHash(plan, artifact.path, current)
    const plannedExpected = plan.currentArtifactHashes[artifact.path]
    if (plannedExpected === undefined ? current !== undefined : expected !== plannedExpected) drift.push(artifact.path)
  }
  for (const path of plan.removals) {
    const current = options.contents.get(path)
    if (current === undefined || sha256Utf8(current) !== plan.currentArtifactHashes[path]) drift.push(path)
  }
  if (drift.length === 0) linesOut.push('(none)')
  else linesOut.push(...[...new Set(drift)].sort(compareStrings).map((path) => `! ${absolute(options.repositoryRoot, path)}`))

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
