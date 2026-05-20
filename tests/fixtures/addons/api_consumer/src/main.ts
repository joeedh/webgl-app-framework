/**
 * Test fixture: imports from `@addon/mesh/api` so the integration test can
 * verify the resolver plugin emits a runtime-lookup stub instead of
 * inlining the mesh source. See tests/integration/addon_api_resolver.test.ts.
 *
 * The named imports here are deliberately the ones the mesh addon's
 * api.ts exports as values (not types). If any of these names disappear
 * from mesh's api.ts the build will fail loudly.
 */

import {Mesh, MeshFlags, BVH, mesh_utils} from '@addon/mesh/api'

export const seen: string[] = []

export const addonDefine = {
  name       : 'API Consumer',
  version    : 1,
  author     : 'tests',
  description: 'Smoke-test for the @addon/<id>/api resolver',
} as const

/** Returns the runtime-resolved Mesh constructor so the test can confirm it
 * matched the value the host registered. */
export function getResolvedSymbols() {
  return {Mesh, MeshFlags, BVH, mesh_utils}
}

export function register() {
  seen.push('register')
}

export function unregister() {
  seen.push('unregister')
}
