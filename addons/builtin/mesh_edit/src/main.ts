/**
 * Mesh Edit addon entry point. See plan §6 step 8.
 *
 * Today mesh_edit ships in the main bundle as an "internal" addon — see
 * `./addon_register.ts`, which `scripts/entry_point.js` side-effect imports.
 * This `main.ts` is the entry recorded in `manifest.json` so the per-addon
 * esbuild driver still produces a `build/addons/mesh_edit/` artifact, but at
 * runtime the internal registration wins and the out-of-bundle load is
 * skipped (AddonManager.loadFromManifests filters preloaded ids).
 */

import type {AddonAPI, IAddon, IAddonDefine} from '@framework/api'

// Side-effect import — runs `addonManager.registerInternalAddon(...)`
// which publishes mesh_edit exports and wires its `register(api)` hook.
import './addon_register.js'

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
