import { scanUnmanagedContent } from '../../audit/scan.js'
import type { CliArguments } from '../arguments.js'
import type { CliIo } from '../main.js'
import { formatError, type CommandContext } from './common.js'

export async function runAuditCommand(
  args: CliArguments,
  io: CliIo,
  context: CommandContext,
): Promise<number> {
  try {
    const result = await scanUnmanagedContent(context.repositoryRoot, {
      paths: args.path.length > 0 ? args.path : undefined,
    })

    if (args.format === 'text') {
      io.stdout += `Scanned ${result.scannedFiles.length} file(s). Found ${result.unmanagedBlocks.length} unmanaged block(s).\n`
      for (const block of result.unmanagedBlocks) {
        io.stdout += `- [${block.id}] ${block.sourcePath}:${block.lineRange.start}-${block.lineRange.end}\n`
      }
    } else {
      io.stdout += `${JSON.stringify(result, null, 2)}\n`
    }

    return 0
  } catch (error) {
    io.stderr += `${formatError(error)}\n`
    return 1
  }
}
