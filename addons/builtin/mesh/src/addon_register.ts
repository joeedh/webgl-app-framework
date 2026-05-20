/**
 * Registers the mesh subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 6 and §3.2.
 *
 * Publishes the FULL runtime surface the rest of the app (and third-party
 * addons) needs under `exports.mesh` / `exports.mesh_utils` / `exports.bvh` /
 * `exports.unwrapping`. After plan §3.2, `scripts/addon/addon_base.ts` no
 * longer imports mesh paths directly — `AddonAPI` looks these up here via
 * `window._addons.getAddonAPI('mesh')`.
 */

import {addonManager, setInsetHoleOp, setShapesObjLoader} from '@framework/api'
import {ALL_MESH_REGISTRATIONS} from './register_classes.js'
import * as mesh from './mesh.js'
import {setMeshTools} from './mesh.js'
import {MeshTools} from './mesh_stdtools.js'
import {InsetHoleOp} from './mesh_extrudeops.js'
import {readOBJ} from './objloader.js'

// Inject MeshTools into mesh.ts. mesh.ts cannot statically import
// mesh_stdtools.ts because that pulls select_ops → mesh_ops_base → mesh
// and creates a TDZ-hazardous import cycle.
setMeshTools(MeshTools)

// Inject InsetHoleOp into widget_tools.ts. Same cycle hazard:
// widget_tools → mesh_extrudeops → mesh_ops_base → mesh.
setInsetHoleOp(InsetHoleOp)

// Inject readOBJ into webgl/simplemesh_shapes.ts. Same cycle hazard:
// simplemesh_shapes is re-exported by framework_api.ts; statically importing
// objloader.js → mesh.ts from it would re-enter mesh.ts before
// SceneObjectData is bound.
setShapesObjLoader(readOBJ)
import * as mesh_base from './mesh_base.js'
import * as mesh_types from './mesh_types.js'
import * as customdata from './customdata.js'
import * as mesh_utils from './mesh_utils.js'
import * as paramizer from './mesh_paramizer.js'
import * as displacement from './mesh_displacement.js'
import * as curvature from './mesh_curvature.js'
import * as curvature_test from './mesh_curvature_test.js'
import * as unwrapping from './unwrapping.js'
import * as bvh from './bvh.js'
import {MeshOp, MeshDeformOp} from './mesh_ops_base.js'
import {MeshOpBaseUV} from './mesh_uvops_base.js'
import {KDrawModes} from './mesh_curvature_test.js'

// Side-effect import: registers `OpaqueCustomDataElem` with core's
// `missing_addon` hook so files referencing unloaded customdata classes can
// round-trip. See plan §3.
import './missing_customdata.js'

const meshExports = {
  ...mesh,
  ...mesh_base,
  ...mesh_types,
  ...customdata,
  utils: mesh_utils,
  paramizer,
  displacement,
  curvature,
  curvature_test,
  unwrapping,
  bvh,
  KDrawModes,
  MeshOp,
  MeshDeformOp,
  MeshOpBaseUV,
  // BVH classes are also exposed at the top level for backward compatibility
  // with `api.mesh.BVH` consumers.
  ...bvh,
}

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
      mesh      : meshExports,
      mesh_utils: {...mesh_utils},
      bvh       : {...bvh},
      unwrapping: {...unwrapping},
    },
    register(api) {
      api.registerAll(...ALL_MESH_REGISTRATIONS)
    },
  })
}
