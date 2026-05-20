#!/usr/bin/env node
/**
 * One-shot rewrite tool. Walks addons/builtin/** and rewrites every
 * `from '../../../../scripts/...'` import to `from '@framework/api'`,
 * preserving the imported binding list. Files that import a symbol the
 * framework API doesn't expose will fail to build; in that case, add the
 * symbol to scripts/framework_api.ts.
 *
 * Run from repo root: `node tools/rewrite-addon-imports.js`
 */

import fs from 'fs'
import Path from 'path'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..')
const ROOT = Path.join(REPO_ROOT, 'addons', 'builtin')

const RE = /from\s+['"](\.\.\/)+scripts\/[^'"]+['"]/g

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = Path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      walk(p, out)
    } else if (/\.(ts|js)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

let touched = 0
let lines = 0
for (const file of walk(ROOT, [])) {
  const src = fs.readFileSync(file, 'utf-8')
  let n = 0
  const out = src.replace(RE, () => {
    n++
    return `from '@framework/api'`
  })
  if (n > 0) {
    fs.writeFileSync(file, out)
    touched++
    lines += n
    console.log(`  ${Path.relative(REPO_ROOT, file)}: ${n} import(s)`)
  }
}
console.log(`\nrewrote ${lines} import(s) across ${touched} file(s)`)
