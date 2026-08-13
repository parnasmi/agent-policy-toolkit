import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // CLI/contract tests exercise the real CLI against process.cwd(); running
    // test files in parallel makes that process-global state race. Run files
    // sequentially so each file owns the working directory for its duration.
    fileParallelism: false,
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'contracts',
          include: ['tests/contracts/**/*.test.ts'],
          environment: 'node',
        },
      },
      { test: { name: 'cli', include: ['tests/cli/**/*.test.ts'], environment: 'node' } },
    ],
  },
})
