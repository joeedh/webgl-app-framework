/**
 * Public API surface for the `mesh` builtin addon.
 *
 * This file is the canonical typed entry point for any addon that wants to use
 * mesh types — it's referenced from tsconfig.json's `paths` alias as
 * `@addon/mesh/api`, so consumer addons can write:
 *
 *     import {Mesh, MeshFlags, BVH} from '@addon/mesh/api'
 *
 * and get full TypeScript types. At runtime, the resolver returns the same
 * symbols that the mesh subsystem exports through `_addons.getAddonAPI('mesh').
 * exports['mesh']` (populated by scripts/mesh/addon_register.ts). Because
 * mesh currently ships in the main bundle as an "internal" addon (see plan
 * §6 step 6), the static re-exports below resolve to the in-bundle objects
 * directly — no runtime indirection. When mesh moves to a separately-built
 * artifact, this file becomes the lookup shim that calls
 * `_addons.getAddonAPI('mesh').exports.mesh.*` and esbuild marks
 * `@addon/mesh/api` external so consumer bundles stay small.
 *
 * Keep this surface stable: every named export here is part of the mesh
 * addon's public contract. Adding is fine; removing/renaming is a breaking
 * change to consumer addons.
 */

// ---- core types --------------------------------------------------------------
export {Mesh, MeshFlags, MeshTypes} from '../../../../scripts/mesh/mesh.js'
export type {Vertex, Handle, Edge, Loop, LoopList, Face, Element} from '../../../../scripts/mesh/mesh_types.js'

// ---- custom data -------------------------------------------------------------
export {CustomDataElem, CustomData, AttrRef, CDFlags} from '../../../../scripts/mesh/customdata.js'
export type {CDRef, ICustomDataElemConstructor, ICustomDataElemDef} from '../../../../scripts/mesh/customdata.js'
export {CDElemArray, EmptyCDArray} from '../../../../scripts/mesh/mesh_base.js'
export type {ICustomDataCapable} from '../../../../scripts/mesh/mesh_base.js'

// ---- spatial -----------------------------------------------------------------
export {BVH, BVHFlags, BVHSettings, BVHTri} from '../../../../scripts/util/bvh.js'
export type {IBVHCreateArgs, IBVHVertex} from '../../../../scripts/util/bvh.js'

// ---- ops + utilities ---------------------------------------------------------
export * as mesh_utils from '../../../../scripts/mesh/mesh_utils.js'
export * as customdata from '../../../../scripts/mesh/customdata.js'
