/**
 * Mesh Edit addon entry point. See plan §6 step 8.
 *
 * Placeholder: today the toolmode ships in the main bundle and announces
 * itself via scripts/editors/view3d/tools/addon_register_mesh_edit.ts.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'Mesh Edit',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Mesh-editing toolmode.',
}

export function register(_api: AddonAPI<IAddon>) {}
export function unregister() {}
export function handleArgv() {}
export function validArgv() {}
