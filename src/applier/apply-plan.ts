import type { ChangePlan } from '../domain/change-plan.js'
import {
  revalidatePreconditions,
  type ApplyFailure,
} from './preconditions.js'
import {
  applyTransaction,
  TransactionError,
  type TransactionHooks,
} from './transaction.js'

export interface ApplyOptions {
  readonly repositoryRoot: string
  readonly toolkitVersion: string
  readonly transactionHooks?: TransactionHooks
}

export type ApplyResult =
  | {
    readonly ok: true
    readonly appliedPaths: readonly string[]
    readonly warnings?: readonly string[]
  }
  | ApplyFailure
  | {
    readonly ok: false
    readonly code: 'transaction-failed'
    readonly message: string
    readonly paths: readonly string[]
    readonly rollbackFailures: readonly string[]
  }

/** Revalidate a reviewed plan, then cross the repository's only mutation boundary. */
export async function applyPlan(
  plan: ChangePlan,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const validated = await revalidatePreconditions(plan, options)
  if ('ok' in validated) return validated

  try {
    const warnings = await applyTransaction(
      validated.repositoryRoot,
      validated.operations,
      options.transactionHooks,
      async () => {
        const immediatelyCurrent = await revalidatePreconditions(plan, options)
        if ('ok' in immediatelyCurrent) throw new Error(immediatelyCurrent.message)
      },
    )
    return {
      ok: true,
      appliedPaths: validated.operations.map(({ relativePath }) => relativePath),
      ...(warnings.length === 0 ? {} : { warnings }),
    }
  } catch (error) {
    const transactionError = error instanceof TransactionError
      ? error
      : new TransactionError(error, [])
    return {
      ok: false,
      code: 'transaction-failed',
      message: transactionError.message,
      paths: validated.operations.map(({ relativePath }) => relativePath),
      rollbackFailures: transactionError.rollbackFailures,
    }
  }
}
