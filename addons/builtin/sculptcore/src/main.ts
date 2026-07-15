/**
 * Sculptcore addon entry point.
 *
 * Ships in the main bundle: its toolmode class lives in
 * `scripts/editors/view3d/tools/sculptcore.js` and registers itself into the
 * ToolModes enum at module scope (loaded via entry_point's `tools.js` import).
 * This addon announces itself + publishes its surface. Registered as an
 * in-bundle builtin source by `addons/builtin/builtin_registry.ts`.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'
import {SculptCorePaintMode} from '../../../../scripts/editors/view3d/tools/sculptcore.js'

export const addonDefine: IAddonDefine = {
  name       : 'Sculptcore',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Sculptcore-backed paint/sculpt toolmode.',
}

export function register(api: AddonAPI<IAddon>) {
  // Keep in sync with addons/builtin/sculptcore/src/api.ts. The class registers
  // into the ToolModes enum at module scope; here we only publish the surface.
  api.exportNamespace('sculptcore', {SculptCorePaintMode})

  // Contribute to the View3D "Add" menu (cleared automatically on disable).
  api.menuEntries('add', ['litemesh.add_cube(goalFaces=0)'])
  api.menuEntries('add', ['litemesh.add_cube(goalFaces=58806 sphere=1.0)|Add Sphere (Sculptcore)'])
  api.menuEntries('add', ['litemesh.add_plane()'])
}

export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
