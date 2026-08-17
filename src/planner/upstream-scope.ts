import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PolicyError } from '../domain/diagnostics.js'

export const UPSTREAM_PACKAGE_NAME = '@agent-policy/agent-policy-toolkit'

/**
 * Determine if a given directory is the root of the Agent Policy Toolkit source repository.
 * Requires package.json with name === "@agent-policy/agent-policy-toolkit" and a catalog directory.
 */
export async function isUpstreamRepository(repositoryRoot: string): Promise<boolean> {
  try {
    const pkgPath = resolve(repositoryRoot, 'package.json')
    const pkgContent = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(pkgContent) as { name?: string }
    if (pkg.name !== UPSTREAM_PACKAGE_NAME) {
      return false
    }

    const catalogPath = resolve(repositoryRoot, 'catalog')
    const stat = await lstat(catalogPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/**
 * Assert that a repository is the Agent Policy Toolkit upstream repository.
 * Throws PolicyError with NOT_UPSTREAM_REPOSITORY if not.
 */
export async function assertUpstreamRepository(repositoryRoot: string): Promise<void> {
  const isUpstream = await isUpstreamRepository(repositoryRoot)
  if (!isUpstream) {
    throw new PolicyError([
      {
        code: 'NOT_UPSTREAM_REPOSITORY',
        severity: 'error',
        message: 'Upstream scope requires an Agent Policy Toolkit source repository',
        path: repositoryRoot,
      },
    ])
  }
}
