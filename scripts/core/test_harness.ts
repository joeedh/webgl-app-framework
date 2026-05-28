/**
 * Headless / scripted test harness for the Electron shell.
 *
 * Driven by CLI args forwarded from `electron/main.js` (see `app_argv.ts`).
 * Lets a build/CI step boot the *real* app, build a deterministic scene
 * (notably one containing a sculptcore-backed `LiteMesh`), optionally run a
 * tool, then save a `.wproj`, dump a backend-comparable JSON snapshot, grab a
 * screenshot, and/or quit — all without clicking through the UI.
 *
 * This is the orchestration layer for documentation/plans/native-electron.md:
 * the same scene can be built under the WASM backend today and the native
 * N-API backend later, and the dumps diffed for parity (Workstream F).
 *
 * Recognized flags (renderer side):
 *   --gen-scene <name>      build a registered test scene (see test_scenes.ts),
 *                           replacing the default startup file (non-cached)
 *   --scene-arg k=v         (repeatable) parameters passed to the builder
 *   --run "tool.path(...)"  (repeatable) run a ToolOp by data-API path
 *   --save <out.wproj>      write a project file after building
 *   --dump <out.json>       write a structured scene dump (for parity diffs)
 *   --screenshot <out.png>  capture the #webgl canvas (best-effort)
 *   --backend native|wasm   record the requested sculptcore backend
 *   --list-scenes           print the registered scene names and quit
 *   --exit                  quit the app once the scenario completes
 *
 * Nothing here runs unless one of these flags is present, so a normal launch
 * (`electron main.js`) is unaffected.
 */

import {getAppArgv, getArg, getArgList, hasArg} from './app_argv'
import {genDefaultFile} from './gen_default_file'
import {getDefaultSceneBuilder, setDefaultSceneBuilder} from './default_file'
import {getTestScene, listTestScenes, TestSceneArgs} from './test_scenes'
import type {ToolContext} from './context'
import type {Library} from './lib_api'
import type {Scene} from '../scene/scene'

const TAG = '[apptest]'

// Minimal view of AppState — avoids importing the heavy AppState type and the
// circular imports that come with it.
interface AppStateLike {
  ctx: ToolContext & {api?: {execTool: (ctx: unknown, path: string) => void}; scene?: Scene}
  datalib: Library
  saveHandle: unknown
  createFile(args?: Record<string, unknown>): ArrayBuffer
}

function appstate(): AppStateLike {
  return (globalThis as {_appstate?: AppStateLike})._appstate as AppStateLike
}

function nodeRequire(): ((m: string) => unknown) | undefined {
  return (globalThis as {require?: (m: string) => unknown}).require
}

function writeFile(path: string, data: Uint8Array | string): void {
  const req = nodeRequire()
  if (!req) throw new Error('node fs unavailable (not running under Electron nodeIntegration)')
  const fs = req('fs') as {writeFileSync: (p: string, d: Uint8Array | string) => void}
  fs.writeFileSync(path, data)
}

export interface HarnessOptions {
  genScene?: string
  sceneArgs: TestSceneArgs
  runTools: string[]
  save?: string
  dump?: string
  screenshot?: string
  backend?: string
  listScenes: boolean
  exit: boolean
  active: boolean
}

export function parseHarnessArgs(argv: string[] = getAppArgv()): HarnessOptions {
  const sceneArgs: TestSceneArgs = {}
  for (const pair of getArgList('scene-arg', argv)) {
    const eq = pair.indexOf('=')
    if (eq > 0) sceneArgs[pair.slice(0, eq)] = pair.slice(eq + 1)
  }

  const opts: HarnessOptions = {
    genScene  : getArg('gen-scene', argv) || undefined,
    sceneArgs,
    runTools  : getArgList('run', argv),
    save      : getArg('save', argv) || undefined,
    dump      : getArg('dump', argv) || undefined,
    screenshot: getArg('screenshot', argv) || undefined,
    backend   : getArg('backend', argv) || undefined,
    listScenes: hasArg('list-scenes', argv),
    exit      : hasArg('exit', argv),
    active    : false,
  }

  opts.active = !!(
    opts.genScene ||
    opts.runTools.length ||
    opts.save ||
    opts.dump ||
    opts.screenshot ||
    opts.listScenes
  )
  return opts
}

/** Rebuild the startup file using a named test-scene builder (non-cached). */
function buildScene(name: string, sceneArgs: TestSceneArgs): boolean {
  const builder = getTestScene(name)
  if (!builder) {
    console.error(`${TAG} unknown scene "${name}". Known: ${listTestScenes().join(', ')}`)
    return false
  }

  const app = appstate()
  app.saveHandle = undefined

  // Temporarily route core's default-scene hook at our builder, then run the
  // normal non-cached file init (dont_load_startup=1 skips the localStorage
  // startup snapshot so the scene is exactly what the builder produced).
  const prev = getDefaultSceneBuilder()
  setDefaultSceneBuilder((ctx: ToolContext, lib: Library, scene: Scene) => builder(ctx, lib, scene, sceneArgs))
  try {
    genDefaultFile(app as unknown as Parameters<typeof genDefaultFile>[0], 1)
  } finally {
    setDefaultSceneBuilder(prev)
  }
  console.log(`${TAG} built scene "${name}"`, sceneArgs)
  return true
}

/** Best-effort structured snapshot for native↔WASM parity diffing. */
function dumpScene(): unknown {
  const app = appstate()
  const scene = app.ctx.scene
  const objects: unknown[] = []

  for (const ob of scene?.objects ?? ([] as Iterable<Record<string, unknown>>)) {
    const data = (ob as {data?: Record<string, unknown>}).data
    const entry: Record<string, unknown> = {
      name    : (ob as {name?: string}).name,
      dataType: data ? data.constructor.name : undefined,
    }

    // LiteMesh exposes a sculptcore WasmMesh on `.mesh`; pull whatever scalar
    // counts it offers without assuming a specific API (guarded). Workstream F
    // will deepen this into a full geometry/topology dump.
    const mesh = data?.mesh as Record<string, unknown> | undefined
    if (mesh) {
      const counts: Record<string, unknown> = {}
      for (const key of ['vertexCount', 'faceCount', 'edgeCount', 'cornerCount', 'triCount']) {
        try {
          const v = (mesh as Record<string, unknown>)[key]
          if (typeof v === 'number') counts[key] = v
          else if (typeof v === 'function') counts[key] = (v as () => unknown).call(mesh)
        } catch {
          /* not available on this backend */
        }
      }
      entry.mesh = counts
    }
    objects.push(entry)
  }

  return {
    backend     : (globalThis as {__SCULPTCORE_BACKEND?: string}).__SCULPTCORE_BACKEND ?? 'wasm',
    objectCount : objects.length,
    objects,
  }
}

async function pumpFrames(n: number): Promise<void> {
  const w = globalThis as unknown as {
    updateDataGraph?: (f?: boolean) => void
    redraw_viewport?: (reset?: boolean) => void
  }
  w.updateDataGraph?.(true)
  const raf = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))
  for (let i = 0; i < n; i++) {
    w.redraw_viewport?.(i === 0)
    await raf()
  }
}

async function captureScreenshot(path: string): Promise<void> {
  await pumpFrames(30)
  const canvas = document.querySelector('#webgl') as HTMLCanvasElement | null
  if (!canvas) {
    console.error(`${TAG} no #webgl canvas to screenshot`)
    return
  }
  // toDataURL can come back blank for a GPU canvas without preserveDrawingBuffer;
  // this is best-effort. The robust path is the chrome-devtools-mcp screenshot
  // tool over the CDP endpoint (see --remote-debug).
  const url = canvas.toDataURL('image/png')
  const bin = atob(url.slice(url.indexOf(',') + 1))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  writeFile(path, bytes)
  console.log(`${TAG} wrote screenshot ${path}`)
}

async function quit(): Promise<void> {
  const req = nodeRequire()
  try {
    const electron = req?.('electron') as {ipcRenderer?: {invoke: (c: string) => Promise<void>}} | undefined
    if (electron?.ipcRenderer) {
      await electron.ipcRenderer.invoke('apptest:quit')
      return
    }
  } catch (err) {
    console.warn(`${TAG} apptest:quit IPC failed, falling back to window.close`, err)
  }
  window.close()
}

/** Entry point — called from entry_point.js after appstate.init(). */
export async function runTestHarness(argv: string[] = getAppArgv()): Promise<void> {
  const opts = parseHarnessArgs(argv)

  if (opts.backend) {
    ;(globalThis as {__SCULPTCORE_BACKEND?: string}).__SCULPTCORE_BACKEND = opts.backend
    if (opts.backend !== 'wasm') {
      console.warn(`${TAG} backend "${opts.backend}" requested; only "wasm" is wired today (see native-electron plan)`)
    }
  }

  if (!opts.active && !opts.exit) return

  const result: Record<string, unknown> = {ok: true}

  try {
    if (opts.listScenes) {
      result.scenes = listTestScenes()
      console.log(`${TAG} scenes: ${listTestScenes().join(', ')}`)
    }

    if (opts.genScene) {
      result.builtScene = buildScene(opts.genScene, opts.sceneArgs) ? opts.genScene : null
    }

    for (const tool of opts.runTools) {
      try {
        appstate().ctx.api?.execTool(appstate().ctx, tool)
        console.log(`${TAG} ran ${tool}`)
      } catch (err) {
        console.error(`${TAG} tool failed: ${tool}`, err)
        result.ok = false
      }
    }

    if (opts.dump) {
      const data = dumpScene()
      writeFile(opts.dump, JSON.stringify(data, null, 2))
      result.dump = opts.dump
      console.log(`${TAG} wrote dump ${opts.dump}`)
    }

    if (opts.save) {
      const buf = appstate().createFile({save_screen: true, save_library: true, compress: false})
      writeFile(opts.save, new Uint8Array(buf))
      result.save = opts.save
      console.log(`${TAG} wrote project ${opts.save}`)
    }

    if (opts.screenshot) {
      await captureScreenshot(opts.screenshot)
      result.screenshot = opts.screenshot
    }
  } catch (err) {
    result.ok = false
    result.error = String(err)
    console.error(`${TAG} harness error`, err)
  }

  // Expose for external drivers (e.g. chrome-devtools-mcp evaluate_script).
  ;(globalThis as {__apptestResult?: unknown}).__apptestResult = result
  console.log(`${TAG} done`, result)

  if (opts.exit) {
    // Let the final log/IO flush before tearing the process down.
    setTimeout(() => void quit(), 250)
  }
}
