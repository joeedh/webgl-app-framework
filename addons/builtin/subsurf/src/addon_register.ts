/**
 * Registers the subsurf subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 7.
 *
 * Same model as scripts/mesh/addon_register.ts: ships in the main bundle,
 * announces itself so other addons can declare `dependencies: ['subsurf']`
 * and resolve its exports via `@addon/subsurf/api`.
 */

import {addonManager} from '@framework/api'
import {ccSmooth, createPatches, loopSubdivide, subdivide} from './subsurf_mesh.js'
import {
  CubicPatch,
  CubicPatchFields,
  CubicPatchFlags,
  Patch4,
  PatchBase,
  SSPatch,
  bernstein,
  bspline,
} from './subsurf_patch.js'
import {PCOLOR, PCOS, PEID, PTOT, PatchData, PatchList} from './subsurf_base.js'

if (!addonManager.idmap.has('subsurf')) {
  addonManager.registerInternalAddon({
    manifest: {
      id          : 'subsurf',
      name        : 'Subsurf',
      version     : '1.0.0',
      entry       : 'internal',
      dependencies: ['mesh'],
      buildMode   : 'prebuilt',
      author      : 'joeedh',
      description : 'Catmull-Clark subdivision surfaces and patch tessellation.',
    },
    exports: {
      // Keep in sync with `addons/builtin/subsurf/src/api.ts`.
      subsurf: {
        ccSmooth,
        createPatches,
        loopSubdivide,
        subdivide,
        CubicPatchFields,
        CubicPatchFlags,
        bernstein,
        bspline,
        CubicPatch,
        SSPatch,
        Patch4,
        PatchBase,
        PCOS,
        PEID,
        PCOLOR,
        PTOT,
        PatchList,
        PatchData,
      },
    },
  })
}
