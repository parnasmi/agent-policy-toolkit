import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { compileCodex, prepareBundleSelection } from '../../src/cli/commands/common.js'
import { parseYamlDocument } from '../../src/schema/frontmatter.js'

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('bootstrap source preparation', () => {
  it('stages a manifest create change when the repository has no policy directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-bootstrap-'))

    const result = await prepareBundleSelection(
      { repositoryRoot: root, toolkitRoot: root, toolkitVersion: '0.1.0-alpha.1' },
      ['core', 'react'],
      'codex',
    )

    expect(result.sourceChanges[0]).toMatchObject({
      path: '.agent-policy/policy.yaml',
      operation: 'create',
    })
    expect(parseYamlDocument(result.sourceChanges[0]?.content ?? '', '.agent-policy/policy.yaml')).toMatchObject({
      schemaVersion: 'v1',
      toolkitVersion: '0.1.0-alpha.1',
      bundles: ['react'],
      targets: ['codex'],
    })
    expect(await exists(join(root, '.agent-policy', 'policy.yaml'))).toBe(false)
  })

  it('compiles a staged manifest override without creating it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-bootstrap-'))
    const selection = await prepareBundleSelection(
      { repositoryRoot: root, toolkitRoot: process.cwd(), toolkitVersion: '0.1.0-alpha.1' },
      ['core', 'react'],
      'codex',
    )

    await expect(compileCodex(
      { repositoryRoot: root, toolkitRoot: process.cwd(), toolkitVersion: '0.1.0-alpha.1' },
      ['core', 'react'],
      selection.overrides,
    )).resolves.toMatchObject({
      project: { bundles: ['react'], targets: ['codex'] },
    })
    expect(await exists(join(root, '.agent-policy', 'policy.yaml'))).toBe(false)
  })
})
