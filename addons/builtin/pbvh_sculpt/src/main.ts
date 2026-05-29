/**
 * PBVH Sculpt addon entry point.
 *
 * Ships in the main bundle: its toolmode classes live in
 * `scripts/editors/view3d/tools/` and register themselves into the ToolModes
 * enum at module scope (loaded via entry_point's `tools.js` import). This addon
 * announces itself + publishes its surface so it appears in the addon UI and
 * peers can declare `dependencies: ['pbvh_sculpt']`. Registered as an in-bundle
 * builtin source by `addons/builtin/builtin_registry.ts`.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'
import {BVHToolMode} from '../../../../scripts/editors/view3d/tools/pbvh.js'
import {PaintToolModeBase} from '../../../../scripts/editors/view3d/tools/pbvh_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'PBVH Sculpt',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Legacy mesh sculpt toolmode (BVH-based dyntopo + paint).',
}

export function register(api: AddonAPI<IAddon>) {
  // Keep in sync with addons/builtin/pbvh_sculpt/src/api.ts. The classes are
  // registered into the ToolModes enum at module scope (in scripts/.../tools);
  // here we only publish the runtime surface for peers.
  api.exportNamespace('pbvh_sculpt', {BVHToolMode, PaintToolModeBase})
}

export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
