import type { CliIo } from '../../src/cli/main.js'

export interface MemoryIo extends CliIo {
  readonly writes: readonly { path: string; contents: string }[]
}

export function memoryIo(): MemoryIo {
  const writes: { path: string; contents: string }[] = []

  return {
    stdout: '',
    stderr: '',
    confirm: async () => false,
    fs: {
      readFile: async () => {
        throw new Error('Unexpected filesystem read')
      },
      writeFile: async (path, contents) => {
        writes.push({ path, contents })
      },
      exists: async () => {
        throw new Error('Unexpected filesystem inspection')
      },
    },
    writes,
  }
}
