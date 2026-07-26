/**
 * The integration suites that dominate wall-clock. They're excluded from the
 * default run (`pnpm test`) and only run via `pnpm test:slow`.
 *
 * Measured wall time, 2026-07-26 full run — these five are ~90% of the total:
 *   sculptcore_multires    485.0s (native pass; alone it *is* that pass)
 *   sculptcore_vdm_render  182.9s (native)
 *   node_editor_ops         92.9s (wasm)
 *   litemesh_attr_render    92.6s (native)
 *   litemesh_quad_remesh    43.6s (native)
 *
 * Keep this list in sync with what a fresh timing run says; re-measure with
 * `--json` and rank by suite `endTime - startTime` (per-*test* durations are
 * misleading — the NW.js boot is billed to `beforeAll`, not to a test).
 */

export const SLOW_SUITES = [
  'sculptcore_multires',
  'sculptcore_vdm_render',
  'node_editor_ops',
  'litemesh_attr_render',
  'litemesh_quad_remesh',
]

/** testMatch globs selecting exactly the slow suites. */
export const SLOW_GLOBS = SLOW_SUITES.map((n) => `<rootDir>/integration/${n}.test.ts`)

/**
 * testPathIgnorePatterns excluding them. Deliberately anchored on the filename
 * only — jest rewrites `/` in these patterns to the platform separator, so a
 * directory-qualified regex is fragile on Windows.
 */
export const SLOW_IGNORE = SLOW_SUITES.map((n) => `${n}\\.test\\.ts$`)

/** True when the current invocation should run the slow suites instead. */
export function isSlowRun() {
  return process.env.SC_TEST_SLOW === '1'
}
