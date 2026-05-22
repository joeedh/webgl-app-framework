/**
 * Default-scene builder contributed by the mesh subsystem.
 *
 * Registers with `core/default_file.ts.setDefaultSceneBuilder`. Without this
 * module imported, the default scene built by `BasicFileOp.exec` is empty
 * (just a scene + collection + no objects, no lights). Importing this module
 * is a side-effect import — kept in `entry_point.js`. Once mesh becomes a
 * builtin addon (plan §6 step 6), this registration moves into the addon's
 * `register()` hook.
 */

import type {Library} from '@framework/api'
import type {Scene} from '@framework/api'
import type {ToolContext} from '@framework/api'

import {setDefaultSceneBuilder} from '@framework/api'
import {SceneObject} from '@framework/api'
import {makeDefaultMaterial} from '@framework/api'
import {Light} from '@framework/api'
import {LiteMesh} from '@framework/api'
import {Mesh} from './mesh'
import {makeCube} from './mesh_shapes'

setDefaultSceneBuilder((ctx: ToolContext, lib: Library, scene: Scene) => {
  const mesh = new Mesh()
  makeCube(mesh)
  lib.add(mesh)

  const mat = makeDefaultMaterial()
  lib.add(mat)
  mesh.materials.push(mat)
  mat.lib_addUser(mesh)

  const sob = new SceneObject()
  lib.add(sob)
  sob.data = mesh
  mesh.lib_addUser(sob)

  scene.add(sob)
  scene.objects.setSelect(sob, true)
  scene.objects.setActive(sob)

  const light = new Light()
  lib.add(light)

  const sob2 = new SceneObject(light)
  lib.add(sob2)
  sob2.location[2] = 7.0
  scene.add(sob2)

  sob.graphUpdate()
  mesh.graphUpdate()
})
