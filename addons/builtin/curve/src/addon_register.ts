/**
 * Registers the curve subsystem with AddonManager as an internal builtin
 * addon. See plan §6 step 8.
 *
 * Same model as addons/builtin/{mesh,subsurf,mesh_edit}/src/addon_register.ts:
 * the toolmode + CurveSpline DataBlock now live in this addon's src/, and
 * we announce ourselves so other addons can declare `dependencies: ['curve']`
 * and resolve our exports via `_addons.getAddonAPI('curve').exports['curve']`
 * or `@addon/curve/api`.
 *
 * Registration (ToolMode/DataBlock/CustomDataElem/nstructjs) is dispatched
 * through `api.registerAll(...)` in the `register(api)` hook below; the
 * old module-scope `ToolMode.register(...)` / `nstructjs.register(...)`
 * side effects were stripped during the addon-api migration.
 */

import {addonManager} from '@framework/api'
import {CurveSpline} from './curve.js'
import {KnotDataLayer} from './curve_knot.js'
import {CurveToolBase} from './curvetool.js'
import {CurveToolOverlay} from './curvetool_overlay.js'

if (!addonManager.idmap.has('curve')) {
  addonManager.registerInternalAddon({
    manifest: {
      id          : 'curve',
      name        : 'Curve',
      version     : '1.0.0',
      entry       : 'internal',
      dependencies: ['mesh', 'mesh_edit'],
      buildMode   : 'prebuilt',
      author      : 'joeedh',
      description : 'Bezier curve editing toolmode + CurveSpline DataBlock.',
    },
    exports: {
      // Keep in sync with addons/builtin/curve/src/api.ts.
      curve: {CurveSpline, KnotDataLayer, CurveToolBase, CurveToolOverlay},
    },
    register(api) {
      api.registerAll(CurveSpline, KnotDataLayer, CurveToolBase, CurveToolOverlay)
    },
  })
}
