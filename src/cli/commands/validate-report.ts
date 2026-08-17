import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { validateClassificationReport } from '../../audit/validate-report.js'
import { CliUsageError, type CliArguments } from '../arguments.js'
import type { CliIo } from '../main.js'
import { formatError, type CommandContext } from './common.js'

export async function runValidateReportCommand(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  const reportPathArg = args.positionals[0] ?? args.spec
  if (reportPathArg === undefined || reportPathArg.trim().length === 0) {
    throw new CliUsageError('A classification report path is required')
  }

  const absoluteReportPath = isAbsolute(reportPathArg)
    ? resolve(reportPathArg)
    : resolve(context.repositoryRoot, reportPathArg)

  try {
    const content = await readFile(absoluteReportPath, 'utf8')
    const report = await validateClassificationReport(context.repositoryRoot, content)

    io.stdout += `Classification report is valid: ${report.findings.length} finding(s) across ${report.scannedFiles.length} file(s).\n`
    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
