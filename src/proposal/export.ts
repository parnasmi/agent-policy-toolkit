import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { parse, stringify } from 'yaml'

import { PolicyError } from '../domain/diagnostics.js'
import type { UpstreamProposal } from '../domain/proposal.js'
import { validateDocument } from '../schema/validator.js'

const HEADER_COMMENT = '# Upstream Policy Proposal\n# Schema: proposal-v1\n\n'

/**
 * Export an upstream policy proposal to a portable YAML document and optionally write to disk atomically.
 */
export async function exportProposalDocument(
  spec: unknown,
  outputPath?: string,
): Promise<{ readonly content: string; readonly proposal: UpstreamProposal }> {
  let parsed: unknown = spec
  if (typeof spec === 'string') {
    try {
      parsed = parse(spec)
    } catch (error) {
      if (error instanceof PolicyError) throw error
      throw new PolicyError([
        {
          code: 'INVALID_PROPOSAL_CONTENT',
          severity: 'error',
          message: error instanceof Error ? error.message : 'Invalid proposal content',
          path: outputPath ?? 'proposal.yaml',
        },
      ])
    }
  }

  const proposal = validateDocument<UpstreamProposal>(
    'proposal-v1',
    parsed,
    outputPath ?? 'proposal.yaml',
  )

  const serialized = stringify(proposal)
  const content = `${HEADER_COMMENT}${serialized}`

  if (outputPath !== undefined) {
    const parent = dirname(outputPath)
    await mkdir(parent, { recursive: true })
    const temporaryPath = join(parent, `.${basename(outputPath)}.${randomUUID()}.tmp`)
    try {
      await writeFile(temporaryPath, content, 'utf8')
      await rename(temporaryPath, outputPath)
    } finally {
      await rm(temporaryPath, { force: true })
    }
  }

  return { content, proposal }
}
