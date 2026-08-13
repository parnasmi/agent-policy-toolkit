#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'

import { runCli, type CliIo } from './main.js'
import { confirmInTerminal } from './terminal-confirm.js'

const io: CliIo = {
  stdout: '',
  stderr: '',
  confirm: confirmInTerminal,
  fs: {
    readFile: async (path) => readFile(path, 'utf8'),
    writeFile,
    exists: async (path) => {
      try {
        await access(path, constants.F_OK)
        return true
      } catch {
        return false
      }
    },
  },
}

const exitCode = await runCli(process.argv.slice(2), io)
process.stdout.write(io.stdout)
process.stderr.write(io.stderr)
process.exitCode = exitCode
