/**
 * Registers the mesh subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 6.
 *
 * Run as a side effect of import from scripts/entry_point.js (immediately
 * after the mesh module imports themselves run, so the classes are alive by
 * the time we publish them). Other addons can then declare
 * `dependencies: ['mesh']` in their manifests and resolve mesh exports via
 * `_addons.getAddonAPI('mesh').exports.mesh.*` — or via the typed
 * `@addon/mesh/api` re-exports.
 *
 * When `scripts/mesh/*` moves into `addons/builtin/mesh/src/*` and gets
 * built as a separate bundle by tools/build-addons.js, this file goes away
 * and the addon's `src/main.ts.register()` runs the same registration.
 */

import addonManager from '../../../../scripts/addon/addon.js'
import {Mesh, MeshFlags, MeshTypes} from './mesh.js'
import {CustomDataElem, CustomData, AttrRef, CDFlags} from './customdata.js'
import {CDElemArray, EmptyCDArray} from './mesh_base.js'
import * as mesh_utils from './mesh_utils.js'
import {BVH, BVHFlags, BVHSettings, BVHTri} from './bvh.js'

// Skip re-registering across HMR / repeated entry-point loads.
if (!addonManager.idmap.has('mesh')) {
  addonManager.registerInternalAddon({
    manifest: {
      id          : 'mesh',
      name        : 'Mesh',
      version     : '1.0.0',
      entry       : 'internal',
      dependencies: [],
      buildMode   : 'prebuilt',
      author      : 'joeedh',
      description : 'Mesh DataBlock, custom data, BVH, and mesh utilities.',
    },
    exports: {
      // Keep this in sync with `addons/builtin/mesh/src/api.ts` so the typed
      // `@addon/mesh/api` shim resolves to the same surface at runtime.
      mesh: {
        Mesh,
        MeshFlags,
        MeshTypes,
        CustomDataElem,
        CustomData,
        AttrRef,
        CDFlags,
        CDElemArray,
        EmptyCDArray,
        mesh_utils,
        BVH,
        BVHFlags,
        BVHSettings,
        BVHTri,
      },
    },
  })
}
