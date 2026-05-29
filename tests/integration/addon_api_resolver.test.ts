/**
 * @jest-environment node
 *
 * End-to-end test for the `@addon/<id>/api` runtime resolver (deferred
 * follow-up #2). The api_consumer fixture imports symbols from
 * `@addon/mesh/api`; the build pipeline replaces those imports with a tiny
 * lookup stub that reads from `globalThis._addons.getAddonAPI('mesh').
 * exports.mesh.*` at module-load time.
 *
 * This test:
 *   1. Runs `node tools/build-addons.js --include-fixtures` to produce
 *      `build/addons/api_consumer/src/main.js`.
 *   2. Asserts that the built bundle contains the lookup stub and does NOT
 *      contain the mesh source code (so we know the resolver did its job).
 *   3. Sets up a mock `_addons` global with stand-in mesh exports, then
 *      dynamic-imports the built bundle and confirms the resolved symbols
 *      match the mocks. Demonstrates that consumer addons get late-bound
 *      values from the host.
 *
 * Node test environment so we can use `fs` + `execSync` and so esbuild-wasm
 * (loaded transitively by the source-mode install path elsewhere) isn't
 * tripped up by jsdom's realm split.
 */

import {execSync} from 'node:child_process'
import fs from 'node:fs'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..', '..')
const BUILT_ENTRY = Path.join(REPO_ROOT, 'build/addons/api_consumer/src/main.js')

/**
 * Reads the built entry plus any sibling chunk(s) it statically imports, joined.
 * esbuild's code-splitting hoists the `@addon/mesh/api` stub into a shared
 * `_chunks/` module when more than one addon imports it (e.g. api_consumer +
 * tetmesh), so the stub may live in a chunk rather than inline in main.js.
 */
function readBuiltWithChunks(entry: string): string {
  const seen = new Set<string>()
  const parts: string[] = []
  const visit = (file: string) => {
    if (seen.has(file) || !fs.existsSync(file)) return
    seen.add(file)
    const src = fs.readFileSync(file, 'utf-8')
    parts.push(src)
    for (const m of src.matchAll(/from\s*["']([^"']+\.js)["']/g)) {
      visit(Path.resolve(Path.dirname(file), m[1]))
    }
  }
  visit(entry)
  return parts.join('\n')
}

interface MockAddonAPI {
  exports: {[name: string]: Record<string, unknown>}
}

describe('addon_api_plugin (runtime resolver)', () => {
  beforeAll(() => {
    if (!fs.existsSync(BUILT_ENTRY)) {
      execSync('node tools/build-addons.js --include-fixtures', {
        cwd  : REPO_ROOT,
        stdio: 'pipe',
      })
    }
  }, 30000)

  test('emits a stub bundle, not inlined mesh source', () => {
    // Read main.js + any chunk it imports — esbuild may hoist the shared
    // @addon/mesh/api stub into a _chunks/ module.
    const built = readBuiltWithChunks(BUILT_ENTRY)

    // The stub reaches into globalThis._addons.getAddonAPI("mesh") and
    // pulls each requested symbol from the exports.mesh namespace.
    expect(built).toMatch(/globalThis\._addons.*getAddonAPI/s)
    expect(built).toMatch(/__ns\["Mesh"\]/)
    expect(built).toMatch(/__ns\["BVH"\]/)
    expect(built).toMatch(/__ns\["mesh_utils"\]/)

    // The actual mesh implementation must NOT appear here. The real Mesh
    // class is ~thousands of lines; we spot-check a few hallmark strings
    // unique to the implementation (not just the type name).
    expect(built).not.toMatch(/class Mesh extends SceneObjectData/)
    expect(built).not.toMatch(/recalcNormals/) // a mesh.ts method
    expect(built).not.toMatch(/getElemList/) // a mesh_base.ts method
    // And the bundle should be small — much smaller than even one mesh file.
    expect(built.length).toBeLessThan(20 * 1024) // 20kb cap
  })

  test('runtime lookup yields the host-registered symbols', async () => {
    // Mock the host AddonManager surface that the stub reads from.
    const mockMeshSymbols = {
      Mesh      : class MockMesh {},
      MeshFlags : {DEAD: 1, HIDE: 2},
      BVH       : class MockBVH {},
      mesh_utils: {answer: 42},
    }
    ;(globalThis as unknown as {_addons: {getAddonAPI: (id: string) => MockAddonAPI | undefined}})._addons = {
      getAddonAPI(id: string): MockAddonAPI | undefined {
        if (id === 'mesh') return {exports: {mesh: mockMeshSymbols}}
        return undefined
      },
    }

    // Dynamic-import the built bundle. file:// URLs are required because
    // we're outside the workspace's module resolver.
    const mod = (await import('file://' + BUILT_ENTRY)) as {
      getResolvedSymbols: () => {
        Mesh: unknown
        MeshFlags: unknown
        BVH: unknown
        mesh_utils: unknown
      }
      addonDefine: {name: string}
      register: () => void
      unregister: () => void
      seen: string[]
    }

    expect(mod.addonDefine.name).toBe('API Consumer')

    const resolved = mod.getResolvedSymbols()
    expect(resolved.Mesh).toBe(mockMeshSymbols.Mesh)
    expect(resolved.MeshFlags).toBe(mockMeshSymbols.MeshFlags)
    expect(resolved.BVH).toBe(mockMeshSymbols.BVH)
    expect(resolved.mesh_utils).toBe(mockMeshSymbols.mesh_utils)

    mod.register()
    mod.unregister()
    expect(mod.seen).toEqual(['register', 'unregister'])
  })

  test('build emits the consumer manifest into the index', () => {
    const indexPath = Path.join(REPO_ROOT, 'build/addons/index.json')
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const consumer = index.find((e: {manifest: {id: string}}) => e.manifest.id === 'api_consumer')
    expect(consumer).toBeDefined()
    expect(consumer.manifest.dependencies).toEqual(['mesh'])
  })
})
