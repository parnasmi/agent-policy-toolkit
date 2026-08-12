import { randomUUID } from 'node:crypto'
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  rmdir,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

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
}

interface TransactionEntry {
  readonly operation: PreparedOperation
  readonly temporaryPath?: string
  readonly backupPath?: string
  readonly parentDevice: number
  readonly parentInode: number
  backupCreated: boolean
  installed: boolean
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
  createdDirectories: string[],
): Promise<void> {
  const missing: string[] = []
  let cursor = dirname(targetPath)
  while (!(await exists(cursor))) {
    missing.push(cursor)
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  if (missing.length === 0) return
  await mkdir(dirname(targetPath), { recursive: true })
  createdDirectories.push(...missing)
}

async function syncWhenSupported(handle: Awaited<ReturnType<typeof open>>): Promise<void> {
  try {
    await handle.sync()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EINVAL' && code !== 'ENOSYS' && code !== 'ENOTSUP') throw error
  }
}

async function initializeEntry(
  operation: PreparedOperation,
  transactionId: string,
  createdDirectories: string[],
): Promise<TransactionEntry> {
  await ensureParent(operation.targetPath, createdDirectories)
  const parent = dirname(operation.targetPath)
  const base = basename(operation.targetPath)
  const suffix = `.agent-policy-transaction-${transactionId}`
  const temporaryPath = operation.content === undefined
    ? undefined
    : join(parent, `.${base}.${suffix}.tmp`)
  const backupPath = operation.existed
    ? join(parent, `.${base}.${suffix}.backup`)
    : undefined
  const parentMetadata = await lstat(parent)
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
    throw new Error(`Unsafe transaction parent for ${operation.relativePath}`)
  }
  return {
    operation,
    temporaryPath,
    backupPath,
    parentDevice: parentMetadata.dev,
    parentInode: parentMetadata.ino,
    backupCreated: false,
    installed: false,
  }
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
  await link(entry.backupPath, entry.operation.targetPath)
  await rm(entry.backupPath)
}

async function prepareTemporary(entry: TransactionEntry): Promise<void> {
  const content = entry.operation.content
  const temporaryPath = entry.temporaryPath
  if (temporaryPath !== undefined && content !== undefined) {
    const handle = await open(temporaryPath, 'wx')
    try {
      await handle.writeFile(content, 'utf8')
      await syncWhenSupported(handle)
    } finally {
      await handle.close()
    }
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

async function cleanEmptyDirectories(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      await rmdir(path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
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
): Promise<readonly string[]> {
  const transactionId = randomUUID()
  const entries: TransactionEntry[] = []
  const createdDirectories: string[] = []
  try {
    for (const operation of operations) {
      await hooks?.beforePrepare?.(operation.relativePath)
      await resolveConfinedPath(repositoryRoot, operation.relativePath)
      const entry = await initializeEntry(operation, transactionId, createdDirectories)
      entries.push(entry)
      await assertMutationPath(repositoryRoot, entry)
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
        await rename(entry.operation.targetPath, entry.backupPath)
        entry.backupCreated = true
        await assertMutationPath(repositoryRoot, entry)
        const backedUp = await readFile(entry.backupPath, 'utf8')
        if (sha256Utf8(backedUp) !== entry.operation.expectedCurrentSha256) {
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
        await link(entry.temporaryPath, entry.operation.targetPath)
        entry.installed = true
        await assertMutationPath(repositoryRoot, entry)
        await rm(entry.temporaryPath)
      }
    }

    const cleanupWarnings: string[] = []
    for (const entry of entries) {
      if (entry.backupPath === undefined) continue
      try {
        await assertMutationPath(repositoryRoot, entry)
        await rm(entry.backupPath, { force: true })
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
          await rm(entry.operation.targetPath, { force: true })
          entry.installed = false
        } catch (rollbackError) {
          rollbackFailures.push(
            `${entry.operation.relativePath}: cannot remove partial replacement: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          )
        }
      }
      if (entry.backupCreated && entry.backupPath !== undefined) {
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
        await rm(entry.temporaryPath, { force: true })
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
