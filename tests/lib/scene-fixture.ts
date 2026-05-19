/**
 * Headless test fixture for save/load round-trip tests.
 *
 * Status: SCAFFOLD. The real implementation lands later in the refactor — see
 * /root/.claude/plans/we-will-be-working-peppy-wreath.md §6 step 6 and §7.2 Layer C.
 *
 * The shape of the API is fixed now so tests in later steps can be written against
 * it even before the bootstrap is plumbed. Calls to the unimplemented helpers
 * throw a clearly-labeled NotImplementedError so we never silently get a
 * green-but-meaningless test.
 *
 * Tests that depend on this fixture (currently deferred):
 *   - roundtrip_mesh         — verify Mesh+customdata round-trip
 *   - roundtrip_missing_addon — verify MissingDataBlock preserves bytes when an
 *     addon is disabled between save and load (the placeholder lives at
 *     scripts/core/missing_addon.ts; its hookpoints in scripts/core/appstate.ts
 *     are already in place as of step 4)
 *   - roundtrip_missing_toolmode — needs the nstructjs onUnknownClass hook
 *     (step 4 follow-up: patch vendor/nstructjs)
 */

export class NotImplementedError extends Error {
  constructor(name: string) {
    super(`scene-fixture: ${name} not implemented yet (see plan §6 step 4)`)
    this.name = 'NotImplementedError'
  }
}

export interface HeadlessAppOptions {
  /** addon ids to enable (e.g. ['mesh', 'mesh_edit']). Default: []. */
  addons?: string[]
}

/** Returns a minimal AppState wired with jsdom globals and the addon manager. */
export function makeHeadlessAppState(_opts: HeadlessAppOptions = {}): unknown {
  throw new NotImplementedError('makeHeadlessAppState')
}

/** Serializes the current scene + datalib to a binary blob. */
export function saveSceneToBytes(_app: unknown): Uint8Array {
  throw new NotImplementedError('saveSceneToBytes')
}

/** Inverse of saveSceneToBytes. */
export function loadSceneFromBytes(_bytes: Uint8Array, _opts: HeadlessAppOptions = {}): unknown {
  throw new NotImplementedError('loadSceneFromBytes')
}
