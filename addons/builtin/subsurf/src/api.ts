/**
 * Public API surface for the `subsurf` builtin addon. Depends on `mesh`.
 *
 * Imported by consumer addons as:
 *
 *     import {subdivide, ccSmooth, loopSubdivide} from '@addon/subsurf/api'
 *
 * Resolved by tsconfig.json's `paths` alias. See plan §6 step 7.
 */

export {ccSmooth, createPatches, loopSubdivide, subdivide} from '../../../../scripts/subsurf/subsurf_mesh.js'
export {CubicPatchFields, CubicPatchFlags, bernstein, bspline, CubicPatch, SSPatch, Patch4, PatchBase} from '../../../../scripts/subsurf/subsurf_patch.js'
export {PCOS, PEID, PCOLOR, PTOT, PatchList, PatchData} from '../../../../scripts/subsurf/subsurf_base.js'
