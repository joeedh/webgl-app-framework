#!/usr/bin/env node
/**
 * Layer-boundary check: invokes dependency-cruiser with .dependency-cruiser.cjs
 * over the source tree, prints a summary, and exits non-zero if any error-severity
 * rule is violated (warnings are reported but tolerated during the refactor).
 *
 * See plan §6 step 1 + §7.2 Layer A.
 */

import {execFile} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const args = ['--config', '.dependency-cruiser.cjs', '--output-type', 'err', 'scripts', 'addons']

console.log('check-layers: running dependency-cruiser against scripts/ + addons/')
console.log('check-layers: arguments: depcruise ' + args.join(' '))

const child = execFile(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['depcruise', ...args],
  {cwd: repoRoot, maxBuffer: 32 * 1024 * 1024},
  (err, stdout, stderr) => {
    if (stdout) process.stdout.write(stdout)
    if (stderr) process.stderr.write(stderr)
    if (err) {
      // depcruise exits non-zero only on error-severity rule hits or crashes.
      process.exit(err.code ?? 1)
    }
    console.log('check-layers: OK (no error-severity violations)')
  }
)
child.on('error', (err) => {
  console.error('check-layers: failed to spawn dependency-cruiser:', err.message)
  process.exit(2)
})
