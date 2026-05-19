/**
 * Curve addon entry point. Placeholder — today the toolmode is registered
 * in-bundle. See plan §6 step 8.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'Curve',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Bezier curve editing toolmode.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
