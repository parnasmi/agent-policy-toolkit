export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  readonly code: string
  readonly severity: DiagnosticSeverity
  readonly message: string
  readonly path: string
  readonly ruleId?: string
  readonly remediation?: string
}

const ansiEscape = /\u001b\[[0-?]*[ -/]*[@-~]/g

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Return a deterministic diagnostic order without mutating the input list. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const byPath = compareStrings(left.path, right.path)
    if (byPath !== 0) return byPath

    const byRuleId = compareStrings(left.ruleId ?? '', right.ruleId ?? '')
    if (byRuleId !== 0) return byRuleId

    const byCode = compareStrings(left.code, right.code)
    if (byCode !== 0) return byCode

    const bySeverity = compareStrings(left.severity, right.severity)
    if (bySeverity !== 0) return bySeverity

    const byMessage = compareStrings(left.message, right.message)
    if (byMessage !== 0) return byMessage

    return compareStrings(left.remediation ?? '', right.remediation ?? '')
  })
}

function withoutTerminalColors(value: string): string {
  return value.replace(ansiEscape, '')
}

function sanitizeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return {
    code: withoutTerminalColors(diagnostic.code),
    severity: diagnostic.severity,
    message: withoutTerminalColors(diagnostic.message),
    path: withoutTerminalColors(diagnostic.path),
    ...(diagnostic.ruleId === undefined
      ? {}
      : { ruleId: withoutTerminalColors(diagnostic.ruleId) }),
    ...(diagnostic.remediation === undefined
      ? {}
      : { remediation: withoutTerminalColors(diagnostic.remediation) }),
  }
}

export class PolicyError extends Error {
  readonly diagnostics: readonly Diagnostic[]

  constructor(diagnostics: readonly Diagnostic[]) {
    const sortedDiagnostics = sortDiagnostics(diagnostics).map(sanitizeDiagnostic)
    const message = sortedDiagnostics
      .map(({ path, ruleId, code, message: detail }) => {
        const subject = [path, ruleId, code].filter(Boolean).join(' ')
        return `${subject}: ${detail}`
      })
      .join('\n')

    super(message || 'Policy operation failed')
    this.name = 'PolicyError'
    this.diagnostics = sortedDiagnostics
  }
}
