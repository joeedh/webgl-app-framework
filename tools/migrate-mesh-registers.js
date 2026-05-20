#!/usr/bin/env node
/**
 * One-shot migration:
 *  - Strips `.register(X)` and `nstructjs.register(X)` call lines from
 *    `addons/builtin/mesh/src/**` (mesh addon).
 *  - Collects (file, className) pairs.
 *  - Generates `addons/builtin/mesh/src/register_classes.ts` which imports
 *    every collected class and exports them as `ALL_MESH_REGISTRATIONS`.
 *
 *  `nstructjs.inlineRegister(...)` is left intact (static-field initializer
 *  semantics require early registration).
 *
 *  Lines starting with `//` are skipped (already commented out).
 */

import fs from 'fs'
import Path from 'path'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..')
const MESH_SRC = Path.join(REPO_ROOT, 'addons', 'builtin', 'mesh', 'src')

// Lines like `ToolOp.register(Foo)` / `nstructjs.register(Foo)` /
// `CustomDataElem.register(Foo)` / `DataBlock.register(Foo)` /
// `SceneObjectData.register(Foo)`.
const RE_REG = /^\s*(?:ToolOp|ToolMode|DataBlock|CustomDataElem|SceneObjectData|Editor|nstructjs)\.register\(([A-Za-z_$][\w$]*)\)\s*;?\s*$/

// File path → class name list (preserves order, may have duplicates we'll dedup).
const collected = new Map()

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = Path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|js)$/.test(name)) out.push(p)
  }
  return out
}

for (const file of walk(MESH_SRC, [])) {
  const rel = Path.relative(MESH_SRC, file).replace(/\\/g, '/')
  // Skip the register hub itself
  if (rel === 'addon_register.ts' || rel === 'register_classes.ts') continue
  const src = fs.readFileSync(file, 'utf-8')
  const lines = src.split('\n')
  const kept = []
  const classes = []
  for (const line of lines) {
    // Skip lines already commented out.
    if (/^\s*\/\//.test(line)) {
      kept.push(line)
      continue
    }
    const m = RE_REG.exec(line)
    if (m) {
      classes.push(m[1])
      // Drop the line entirely.
      continue
    }
    kept.push(line)
  }
  if (classes.length > 0) {
    fs.writeFileSync(file, kept.join('\n'))
    collected.set(rel, classes)
    console.log(`  ${rel}: stripped ${classes.length} reg(s) [${classes.join(', ')}]`)
  }
}

// Generate the consolidated register_classes.ts.
// Group by file. Some classes may not currently be exported — we generate
// import lines optimistically; missing-export errors will surface at build.
const importLines = []
const allClasses = []
for (const [rel, classes] of collected) {
  // Replace .ts/.js with .js for ESM import.
  const importPath = './' + rel.replace(/\.(ts|js)$/, '.js')
  const unique = Array.from(new Set(classes))
  importLines.push(`import {${unique.join(', ')}} from '${importPath}'`)
  allClasses.push(...unique)
}

const header = `/**
 * Auto-generated list of classes the mesh addon registers with the
 * AddonAPI during \`register(api)\`. Produced by
 * \`tools/migrate-mesh-registers.js\` — do not edit by hand; regenerate
 * after adding/removing registerable classes.
 *
 * The classes are imported from their defining modules and re-exported
 * as a single array. \`addon_register.ts\` calls
 * \`api.registerAll(...ALL_MESH_REGISTRATIONS)\`.
 */

`

const body = `\nexport const ALL_MESH_REGISTRATIONS: unknown[] = [\n  ${allClasses.join(',\n  ')},\n]\n`

const output = header + importLines.join('\n') + body
fs.writeFileSync(Path.join(MESH_SRC, 'register_classes.ts'), output)
console.log(`\nwrote register_classes.ts: ${allClasses.length} classes across ${collected.size} files`)
