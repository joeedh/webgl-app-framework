/**
 * Tet Mesh addon entry point.
 *
 * This is the first addon converted to a real out-of-bundle per-addon
 * esbuild build (deferred follow-up #3). When the AddonManager loads
 * `build/addons/tetmesh/src/main.js`, the side-effect import below
 * pulls in `./tetmesh.js` whose module body calls
 * `ToolMode.register(TetMeshTool)` and `nstructjs.register(TetMeshTool)`.
 *
 * The `register()` hook below is intentionally empty: registration
 * already happened at module-load time via tetmesh.js's side effects.
 * (We could move those calls here, but doing so would also require
 * shifting nstructjs.register out of module scope — the static STRUCT
 * declaration depends on early registration. Leaving things as-is
 * matches the pre-move behavior.)
 *
 * The corresponding in-bundle entry in
 * `scripts/editors/view3d/tools/addon_register.ts` is removed alongside
 * this commit; the addon is now driven entirely by the per-addon build
 * pipeline.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

// Side-effect import — runs TetMeshTool's module body which calls
// ToolMode.register / nstructjs.register.
import './tetmesh.js'

export const addonDefine: IAddonDefine = {
  name       : 'Tet Mesh',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Tetrahedral mesh editing toolmode.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
