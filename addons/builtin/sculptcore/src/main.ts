/**
 * Sculptcore addon entry point. Placeholder — registered in-bundle today.
 * See plan §6 step 8.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'Sculptcore',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Sculptcore-backed paint/sculpt toolmode.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
