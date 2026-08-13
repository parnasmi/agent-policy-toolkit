import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import type { CliIo } from '../main.js'
import type { CliArguments } from '../arguments.js'
import { createChangePlan } from '../../planner/create-plan.js'
import { formatChangePlanDiff } from '../format-diff.js'
import {
  compileCodex,
  findGeneratedFiles,
  formatError,
  type CommandContext,
} from './common.js'

async function contentsForPlan(
  context: CommandContext,
  plan: Awaited<ReturnType<typeof createChangePlan>>,
): Promise<ReadonlyMap<string, string | undefined>> {
  const paths = [
    ...Object.keys(plan.sourceHashes),
    ...plan.desiredArtifacts.map(({ path }) => path),
    ...plan.removals,
  ]
  const result = new Map<string, string | undefined>()
  for (const path of paths) {
    try {
      result.set(path, await readFile(resolve(context.repositoryRoot, ...path.split('/')), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      result.set(path, undefined)
    }
  }
  return result
}

export async function runCheck(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  if (args.positionals.length > 0 || args.plan !== undefined || args.target.length > 0 || args.bundles.length > 0 || args.yes || args.generated) {
    throw new Error('check accepts no options or positional arguments')
  }

  let stagingParent: string | undefined
  try {
    const compilation = await compileCodex(context)
    stagingParent = await mkdtemp(join(tmpdir(), 'agent-policy-check-'))
    const planPath = join(stagingParent, 'check-plan.json')
    const plan = await createChangePlan({
      command: 'check',
      toolkitVersion: context.toolkitVersion,
      repositoryRoot: context.repositoryRoot,
      planPath,
      sourcePaths: compilation.sourcePaths,
      desiredArtifacts: compilation.artifacts,
    })
    const contents = await contentsForPlan(context, plan)
    const generated = await findGeneratedFiles(context.repositoryRoot)
    const expected = new Set(compilation.artifacts.map(({ path }) => path))
    const stale = generated.filter(({ path }) => !expected.has(path))
    if (plan.desiredArtifacts.length === 0 && plan.removals.length === 0 && stale.length === 0) {
      io.stdout += `Check passed: compiled policy matches committed Codex artifacts for ${context.repositoryRoot}.\n`
      return 0
    }
    io.stdout += formatChangePlanDiff(plan, {
      repositoryRoot: context.repositoryRoot,
      contents,
    })
    if (stale.length > 0) {
      io.stdout += '\nUnexpected generated artifacts:\n'
      io.stdout += stale.map(({ path }) => `! ${resolve(context.repositoryRoot, ...path.split('/'))}`).join('\n') + '\n'
    }
    return 1
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  } finally {
    if (stagingParent !== undefined) await rm(stagingParent, { recursive: true, force: true })
  }
}
