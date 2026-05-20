/**
 * PBVH Sculpt addon entry point. Placeholder — registered in-bundle today.
 * See plan §6 step 8.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'

export const addonDefine: IAddonDefine = {
  name       : 'PBVH Sculpt',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Legacy mesh sculpt toolmode (BVH-based dyntopo + paint).',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
