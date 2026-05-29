/**
 * @jest-environment node
 *
 * Verifies that the tetmesh addon builds as a real per-addon artifact via
 * tools/build-addons.js (instead of the old in-bundle
 * `scripts/editors/view3d/tools/addon_register.ts` registration, which has been
 * removed by the unified-registrator refactor).
 *
 * What this test does NOT do (would need the full browser pathux runtime):
 *   - Actually instantiate TetMeshTool and exercise its keymap.
 *   - Load the bundle in a real browser context.
 *
 * What it DOES do:
 *   1. Asserts `build/addons/tetmesh/src/main.js` exists and registers
 *      TetMeshTool via the addon-api `register(api)` hook.
 *   2. Asserts the old in-bundle registration sites are gone: the per-addon
 *      `addon_register.ts` files were deleted, and the view3d tools index no
 *      longer mentions TetMeshTool.
 *   3. Asserts the addon index lists tetmesh with `dependencies: ['mesh']` so
 *      the loader topo-sorts it after mesh.
 */

import {execSync} from 'node:child_process'
import fs from 'node:fs'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..', '..')
const TETMESH_BUNDLE = Path.join(REPO_ROOT, 'build/addons/tetmesh/src/main.js')
const TOOLS_TS = Path.join(REPO_ROOT, 'scripts/editors/view3d/tools/tools.ts')
const OLD_ADDON_REGISTER_TS = Path.join(REPO_ROOT, 'scripts/editors/view3d/tools/addon_register.ts')
const INDEX_JSON = Path.join(REPO_ROOT, 'build/addons/index.json')

describe('tetmesh as a real per-addon bundle', () => {
  beforeAll(() => {
    if (!fs.existsSync(TETMESH_BUNDLE)) {
      execSync('node tools/build-addons.js --include-fixtures', {
        cwd  : REPO_ROOT,
        stdio: 'pipe',
      })
    }
  }, 60000)

  test('tetmesh bundle exists and registers TetMeshTool via the addon-api hook', () => {
    expect(fs.existsSync(TETMESH_BUNDLE)).toBe(true)
    const built = fs.readFileSync(TETMESH_BUNDLE, 'utf-8')
    // The class is inlined because tetmesh.ts is the addon's local source.
    expect(built).toContain('TetMeshTool')
    // Registration goes through `api.registerAll(...)` in the addon's
    // `register(api)` hook (no module-scope ToolMode.register side effect).
    expect(built).toMatch(/registerAll\s*\([^)]*TetMeshTool/)
  })

  test('the old in-bundle registration site is gone', () => {
    // The per-addon addon_register.ts side-effect files were deleted by the
    // unified-registrator refactor (registration now lives in each addon's
    // main.ts register() hook, wired through builtin_registry.ts).
    expect(fs.existsSync(OLD_ADDON_REGISTER_TS)).toBe(false)
    // The view3d tools index no longer references the tetmesh toolmode.
    const tools = fs.readFileSync(TOOLS_TS, 'utf-8')
    expect(tools).not.toMatch(/\bTetMeshTool\b/)
  })

  test('index.json lists tetmesh with mesh as a dependency', () => {
    const index = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf-8'))
    const tet = index.find((e: {manifest: {id: string}}) => e.manifest.id === 'tetmesh')
    expect(tet).toBeDefined()
    expect(tet.manifest.dependencies).toEqual(['mesh'])
  })
})
