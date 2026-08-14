import { access, mkdtemp, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { compileCodex, prepareBundleSelection } from '../../src/cli/commands/common.js'
import { PolicyError } from '../../src/domain/diagnostics.js'
import { parseYamlDocument } from '../../src/schema/frontmatter.js'
import { loadProjectPolicy } from '../../src/schema/load-project.js'

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

  it('rejects bootstrap when the policy directory symlink escapes the repository', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-bootstrap-'))
    const outside = await mkdtemp(join(tmpdir(), 'agent-policy-outside-'))
    await mkdir(outside, { recursive: true })
    await symlink(outside, join(root, '.agent-policy'))
    const manifest = [
      'schemaVersion: v1',
      'toolkitVersion: 0.1.0-alpha.1',
      'bundles: [react]',
      'targets: [codex]',
      '',
    ].join('\n')

    await expect(loadProjectPolicy(root, { manifestOverride: manifest })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' })],
    } satisfies Partial<PolicyError>)
    await expect(prepareBundleSelection(
      { repositoryRoot: root, toolkitRoot: root, toolkitVersion: '0.1.0-alpha.1' },
      ['core', 'react'],
      'codex',
    )).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' })],
    } satisfies Partial<PolicyError>)
    expect(await exists(join(outside, 'policy.yaml'))).toBe(false)
  })

  it('rejects a dangling policy directory symlink before accepting an override or staging bootstrap', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-policy-bootstrap-'))
    await symlink(join(root, 'missing-policy-directory'), join(root, '.agent-policy'))
    const manifest = [
      'schemaVersion: v1',
      'toolkitVersion: 0.1.0-alpha.1',
      'bundles: [react]',
      'targets: [codex]',
      '',
    ].join('\n')

    await expect(loadProjectPolicy(root, { manifestOverride: manifest })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' })],
    } satisfies Partial<PolicyError>)
    await expect(prepareBundleSelection(
      { repositoryRoot: root, toolkitRoot: root, toolkitVersion: '0.1.0-alpha.1' },
      ['core', 'react'],
      'codex',
    )).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'PATH_ESCAPES_PROJECT' })],
    } satisfies Partial<PolicyError>)
  })
})
