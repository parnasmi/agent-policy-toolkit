import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'

import type { PreparedOperation } from './preconditions.js'
import { sha256Utf8 } from '../planner/hash.js'
import { resolveConfinedPath } from '../planner/inspect.js'

export type RenamePhase = 'backup' | 'install' | 'restore'

export interface TransactionRenameEvent {
  readonly phase: RenamePhase
  readonly operationIndex: number
  readonly path: string
  readonly from: string
  readonly to: string
}

export interface TransactionHooks {
  readonly beforePrepare?: (path: string) => void | Promise<void>
  readonly beforeRename?: (event: TransactionRenameEvent) => void | Promise<void>
  readonly afterPathCheck?: (
    event: { readonly phase: 'prepare' | 'backup' | 'install'; readonly path: string },
  ) => void | Promise<void>
}

interface TransactionEntry {
  readonly operation: PreparedOperation
  readonly temporaryPath?: string
  readonly backupPath?: string
  readonly rollbackCandidatePath: string
  readonly parentDevice: number
  readonly parentInode: number
  readonly parentPath: string
  backupCreated: boolean
  installed: boolean
  installedDevice?: number
  installedInode?: number
  rollbackConflict: boolean
}

interface CreatedDirectory {
  readonly path: string
  readonly parentPath: string
  readonly parentDevice: number
  readonly parentInode: number
}

type StableOperation =
  | { readonly operation: 'write'; readonly name: string; readonly content: string }
  | { readonly operation: 'rename'; readonly from: string; readonly to: string }
  | { readonly operation: 'link'; readonly from: string; readonly to: string }
  | { readonly operation: 'remove'; readonly name: string }
  | { readonly operation: 'hash'; readonly name: string }
  | { readonly operation: 'stat'; readonly name: string }
  | { readonly operation: 'remove-directory'; readonly name: string }
  | { readonly operation: 'mkdir-chain'; readonly segments: readonly string[] }

interface StableParent {
  readonly path: string
  readonly device: number
  readonly inode: number
}

interface StableOperationResult {
  readonly hash?: string
  readonly fileDevice?: number
  readonly fileInode?: number
  readonly createdDirectories?: readonly CreatedDirectory[]
  readonly finalParent?: StableParent
}

const stableFilesystemWorker = String.raw`
import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile, realpath, rename, link, rm, rmdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

let raw = ''
for await (const chunk of process.stdin) raw += chunk
const request = JSON.parse(raw)

function safeName(value) {
  if (typeof value !== 'string' || value.length === 0 || basename(value) !== value || value === '.' || value === '..') {
    throw new Error('Unsafe stable-filesystem name')
  }
  return value
}

async function identity() {
  const metadata = await lstat('.')
  return { device: metadata.dev, inode: metadata.ino, path: await realpath('.') }
}

async function assertIdentity(expected) {
  const current = await identity()
  if (current.device !== expected.device || current.inode !== expected.inode || current.path !== expected.path) {
    throw new Error('Stable parent identity changed')
  }
}

try {
  await assertIdentity(request.parent)
  const command = request.command
  let result = {}
  if (command.operation === 'write') {
    const handle = await open(safeName(command.name), 'wx')
    try {
      await handle.writeFile(command.content, 'utf8')
      try {
        await handle.sync()
      } catch (error) {
        if (!['EINVAL', 'ENOSYS', 'ENOTSUP'].includes(error?.code)) throw error
      }
    } finally {
      await handle.close()
    }
  } else if (command.operation === 'rename') {
    await rename(safeName(command.from), safeName(command.to))
  } else if (command.operation === 'link') {
    await link(safeName(command.from), safeName(command.to))
  } else if (command.operation === 'remove') {
    await rm(safeName(command.name), { force: true })
  } else if (command.operation === 'hash') {
    const content = await readFile(safeName(command.name), 'utf8')
    result.hash = createHash('sha256').update(content, 'utf8').digest('hex')
  } else if (command.operation === 'stat') {
    const metadata = await lstat(safeName(command.name))
    result = { fileDevice: metadata.dev, fileInode: metadata.ino }
  } else if (command.operation === 'remove-directory') {
    await rmdir(safeName(command.name))
  } else if (command.operation === 'mkdir-chain') {
    const createdDirectories = []
    for (const rawSegment of command.segments) {
      const segment = safeName(rawSegment)
      const parent = await identity()
      let metadata
      try {
        metadata = await lstat(segment)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        await mkdir(segment)
        metadata = await lstat(segment)
        createdDirectories.push({
          path: join(parent.path, segment),
          parentPath: parent.path,
          parentDevice: parent.device,
          parentInode: parent.inode,
        })
      }
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error('Unsafe transaction directory segment: ' + segment)
      }
      process.chdir(segment)
      const current = await identity()
      if (current.device !== metadata.dev || current.inode !== metadata.ino) {
        throw new Error('Transaction directory changed while entering: ' + segment)
      }
    }
    result = { createdDirectories, finalParent: await identity() }
  } else {
    throw new Error('Unknown stable-filesystem operation')
  }
  process.stdout.write(JSON.stringify(result))
} catch (error) {
  process.stderr.write(JSON.stringify({
    message: error instanceof Error ? error.message : String(error),
    code: error?.code,
  }))
  process.exitCode = 1
}
`

class StableFilesystemError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'StableFilesystemError'
    this.code = code
  }
}

async function runStableOperation(
  parent: StableParent,
  command: StableOperation,
): Promise<StableOperationResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', stableFilesystemWorker],
      { cwd: parent.path, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let output = ''
    let errorOutput = ''
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { output += chunk })
    child.stderr.on('data', (chunk: string) => { errorOutput += chunk })
    child.once('error', (error) => {
      settled = true
      rejectPromise(error)
    })
    child.once('close', (code) => {
      if (settled) return
      if (code === 0) {
        try {
          resolvePromise(output.length === 0 ? {} : JSON.parse(output) as StableOperationResult)
        } catch (error) {
          rejectPromise(error)
        }
        return
      }
      try {
        const details = JSON.parse(errorOutput) as { readonly message: string; readonly code?: string }
        rejectPromise(new StableFilesystemError(details.message, details.code))
      } catch {
        rejectPromise(new StableFilesystemError(errorOutput || `Filesystem worker exited ${code}`))
      }
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(JSON.stringify({ parent, command }))
  })
}

export class TransactionError extends Error {
  readonly rollbackFailures: readonly string[]

  constructor(cause: unknown, rollbackFailures: readonly string[]) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    const rollback = rollbackFailures.length === 0
      ? 'Rollback completed successfully.'
      : `ROLLBACK FAILED: ${rollbackFailures.join('; ')}`
    super(`Transactional apply failed: ${causeMessage}. ${rollback}`, { cause })
    this.name = 'TransactionError'
    this.rollbackFailures = rollbackFailures
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function ensureParent(
  targetPath: string,
  createdDirectories: CreatedDirectory[],
): Promise<StableParent> {
  const missing: string[] = []
  let cursor = dirname(targetPath)
  while (!(await exists(cursor))) {
    missing.push(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  const existingMetadata = await lstat(cursor)
  if (!existingMetadata.isDirectory() || existingMetadata.isSymbolicLink()) {
    throw new Error(`Unsafe existing transaction parent: ${cursor}`)
  }
  const existingParent: StableParent = {
    path: cursor,
    device: existingMetadata.dev,
    inode: existingMetadata.ino,
  }
  if (missing.length === 0) return existingParent
  const suffix = relative(cursor, dirname(targetPath))
  const segments = suffix.split(sep).filter((segment) => segment.length > 0)
  const result = await runStableOperation(existingParent, {
    operation: 'mkdir-chain',
    segments,
  })
  createdDirectories.push(...(result.createdDirectories ?? []))
  if (result.finalParent === undefined) throw new Error('Directory worker omitted final parent')
  return result.finalParent
}

async function initializeEntry(
  operation: PreparedOperation,
  transactionId: string,
  createdDirectories: CreatedDirectory[],
): Promise<TransactionEntry> {
  const stableParent = await ensureParent(operation.targetPath, createdDirectories)
  const parent = dirname(operation.targetPath)
  const base = basename(operation.targetPath)
  const suffix = `.agent-policy-transaction-${transactionId}`
  const temporaryPath = operation.content === undefined
    ? undefined
    : join(parent, `.${base}.${suffix}.tmp`)
  const backupPath = operation.existed
    ? join(parent, `.${base}.${suffix}.backup`)
    : undefined
  return {
    operation,
    temporaryPath,
    backupPath,
    rollbackCandidatePath: join(parent, `.${base}.${suffix}.rollback`),
    parentDevice: stableParent.device,
    parentInode: stableParent.inode,
    parentPath: stableParent.path,
    backupCreated: false,
    installed: false,
    rollbackConflict: false,
  }
}

function entryParent(entry: TransactionEntry): StableParent {
  return {
    path: entry.parentPath,
    device: entry.parentDevice,
    inode: entry.parentInode,
  }
}

function entryName(entry: TransactionEntry, path: string): string {
  if (dirname(path) !== entry.parentPath) {
    throw new Error(`Transaction path left stable parent: ${entry.operation.relativePath}`)
  }
  return basename(path)
}

async function assertMutationPath(
  repositoryRoot: string,
  entry: TransactionEntry,
): Promise<void> {
  const resolved = await resolveConfinedPath(
    repositoryRoot,
    entry.operation.relativePath,
  )
  if (resolved.path !== entry.operation.targetPath) {
    throw new Error(`Transaction target changed for ${entry.operation.relativePath}`)
  }
  const parentMetadata = await lstat(dirname(entry.operation.targetPath))
  if (
    !parentMetadata.isDirectory()
    || parentMetadata.isSymbolicLink()
    || parentMetadata.dev !== entry.parentDevice
    || parentMetadata.ino !== entry.parentInode
  ) {
    throw new Error(`Transaction parent changed for ${entry.operation.relativePath}`)
  }
}

async function restoreBackupWithoutOverwrite(
  entry: TransactionEntry,
): Promise<void> {
  if (entry.backupPath === undefined) return
  await runStableOperation(entryParent(entry), {
    operation: 'link',
    from: entryName(entry, entry.backupPath),
    to: entryName(entry, entry.operation.targetPath),
  })
  await runStableOperation(entryParent(entry), {
    operation: 'remove',
    name: entryName(entry, entry.backupPath),
  })
}

async function prepareTemporary(entry: TransactionEntry): Promise<void> {
  const content = entry.operation.content
  const temporaryPath = entry.temporaryPath
  if (temporaryPath !== undefined && content !== undefined) {
    await runStableOperation(entryParent(entry), {
      operation: 'write',
      name: entryName(entry, temporaryPath),
      content,
    })
  }
}

async function invokeRenameHook(
  hooks: TransactionHooks | undefined,
  phase: RenamePhase,
  operationIndex: number,
  entry: TransactionEntry,
  from: string,
  to: string,
): Promise<void> {
  await hooks?.beforeRename?.({
    phase,
    operationIndex,
    path: entry.operation.relativePath,
    from,
    to,
  })
}

async function cleanEmptyDirectories(directories: readonly CreatedDirectory[]): Promise<void> {
  const unique = new Map(directories.map((directory) => [directory.path, directory]))
  const deepestFirst = [...unique.values()].sort((left, right) => {
    const depthDifference = right.path.split(/[\\/]/).length - left.path.split(/[\\/]/).length
    return depthDifference === 0
      ? (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      : depthDifference
  })
  for (const directory of deepestFirst) {
    try {
      await runStableOperation({
        path: directory.parentPath,
        device: directory.parentDevice,
        inode: directory.parentInode,
      }, {
        operation: 'remove-directory',
        name: basename(directory.path),
      })
    } catch (error) {
      const code = error instanceof StableFilesystemError ? error.code : undefined
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error
    }
  }
}

/** Replace a complete operation set, restoring backups in reverse order on any failure. */
export async function applyTransaction(
  repositoryRoot: string,
  operations: readonly PreparedOperation[],
  hooks?: TransactionHooks,
  beforeCommit?: () => void | Promise<void>,
  beforeMutation?: () => void | Promise<void>,
): Promise<readonly string[]> {
  const transactionId = randomUUID()
  const entries: TransactionEntry[] = []
  const createdDirectories: CreatedDirectory[] = []
  try {
    for (const operation of operations) {
      await hooks?.beforePrepare?.(operation.relativePath)
      await beforeMutation?.()
      await resolveConfinedPath(repositoryRoot, operation.relativePath)
      const entry = await initializeEntry(operation, transactionId, createdDirectories)
      entries.push(entry)
      await assertMutationPath(repositoryRoot, entry)
      await hooks?.afterPathCheck?.({
        phase: 'prepare',
        path: entry.operation.relativePath,
      })
      await beforeMutation?.()
      await prepareTemporary(entry)
    }
    await beforeCommit?.()

    for (const [index, entry] of entries.entries()) {
      if (entry.backupPath !== undefined) {
        await invokeRenameHook(
          hooks,
          'backup',
          index,
          entry,
          entry.operation.targetPath,
          entry.backupPath,
        )
        await assertMutationPath(repositoryRoot, entry)
        await hooks?.afterPathCheck?.({
          phase: 'backup',
          path: entry.operation.relativePath,
        })
        await beforeMutation?.()
        await runStableOperation(entryParent(entry), {
          operation: 'rename',
          from: entryName(entry, entry.operation.targetPath),
          to: entryName(entry, entry.backupPath),
        })
        entry.backupCreated = true
        await assertMutationPath(repositoryRoot, entry)
        const backedUp = await runStableOperation(entryParent(entry), {
          operation: 'hash',
          name: entryName(entry, entry.backupPath),
        })
        if (backedUp.hash !== entry.operation.expectedCurrentSha256) {
          throw new Error(`Artifact changed at mutation boundary: ${entry.operation.relativePath}`)
        }
      }
      if (entry.temporaryPath !== undefined) {
        await invokeRenameHook(
          hooks,
          'install',
          index,
          entry,
          entry.temporaryPath,
          entry.operation.targetPath,
        )
        await assertMutationPath(repositoryRoot, entry)
        await hooks?.afterPathCheck?.({
          phase: 'install',
          path: entry.operation.relativePath,
        })
        await beforeMutation?.()
        await runStableOperation(entryParent(entry), {
          operation: 'link',
          from: entryName(entry, entry.temporaryPath),
          to: entryName(entry, entry.operation.targetPath),
        })
        entry.installed = true
        const installedIdentity = await runStableOperation(entryParent(entry), {
          operation: 'stat',
          name: entryName(entry, entry.operation.targetPath),
        })
        entry.installedDevice = installedIdentity.fileDevice
        entry.installedInode = installedIdentity.fileInode
        await assertMutationPath(repositoryRoot, entry)
        await runStableOperation(entryParent(entry), {
          operation: 'remove',
          name: entryName(entry, entry.temporaryPath),
        })
      }
    }

    const cleanupWarnings: string[] = []
    for (const entry of entries) {
      if (entry.backupPath === undefined) continue
      try {
        await assertMutationPath(repositoryRoot, entry)
        await runStableOperation(entryParent(entry), {
          operation: 'remove',
          name: entryName(entry, entry.backupPath),
        })
      } catch (cleanupError) {
        cleanupWarnings.push(
          `BACKUP CLEANUP FAILED for ${entry.operation.relativePath}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        )
      }
    }
    return cleanupWarnings
  } catch (error) {
    const rollbackFailures: string[] = []
    for (const [index, entry] of [...entries.entries()].reverse()) {
      if (entry.installed) {
        try {
          await assertMutationPath(repositoryRoot, entry)
          await runStableOperation(entryParent(entry), {
            operation: 'rename',
            from: entryName(entry, entry.operation.targetPath),
            to: entryName(entry, entry.rollbackCandidatePath),
          })
          const installed = await runStableOperation(entryParent(entry), {
            operation: 'hash',
            name: entryName(entry, entry.rollbackCandidatePath),
          })
          const installedIdentity = await runStableOperation(entryParent(entry), {
            operation: 'stat',
            name: entryName(entry, entry.rollbackCandidatePath),
          })
          if (
            installed.hash !== sha256Utf8(entry.operation.content ?? '')
            || installedIdentity.fileDevice !== entry.installedDevice
            || installedIdentity.fileInode !== entry.installedInode
          ) {
            await runStableOperation(entryParent(entry), {
              operation: 'link',
              from: entryName(entry, entry.rollbackCandidatePath),
              to: entryName(entry, entry.operation.targetPath),
            })
            await runStableOperation(entryParent(entry), {
              operation: 'remove',
              name: entryName(entry, entry.rollbackCandidatePath),
            })
            entry.rollbackConflict = true
            rollbackFailures.push(
              `${entry.operation.relativePath}: installed target changed during rollback; current target preserved`,
            )
          } else {
            await runStableOperation(entryParent(entry), {
              operation: 'remove',
              name: entryName(entry, entry.rollbackCandidatePath),
            })
          }
          entry.installed = false
        } catch (rollbackError) {
          entry.rollbackConflict = true
          rollbackFailures.push(
            `${entry.operation.relativePath}: cannot safely remove partial replacement: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          )
        }
      }
      if (entry.backupCreated && entry.backupPath !== undefined) {
        if (entry.rollbackConflict) {
          rollbackFailures.push(`${entry.operation.relativePath}: original backup preserved at ${entry.backupPath}`)
          continue
        }
        try {
          await invokeRenameHook(
            hooks,
            'restore',
            index,
            entry,
            entry.backupPath,
            entry.operation.targetPath,
          )
          await assertMutationPath(repositoryRoot, entry)
          await restoreBackupWithoutOverwrite(entry)
          entry.backupCreated = false
        } catch (rollbackError) {
          rollbackFailures.push(
            `${entry.operation.relativePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          )
        }
      }
    }
    for (const entry of entries) {
      if (entry.temporaryPath === undefined) continue
      try {
        await assertMutationPath(repositoryRoot, entry)
        await runStableOperation(entryParent(entry), {
          operation: 'remove',
          name: entryName(entry, entry.temporaryPath),
        })
      } catch (rollbackError) {
        rollbackFailures.push(
          `${entry.operation.relativePath}: cannot remove prepared temporary file: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        )
      }
    }
    try {
      await cleanEmptyDirectories(createdDirectories)
    } catch (rollbackError) {
      rollbackFailures.push(
        `created directories: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      )
    }
    throw new TransactionError(error, rollbackFailures)
  }
}
