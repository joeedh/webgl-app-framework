/**
 * Native↔WASM sculptcore parity test (documentation/plans/native-electron.md,
 * Workstream F).
 *
 * The native N-API addon and the WASM module run the *same* C++ sculptcore
 * engine, so a deterministically-built scene must produce byte-identical
 * geometry through either backend. This drives the real Electron app headlessly
 * once per backend (`--backend {wasm,native} --gen-scene litemesh-cube --dump`),
 * then asserts the two structured dumps match via a tolerant recursive numeric
 * diff (ported from sculptcore/make.mjs's `diffDump` / golden approach).
 *
 * The dump (test_harness.ts `dumpScene`) captures, per LiteMesh: scalar counts,
 * the spatial leaf count (topology), and a float32 signature of every populated
 * GPU vertex buffer (geometry) — the bulk-data seam WASM reads off the heap and
 * native reads via `pointerBytes`, i.e. exactly the boundary Workstream C
 * changed. Vertex `co` isn't JS-readable on native, so the GPU buffers are the
 * comparable geometry.
 *
 * Prerequisites (else the test self-skips with a logged reason, so CI without
 * the native clang/cmake-js toolchain stays green): the app bundle
 * (`build/entry_point.js`, `pnpm build`) and the native addon
 * (`sculptcore/build/native-node/sculptcore_node.node`, `make.mjs node`).
 */

import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '../..')
const BUNDLE = Path.join(REPO_ROOT, 'build', 'entry_point.js')
const NATIVE_ADDON = Path.join(REPO_ROOT, 'sculptcore', 'build', 'native-node', 'sculptcore_node.node')

// Tolerances mirror sculptcore/make.mjs's verify pass. The backends share the
// C++ kernel so dumps are normally exact; the tolerance only absorbs any
// platform fp wobble in the JS-side aggregation.
const ATOL = 1e-5
const RTOL = 1e-4

function diffDump(a: unknown, b: unknown, path = ''): string[] {
  const out: string[] = []
  if (typeof a === 'number' && typeof b === 'number') {
    const tol = ATOL + RTOL * Math.max(Math.abs(a), Math.abs(b))
    if (Math.abs(a - b) > tol) {
      out.push(`${path || '<root>'}: ${a} != ${b} (|Δ|=${Math.abs(a - b).toExponential(3)})`)
    }
    return out
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.push(`${path}: array length ${a.length} != ${b.length}`)
      return out
    }
    for (let i = 0; i < a.length; i++) out.push(...diffDump(a[i], b[i], `${path}[${i}]`))
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      const av = (a as Record<string, unknown>)[k]
      const bv = (b as Record<string, unknown>)[k]
      if (!(k in (a as object)) || !(k in (b as object))) {
        out.push(`${path}/${k}: present in only one dump`)
        continue
      }
      out.push(...diffDump(av, bv, `${path}/${k}`))
    }
    return out
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`)
  return out
}

/** Resolve the Electron executable via the electron/ workspace package. */
function resolveElectronExe(): string | undefined {
  try {
    const exe = execFileSync('node', ['-p', "require('electron')"], {
      cwd     : Path.join(REPO_ROOT, 'electron'),
      encoding: 'utf-8',
    }).trim()
    return exe && fs.existsSync(exe) ? exe : undefined
  } catch {
    return undefined
  }
}

/** Boot the app headlessly, build the scene under `backend`, return the dump. */
function dumpBackend(electronExe: string, backend: 'wasm' | 'native', subdiv: number): unknown {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), 'scparity-')), `${backend}.json`)
  // Electron drops process.argv into the renderer, so main.js forwards these as
  // a base64 token (see app_argv.ts); they reach test_harness.ts as written.
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE // else electron runs as a plain node, no window
  execFileSync(
    electronExe,
    [
      Path.join(REPO_ROOT, 'electron', 'main.js'),
      '--headless',
      '--no-devtools',
      '--backend', backend,
      '--gen-scene', 'litemesh-cube',
      '--scene-arg', `subdiv=${subdiv}`,
      '--dump', out,
      '--exit',
    ],
    {cwd: REPO_ROOT, env, encoding: 'utf-8', stdio: 'pipe', timeout: 60000},
  )
  if (!fs.existsSync(out)) throw new Error(`${backend} dump not written to ${out}`)
  return JSON.parse(fs.readFileSync(out, 'utf-8'))
}

const electronExe = resolveElectronExe()
const haveBundle = fs.existsSync(BUNDLE)
const haveNative = fs.existsSync(NATIVE_ADDON)
const canRun = !!electronExe && haveBundle && haveNative

// Use a small cube — fast to build and dump, still exercises the full pipeline
// (Mesh_createCube → SpatialTree → GPUManager.update → vertex buffers).
const SUBDIV = 8

const maybe = canRun ? describe : describe.skip

if (!canRun) {
  const why = [
    !electronExe && 'electron not resolvable (electron/ workspace)',
    !haveBundle && `app bundle missing (${Path.relative(REPO_ROOT, BUNDLE)}; run pnpm build)`,
    !haveNative && `native addon missing (${Path.relative(REPO_ROOT, NATIVE_ADDON)}; run make.mjs node)`,
  ]
    .filter(Boolean)
    .join('; ')
  // eslint-disable-next-line no-console
  console.warn(`[sculptcore-parity] skipped: ${why}`)
}

maybe('sculptcore native↔WASM parity', () => {
  let wasmDump: Record<string, unknown>
  let nativeDump: Record<string, unknown>

  beforeAll(() => {
    wasmDump = dumpBackend(electronExe!, 'wasm', SUBDIV) as Record<string, unknown>
    nativeDump = dumpBackend(electronExe!, 'native', SUBDIV) as Record<string, unknown>
  }, 180000)

  test('each backend reports its own identity', () => {
    expect(wasmDump.backend).toBe('wasm')
    expect(nativeDump.backend).toBe('native')
    expect(wasmDump.objectCount).toBe(nativeDump.objectCount)
  })

  test('both dumps contain a LiteMesh with populated GPU buffers', () => {
    const lm = (wasmDump.objects as Array<Record<string, unknown>>).find(
      (o) => o.dataType === 'LiteMesh',
    )
    expect(lm).toBeDefined()
    const bufs = lm!.gpuBuffers as Record<string, unknown> | undefined
    expect(bufs && Object.keys(bufs).length).toBeGreaterThan(0)
    // The geometry must actually be there (not an empty/first-frame buffer).
    const pos = bufs!.position as Record<string, unknown> | undefined
    expect(pos).toBeDefined()
    expect(pos!.empty).toBeUndefined()
    expect(pos!.floatCount as number).toBeGreaterThan(0)
  })

  test('native and WASM geometry/topology dumps match within tolerance', () => {
    // Compare everything except the self-reported backend label.
    const strip = (d: Record<string, unknown>) => ({...d, backend: undefined})
    const mismatches = diffDump(strip(nativeDump), strip(wasmDump))
    if (mismatches.length) {
      // eslint-disable-next-line no-console
      console.error('[sculptcore-parity] mismatches:\n' + mismatches.slice(0, 40).join('\n'))
    }
    expect(mismatches).toEqual([])
  })
})
