/**
 * Subsurf addon entry point. See plan §6 step 7.
 *
 * Like `mesh`, subsurf currently ships in the main bundle and announces
 * itself via `scripts/subsurf/addon_register.ts`. This entry is the future
 * out-of-bundle home; its register() is intentionally empty today.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'Subsurf',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Catmull-Clark subdivision surfaces and patch tessellation.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
