import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { exportProposalDocument } from '../../proposal/export.js'
import { CliUsageError, type CliArguments } from '../arguments.js'
import type { CliIo } from '../main.js'
import { formatError, type CommandContext } from './common.js'

export async function runExportProposalCommand(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  const specArg = args.spec ?? args.positionals[0]
  if (specArg === undefined || specArg.trim().length === 0) {
    throw new CliUsageError('--spec is required for proposal export')
  }

  const specPath = isAbsolute(specArg)
    ? resolve(specArg)
    : resolve(context.repositoryRoot, specArg)

  let outputPath: string | undefined
  if (args.output !== undefined) {
    outputPath = isAbsolute(args.output)
      ? resolve(args.output)
      : resolve(context.repositoryRoot, args.output)
  }

  try {
    const specContent = await readFile(specPath, 'utf8')
    const { content, proposal } = await exportProposalDocument(specContent, outputPath)

    if (outputPath !== undefined) {
      io.stdout += `Exported proposal for ${proposal.proposedDestination.targetId ?? proposal.behavioralRole} to ${outputPath}\n`
    } else {
      io.stdout += content
    }

    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
