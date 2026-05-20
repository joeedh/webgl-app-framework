/**
 * Mesh addon entry point.
 *
 * Today (during the refactor) this entry is *not* loaded as a separate addon
 * bundle by `tools/build-addons.js`. The mesh subsystem still ships in the
 * main bundle, and `scripts/mesh/addon_register.ts` registers it with
 * AddonManager as an "internal" addon at app start. See plan §6 step 6.
 *
 * Once the refactor moves all `scripts/mesh/*` files into
 * `addons/builtin/mesh/src/` and removes the side-effect imports from
 * `scripts/entry_point.js`, this file becomes the real addon entry — the
 * `register()` hook below already wires every registration the in-bundle
 * `addon_register.ts` does today. Keeping both alive in parallel lets us
 * flip the switch atomically when the file move lands.
 */

import type {AddonAPI, IAddon, IAddonDefine} from '../../../../scripts/addon/addon_base.js'

export const addonDefine: IAddonDefine = {
  name       : 'Mesh',
  version    : [1, 0, 0],
  author     : 'joeedh',
  description: 'Mesh DataBlock, custom data, BVH, and mesh utilities.',
}

export function register(_api: AddonAPI<IAddon>) {
  // Intentionally empty: the in-bundle `scripts/mesh/addon_register.ts` is
  // what currently populates the registry. When mesh moves out of the main
  // bundle, port that logic here.
}

export function unregister() {
  // Same as register() — disabled while mesh ships in-bundle.
}

export function handleArgv() {}
export function validArgv() {}
