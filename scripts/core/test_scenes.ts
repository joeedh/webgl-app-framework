/**
 * Named test-scene builders for the headless / CLI test harness.
 *
 * Mirrors `core/default_file.ts`'s single-builder hook, but keyed by name so
 * the Electron CLI (`--gen-scene <name>`, see `core/test_harness.ts`) and the
 * native↔WASM sculptcore parity suite (documentation/plans/native-electron.md,
 * Workstream F) can build a deterministic scene to render, save, or dump.
 *
 * Builders register *downward* into this core registry from wherever their
 * dependencies live — e.g. the LiteMesh builder is registered from
 * `scripts/lite-mesh/litemesh_test_scene.ts`, because core must not import
 * lite-mesh / sculptcore. This is the same inversion `default_file.ts` uses for
 * the mesh subsystem's startup cube.
 */

import type {ToolContext} from './context'
import type {Library} from './lib_api'
import type {Scene} from '../scene/scene'
import {getDefaultSceneBuilder} from './default_file'

/** Parsed `--scene-arg k=v` pairs, plus the chosen scene name under `_name`. */
export interface TestSceneArgs {
  [key: string]: string
}

export type TestSceneBuilder = (ctx: ToolContext, lib: Library, scene: Scene, args: TestSceneArgs) => void

const _scenes = new Map<string, TestSceneBuilder>()

export function registerTestScene(name: string, builder: TestSceneBuilder): void {
  _scenes.set(name, builder)
}

export function getTestScene(name: string): TestSceneBuilder | undefined {
  return _scenes.get(name)
}

export function listTestScenes(): string[] {
  return [..._scenes.keys()].sort()
}

// --- builtin builders (core-only deps) -------------------------------------

// An empty scene: just the Scene + Collection laid out by BasicFileOp. Useful
// as a parity baseline and as a target for `--run` to populate.
registerTestScene('empty', () => {})

// The normal startup scene (mesh cube + light), if the mesh subsystem
// registered its default-scene builder. Lets `--gen-scene default` reproduce a
// plain `app.new` headlessly without going through localStorage startup cache.
registerTestScene('default', (ctx: ToolContext, lib: Library, scene: Scene) => {
  getDefaultSceneBuilder()?.(ctx, lib, scene)
})
