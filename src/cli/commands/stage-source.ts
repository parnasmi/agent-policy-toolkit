import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { stageSourceChange } from '../../planner/stage-source.js'
import { CliUsageError, requirePlan, type CliArguments } from '../arguments.js'
import type { CliIo } from '../main.js'
import { absolutePlanPath, formatError, type CommandContext } from './common.js'

interface SourceSpecObject {
  readonly path?: string
  readonly targetPath?: string
  readonly content?: string
  readonly raw?: string
}

export async function runStageSourceCommand(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  const planPath = absolutePlanPath(context.repositoryRoot, requirePlan(args))
  let targetPath = args.targetPath ?? args.positionals[0]
  let content: string | undefined

  if (args.spec !== undefined) {
    const specPath = isAbsolute(args.spec)
      ? resolve(args.spec)
      : resolve(context.repositoryRoot, args.spec)
    const specRaw = await readFile(specPath, 'utf8')

    if (targetPath === undefined) {
      try {
        const parsed = parseYaml(specRaw) as unknown
        if (typeof parsed === 'object' && parsed !== null) {
          const specObj = parsed as SourceSpecObject
          targetPath = specObj.path ?? specObj.targetPath
          if (typeof specObj.content === 'string') {
            content = specObj.content
          }
        }
      } catch {
        // If not a wrapper object, targetPath must be provided via CLI
      }
    }

    if (content === undefined) {
      content = specRaw
    }
  }

  if (targetPath === undefined || targetPath.trim().length === 0) {
    throw new CliUsageError('target path must be specified via argument or within spec file')
  }

  if (content === undefined) {
    throw new CliUsageError('content must be provided via --spec')
  }

  try {
    const plan = await stageSourceChange({
      repositoryRoot: context.repositoryRoot,
      toolkitRoot: context.toolkitRoot,
      toolkitVersion: context.toolkitVersion,
      planPath,
      targetPath,
      content,
      scope: args.scope,
    })

    io.stdout += `Staged source change for ${targetPath}. Change plan written to ${planPath} (hash: ${plan.planHash.slice(0, 12)}).\n`
    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
