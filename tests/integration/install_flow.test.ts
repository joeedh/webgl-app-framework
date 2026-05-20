/**
 * @jest-environment node
 *
 * Integration test for the addon install pipeline. Step 9 of the refactor
 * (plan §6 step 9, §7.2 Layer E).
 *
 * Forces the `node` test environment (overriding the project default of
 * jsdom). Reason: esbuild-wasm asserts that
 * `new TextEncoder().encode("") instanceof Uint8Array`, but Node's
 * TextEncoder produces a Node-realm Uint8Array which fails the check
 * against jsdom's Uint8Array constructor. Pure Node has no realm split.
 * In real Electron/browser code there's also no split (both classes come
 * from the same realm), so this is purely a test-environment fix.
 *
 * Approach:
 *   1. Build the test_addon fixture via tools/build-addons.js (same as
 *      tests/integration/addon_build.test.ts).
 *   2. Pack the built artifact + a fresh manifest into an in-memory zip via
 *      JSZip.
 *   3. Hand the zip blob to installFromBlob with an InMemoryAddonStorage.
 *   4. Assert the manifest is returned, the storage now lists the addon,
 *      and reading the entry through the storage produces the same JS the
 *      builder emitted.
 *   5. Cover failure modes: missing manifest, bad manifest, missing entry,
 *      source-mode (not yet supported).
 */

import {execSync} from 'node:child_process'
import fs from 'node:fs'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

import {installFromBlob, AddonInstallError} from '../../scripts/addon/install'
import {InMemoryAddonStorage} from '../../scripts/addon/storage'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..', '..')

// Load JSZip for the test side (same UMD bundle the install pipeline uses).
async function getJSZip(): Promise<any> {
  await import(Path.join(REPO_ROOT, 'scripts/extern/jszip/jszip.js'))
  return (globalThis as any).JSZip
}

interface IFiles {
  [path: string]: string | Uint8Array
}

async function makeZipBlob(files: IFiles): Promise<Uint8Array> {
  // Pure Uint8Array rather than Blob — JSZip accepts both, but the
  // node-environment Blob doesn't expose what JSZip's loadAsync expects.
  const JSZip = await getJSZip()
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }
  return (await zip.generateAsync({type: 'uint8array'})) as Uint8Array
}

const BUILT_ENTRY_PATH = Path.join(REPO_ROOT, 'build/addons/test_addon/src/main.js')

describe('installFromBlob', () => {
  beforeAll(() => {
    // Reuse the build output produced by tests/integration/addon_build.test.ts
    // if it's already there; otherwise build it now. esbuild is fast.
    if (!fs.existsSync(BUILT_ENTRY_PATH)) {
      execSync('node tools/build-addons.js --include-fixtures', {
        cwd  : REPO_ROOT,
        stdio: 'pipe',
      })
    }
  }, 30000)

  test('installs a prebuilt addon from a zip', async () => {
    const builtJs = fs.readFileSync(BUILT_ENTRY_PATH)

    const blob = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id          : 'thirdparty_test',
        name        : 'Third-party Test',
        version     : '0.1.0',
        entry       : 'build/main.js',
        dependencies: [],
        buildMode   : 'prebuilt',
      }),
      'build/main.js': new Uint8Array(builtJs),
    })

    const storage = new InMemoryAddonStorage()
    const manifest = await installFromBlob(blob, storage)

    expect(manifest.id).toBe('thirdparty_test')
    expect(await storage.list()).toEqual(['thirdparty_test'])

    const installed = await storage.read('thirdparty_test', 'build/main.js')
    expect(installed.length).toBe(builtJs.length)
  })

  test('throws if manifest.json is missing', async () => {
    const blob = await makeZipBlob({'build/main.js': 'export {}'})
    const storage = new InMemoryAddonStorage()
    await expect(installFromBlob(blob, storage)).rejects.toBeInstanceOf(AddonInstallError)
    await expect(installFromBlob(blob, storage)).rejects.toThrow(/manifest\.json missing/)
  })

  test('throws on invalid manifest', async () => {
    const blob = await makeZipBlob({
      'manifest.json': JSON.stringify({id: 'Bad-ID', name: 'x', version: '1.0.0', entry: 'm.js'}),
      'm.js'         : 'export {}',
    })
    await expect(installFromBlob(blob, new InMemoryAddonStorage())).rejects.toThrow(/id/)
  })

  test('throws when manifest entry is not in zip', async () => {
    const blob = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id     : 'noentry',
        name   : 'X',
        version: '1.0.0',
        entry  : 'build/missing.js',
      }),
    })
    await expect(installFromBlob(blob, new InMemoryAddonStorage())).rejects.toThrow(/not found/)
  })

  test('source-mode transpiles via esbuild-wasm', async () => {
    // A multi-file source addon: main.ts imports a helper from ./helper.ts.
    // Both files get bundled into a single transpiled .js the loader can
    // import directly.
    const blob = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id          : 'src_addon',
        name        : 'Src',
        version     : '1.0.0',
        entry       : 'src/main.ts',
        buildMode   : 'source',
        dependencies: [],
      }),
      'src/main.ts': `
        import {greet} from './helper'
        export const message: string = greet('world')
      `,
      'src/helper.ts': `
        export function greet(name: string): string { return 'hi ' + name }
      `,
    })

    const storage = new InMemoryAddonStorage()
    const manifest = await installFromBlob(blob, storage)
    expect(manifest.id).toBe('src_addon')

    // Output lands at <entry-stem>.js so the loader's
    // manifest.entry.replace('.ts', '.js') resolution finds it.
    const builtBytes = await storage.read('src_addon', 'src/main.js')
    const builtJs = new TextDecoder().decode(builtBytes)
    expect(builtJs).toContain('hi ')
    expect(builtJs).not.toContain(': string') // type annotations stripped
  }, 30000)

  test('source-mode requires the entry file to exist in the zip', async () => {
    const blob = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id       : 'no_src',
        name     : 'X',
        version  : '1.0.0',
        entry    : 'src/main.ts',
        buildMode: 'source',
      }),
    })
    await expect(installFromBlob(blob, new InMemoryAddonStorage())).rejects.toThrow(/missing entry/)
  })

  test('reinstalling replaces the previous version', async () => {
    const builtJs = fs.readFileSync(BUILT_ENTRY_PATH)
    const storage = new InMemoryAddonStorage()

    const blob1 = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id     : 'rev',
        name   : 'Rev',
        version: '0.1.0',
        entry  : 'build/main.js',
      }),
      'build/main.js': new Uint8Array(builtJs),
    })
    await installFromBlob(blob1, storage)

    const blob2 = await makeZipBlob({
      'manifest.json': JSON.stringify({
        id     : 'rev',
        name   : 'Rev',
        version: '0.2.0',
        entry  : 'build/main.js',
      }),
      'build/main.js': new Uint8Array(builtJs),
    })
    const m = await installFromBlob(blob2, storage)
    expect(m.version).toBe('0.2.0')
    // Confirm the storage has exactly one entry, not two.
    expect(await storage.list()).toEqual(['rev'])
  })
})
