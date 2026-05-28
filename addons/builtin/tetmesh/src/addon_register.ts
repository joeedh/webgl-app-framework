/**
 * Registers the tetmesh subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 8.
 *
 * Same model as addons/builtin/{mesh,subsurf,mesh_edit,curve}/src/addon_register.ts:
 * the toolmode + tet ops now live in this addon's src/, and we announce
 * ourselves so the addon shows up in the UI, can be enabled/disabled, and
 * other addons can declare `dependencies: ['tetmesh']` and resolve our exports
 * via `_addons.getAddonAPI('tetmesh').exports['tetmesh']` or `@addon/tetmesh/api`.
 *
 * Registration (ToolOp/ToolMode/nstructjs) is dispatched through
 * `api.registerAll(...)` in the `register(api)` hook below; the old
 * module-scope `ToolOp.register(...)` side effects were stripped during the
 * addon-api migration.
 */

import {addonManager} from '@framework/api'
import {TetMeshTool} from './tetmesh.js'
import {MakeTetMesh, TetSmoothVerts, TetToMesh, Tetrahedralize, TetTest, TetFixNormalsOp} from './tet_ops.js'

if (!addonManager.idmap.has('tetmesh')) {
  addonManager.registerInternalAddon({
    manifest: {
      id          : 'tetmesh',
      name        : 'Tet Mesh',
      version     : '1.0.0',
      entry       : 'internal',
      dependencies: ['mesh'],
      buildMode   : 'prebuilt',
      author      : 'joeedh',
      description : 'Tetrahedral mesh editing toolmode.',
    },
    exports: {
      // Keep in sync with addons/builtin/tetmesh/src/api.ts.
      tetmesh: {TetMeshTool},
    },
    register(api) {
      api.registerAll(MakeTetMesh, TetSmoothVerts, TetToMesh, Tetrahedralize, TetTest, TetFixNormalsOp, TetMeshTool)
    },
  })
}
