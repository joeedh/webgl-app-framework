/**
 * Subsurf addon entry point.
 *
 * Subsurf currently ships in the main bundle as an "internal" addon (mesh
 * grids transitively pull in subsurf for patch tessellation, so factoring it
 * out into its own per-addon bundle would create a build-time
 * mesh ↔ subsurf cycle). The actual registration runs from
 * `./addon_register.ts`, side-effect-imported by `scripts/entry_point.js`.
 *
 * When the mesh ↔ subsurf source-level cycle is broken (e.g. by moving the
 * grid-subsurf bridge code into subsurf, or by routing through
 * `@addon/subsurf/api` in mesh once the addon-api resolver is wired into
 * the main esbuild pass), this entry can convert to the tetmesh pattern:
 * a side-effect `import './addon_register.js'` here + per-addon esbuild
 * driver in `tools/build-addons.js`. See plan §6 step 7.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'

export const addonDefine: IAddonDefine = {
  name       : 'Subsurf',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Catmull-Clark subdivision surfaces and patch tessellation.',
}

export function register(_api: AddonAPI<IAddon>) {
  // Intentionally empty: ./addon_register.ts (side-effect-imported from
  // entry_point.js) populates AddonManager while subsurf ships in-bundle.
}

export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
