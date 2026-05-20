/**
 * Registers each in-bundle toolmode subsystem with AddonManager as an internal
 * builtin addon. See plan §6 step 8.
 *
 * Same model as scripts/mesh/addon_register.ts: the toolmode classes still
 * live in scripts/editors/view3d/tools/, but each one announces itself to the
 * addon registry so it shows up in the addon UI, can be enabled/disabled, and
 * other addons can declare it as a dependency.
 *
 * `ObjectEditor` (selecttool.ts) and `PanToolMode` (view3d_panmode.ts) stay
 * in core proper — they're always-present infrastructure, not addons.
 */

import addonManager from '../../../addon/addon.js'

// Side-effect imports — each module's top-level `ToolMode.register(...)` runs
// at import time, so by the time we register the addon below the classes are
// in the ToolModes[] enum.
//
// tetmesh + mesh_edit + curve are intentionally absent: each converted to its
// own out-of-bundle per-addon build (see addons/builtin/{tetmesh,mesh_edit,curve}/)
// and is loaded via the addon pipeline at startup. See plan §6 step 8.
import {BVHToolMode} from './pbvh.js'
import {PaintToolModeBase} from './pbvh_base.js'
import {SculptCorePaintMode} from './sculptcore.js'

function maybeRegister(
  id: string,
  manifest: Parameters<typeof addonManager.registerInternalAddon>[0]['manifest'],
  exports: Parameters<typeof addonManager.registerInternalAddon>[0]['exports']
) {
  if (addonManager.idmap.has(id)) return
  addonManager.registerInternalAddon({manifest, exports})
}

maybeRegister(
  'pbvh_sculpt',
  {
    id          : 'pbvh_sculpt',
    name        : 'PBVH Sculpt',
    version     : '1.0.0',
    entry       : 'internal',
    dependencies: ['mesh'],
    buildMode   : 'prebuilt',
    author      : 'joeedh',
    description : 'Legacy mesh sculpt toolmode (BVH-based dyntopo + paint).',
  },
  {pbvh_sculpt: {BVHToolMode, PaintToolModeBase}}
)

maybeRegister(
  'sculptcore',
  {
    id          : 'sculptcore',
    name        : 'Sculptcore',
    version     : '1.0.0',
    entry       : 'internal',
    dependencies: ['mesh'],
    buildMode   : 'prebuilt',
    author      : 'joeedh',
    description : 'Sculptcore-backed paint/sculpt toolmode.',
  },
  {sculptcore: {SculptCorePaintMode}}
)

// tetmesh's in-bundle registration removed: the addon now ships as a
// separately-built bundle under build/addons/tetmesh/ and is loaded via
// AddonManager.loadAddonIndex().
