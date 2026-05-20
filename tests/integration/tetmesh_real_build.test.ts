/**
 * @jest-environment node
 *
 * Verifies that the tetmesh addon now builds as a real out-of-bundle artifact
 * via tools/build-addons.js, instead of being registered in-bundle via
 * scripts/editors/view3d/tools/addon_register.ts. Deferred follow-up #3.
 *
 * What this test does NOT do (would need the full browser pathux runtime):
 *   - Actually instantiate TetMeshTool and exercise its keymap.
 *   - Load the bundle in a real browser context — pathux's UI machinery
 *     touches DOM/CSS in ways jsdom doesn't fully emulate. Smoke-tested via
 *     tests/smoke/SMOKE.md.
 *
 * What it DOES do:
 *   1. Asserts `build/addons/tetmesh/src/main.js` exists and contains
 *      TetMeshTool's source markers (since it's NOT going through the
 *      `@addon/*` resolver, the toolmode class IS inlined into this bundle).
 *   2. Asserts the in-bundle registration site in
 *      `scripts/editors/view3d/tools/addon_register.ts` no longer mentions
 *      TetMeshTool — confirming the addon is loaded via the dynamic
 *      pipeline, not as a maybeRegister call.
 *   3. Asserts the addon index lists tetmesh with `dependencies: ['mesh']`
 *      so the loader topo-sorts it after mesh.
 */

import {execSync} from 'node:child_process'
import fs from 'node:fs'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..', '..')
const TETMESH_BUNDLE = Path.join(REPO_ROOT, 'build/addons/tetmesh/src/main.js')
const ADDON_REGISTER_TS = Path.join(REPO_ROOT, 'scripts/editors/view3d/tools/addon_register.ts')
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

  test('tetmesh bundle exists and includes TetMeshTool', () => {
    expect(fs.existsSync(TETMESH_BUNDLE)).toBe(true)
    const built = fs.readFileSync(TETMESH_BUNDLE, 'utf-8')
    // The class is inlined because tetmesh.ts is the addon's local source —
    // not routed through @addon/*. Spot-check a hallmark string.
    expect(built).toContain('TetMeshTool')
    // Registration now goes through `api.register(TetMeshTool)` in the
    // addon's `register(api)` hook instead of module-scope
    // `ToolMode.register(TetMeshTool)` — see the addon-api migration.
    expect(built).toMatch(/api\.register\s*\(\s*TetMeshTool/)
  })

  test('addon_register.ts no longer mentions TetMeshTool', () => {
    const src = fs.readFileSync(ADDON_REGISTER_TS, 'utf-8')
    // The import block keeps the class names for the still-in-bundle
    // toolmodes (SculptCorePaintMode, ...) but tetmesh.js should be gone
    // entirely. mesh_edit and curve have likewise moved into their own
    // addon directories (plan §6 step 8) and are no longer referenced here.
    expect(src).not.toMatch(/\bTetMeshTool\b/)
    expect(src).not.toContain(`from './tetmesh.js'`)
    expect(src).not.toMatch(/\bCurveToolBase\b/)
    // sanity-check the other toolmodes are still referenced
    expect(src).toMatch(/SculptCorePaintMode/)
  })

  test('index.json lists tetmesh with mesh as a dependency', () => {
    const index = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf-8'))
    const tet = index.find((e: {manifest: {id: string}}) => e.manifest.id === 'tetmesh')
    expect(tet).toBeDefined()
    expect(tet.manifest.dependencies).toEqual(['mesh'])
    expect(tet.builtin).toBe(true)
    expect(tet.kind).toBe('builtin')
  })
})
