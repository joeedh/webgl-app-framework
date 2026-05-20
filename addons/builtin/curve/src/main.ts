/**
 * Curve addon entry point. Ships in the main bundle today via
 * `addon_register.ts`; this main.ts exists to satisfy the per-addon
 * out-of-bundle build pipeline. See plan §6 step 8.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'
import './addon_register.js'

export const addonDefine: IAddonDefine = {
  name       : 'Curve',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Bezier curve editing toolmode + CurveSpline DataBlock.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
