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
 * The scene is built *procedurally* at startup (rather than loaded from a
 * `.wproj`): the construction is deterministic, so the native and WASM
 * sculptcore backends build byte-identical geometry for parity diffing
 * (documentation/plans/native-electron.md, Workstream F). `LiteMesh`
 * serialization is now wired (`_data: iter(byte) | this.serialize()`), so the
 * harness can also round-trip a saved `.wproj` via `--load`.
 */

import type {ToolContext} from '../core/context'
import type {Library} from '../core/lib_api'
import type {Scene} from '../scene/scene'
import {registerTestScene, TestSceneArgs} from '../core/test_scenes'
import {SceneObject} from '../sceneobject/index'
import {Light} from '../light/light.js'
import {getWasmImmediate} from '@sculptcore/api/api'
import {AttrDomain, AttrUseFlags, LiteMesh} from './litemesh'
import {AttrType} from './litemesh_base'
// Side-effect: registers globalThis.__attrtestApply for the attr-render test.
import './litemesh_attrtest_support'

/**
 * Builds a single LiteMesh object (a sculptcore cube) plus a light.
 *
 * Scene args:
 *   subdiv=<n>   cube subdivision count (default 120)
 *   size=<f>     cube half-extent / size passed to Mesh_createCube (default 4 —
 *                large enough that the mesh fills the viewport under the default
 *                camera; the built-in LiteMesh() cube is size 1, which renders
 *                tiny in the test harness)
 *   sphere=<f>   cube->sphere morph factor 0..1 (default 1 = fully spherified)
 *   light=0      omit the light
 */
function buildLiteMeshCube(_ctx: ToolContext, lib: Library, scene: Scene, args: TestSceneArgs): void {
  const subdiv = args.subdiv && Number.isFinite(parseInt(args.subdiv, 10)) ? parseInt(args.subdiv, 10) : 120
  const size = args.size && Number.isFinite(parseFloat(args.size)) ? parseFloat(args.size) : 6.0
  const sphere = args.sphere !== undefined && Number.isFinite(parseFloat(args.sphere)) ? parseFloat(args.sphere) : 1.0

  const wasm = getWasmImmediate()!
  const lm = new LiteMesh(wasm.Mesh_createCube(subdiv, size, sphere))
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

/**
 * Builds a LiteMesh cube carrying the two attribute layers the renderengine ↔
 * sculptcore dynamic-attribute path is meant to consume:
 *
 *   - a VERTEX FLOAT4 layer named `color` (AttrUse COLOR), filled with a
 *     deterministic position→rgb gradient (`fillVertexColorFromPosition`), and
 *   - a CORNER FLOAT2 layer named `uv` (AttrUse UV) from a per-face box unwrap
 *     (every edge seamed → `generateUVFromSeams`).
 *
 * Both layers are created procedurally and deterministically (C++-side, so the
 * WASM and native backends build byte-identical data), so a material's
 * `AttributeNode`s requesting `color`/`uv` resolve to real buffers, and the
 * parity dump can diff the new attr buffers. A material requesting a name that
 * isn't here exercises the missing-attr (default-fill + advisory) path.
 *
 * Scene args:
 *   subdiv=<n>   cube subdivision (default 8 — small, fast, parity-friendly)
 *   size=<f>     cube half-extent (default 6)
 *   light=0      omit the light
 *
 * Deliberately a *real* cube (sphere=0) so the per-face planar charts are clean.
 */
function buildLiteMeshAttrTest(_ctx: ToolContext, lib: Library, scene: Scene, args: TestSceneArgs): void {
  const subdiv = args.subdiv && Number.isFinite(parseInt(args.subdiv, 10)) ? parseInt(args.subdiv, 10) : 8
  const size = args.size && Number.isFinite(parseFloat(args.size)) ? parseFloat(args.size) : 6.0

  const wasm = getWasmImmediate()!
  const lm = new LiteMesh(wasm.Mesh_createCube(subdiv, size, 0.0))
  lib.add(lm)

  // Vertex color layer (FLOAT4, tagged COLOR), filled position→rgb.
  lm.addAttr(AttrDomain.VERTEX, AttrType.Float4, AttrUseFlags.COLOR)
  lm.fillVertexColorFromPosition()

  // Per-face UV unwrap: seam every edge, then generate a packed corner UV layer.
  lm.markAllSeams()
  lm.generateUVFromSeams()

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

registerTestScene('litemesh-attrtest', buildLiteMeshAttrTest)
