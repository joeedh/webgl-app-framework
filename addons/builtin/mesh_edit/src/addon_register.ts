/**
 * Registers the mesh_edit subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 8.
 *
 * Same model as addons/builtin/{mesh,subsurf}/src/addon_register.ts: ships
 * in the main bundle, announces itself so other addons can declare
 * `dependencies: ['mesh_edit']` and resolve its exports via
 * `_addons.getAddonAPI('mesh_edit').exports['mesh_edit']` or
 * `@addon/mesh_edit/api`.
 *
 * Registration of MeshToolBase + MeshEditor is dispatched through
 * `api.registerAll(...)` in the `register(api)` hook below.
 */

import {addonManager} from '@framework/api'
import {MeshToolBase} from './meshtool.js'
import {MeshEditor} from './mesheditor.js'

if (!addonManager.idmap.has('mesh_edit')) {
  addonManager.registerInternalAddon({
    manifest: {
      id          : 'mesh_edit',
      name        : 'Mesh Edit',
      version     : '1.0.0',
      entry       : 'internal',
      dependencies: ['mesh'],
      buildMode   : 'prebuilt',
      author      : 'joeedh',
      description : 'Mesh-editing toolmode (vertex/edge/face selection, transform, ops).',
    },
    exports: {
      // Keep in sync with addons/builtin/mesh_edit/src/api.ts.
      mesh_edit: {MeshToolBase, MeshEditor},
    },
    register(api) {
      api.registerAll(MeshToolBase, MeshEditor)
    },
  })
}
