/**
 * Registers sculptcore-backed `LiteMesh` test scenes into the core test-scene
 * registry (`scripts/core/test_scenes.ts`), driven by the Electron CLI harness
 * (`--gen-scene litemesh-cube`, see `scripts/core/test_harness.ts`).
 *
 * This lives in the lite-mesh layer — not core — because building the scene
 * constructs a `LiteMesh` (which pulls in sculptcore via `@sculptcore/api`),
 * and core must not depend on lite-mesh / sculptcore. The registration is the
 * same downward-inversion `addons/builtin/mesh/src/default_scene.ts` uses for
 * the startup cube. It's pulled in as a side-effect import from
 * `scripts/entry_point.js`.
 *
 * Because `LiteMesh` serialization isn't wired up yet (its STRUCT is empty),
 * the scene is built *procedurally* at startup rather than loaded from a
 * serialized `.wproj` — the construction is deterministic, so the native and
 * WASM sculptcore backends build byte-identical geometry for parity diffing
 * (documentation/plans/native-electron.md, Workstream F).
 */

import type {ToolContext} from '../core/context'
import type {Library} from '../core/lib_api'
import type {Scene} from '../scene/scene'
import {registerTestScene, TestSceneArgs} from '../core/test_scenes'
import {SceneObject} from '../sceneobject/index'
import {Light} from '../light/light.js'
import {getWasmImmediate} from '@sculptcore/api/api'
import {LiteMesh} from './litemesh'

/**
 * Builds a single LiteMesh object (a sculptcore cube) plus a light.
 *
 * Scene args:
 *   subdiv=<n>   cube subdivision count (default = LiteMesh's built-in 120)
 *   light=0      omit the light
 */
function buildLiteMeshCube(_ctx: ToolContext, lib: Library, scene: Scene, args: TestSceneArgs): void {
  const subdiv = args.subdiv ? parseInt(args.subdiv, 10) : undefined

  let lm: LiteMesh
  if (subdiv && Number.isFinite(subdiv)) {
    const wasm = getWasmImmediate()!
    lm = new LiteMesh(wasm.Mesh_createCube(subdiv, 1.0, 1.0))
  } else {
    lm = new LiteMesh()
  }
  lib.add(lm)

  const sob = new SceneObject()
  lib.add(sob)
  sob.data = lm
  lm.lib_addUser(sob)

  scene.add(sob)
  scene.objects.setSelect(sob, true)
  scene.objects.setActive(sob)

  if (args.light !== '0') {
    const light = new Light()
    lib.add(light)
    const lightOb = new SceneObject(light)
    lib.add(lightOb)
    lightOb.location[2] = 7.0
    scene.add(lightOb)
  }

  sob.graphUpdate()
  lm.graphUpdate()
}

registerTestScene('litemesh-cube', buildLiteMeshCube)
