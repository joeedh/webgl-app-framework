import * as esbuild from 'esbuild'
import fs from 'fs'
import Path from 'path'
import {fileURLToPath} from 'url'

import {addonApiPlugin} from './addon_api_plugin.js'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..')
const MAIN_META_PATH = Path.join(REPO_ROOT, 'build', 'meta-main.json')

let options = {
  entryPoints: [
    './scripts/entry_point.js',
    {in: './sculptcore/typescript/build/sculptcore-browser.wasm', out: 'sculptcore-browser'},
    // Emit the Emscripten glue at a stable, unhashed path. Its pthread pool
    // spawns workers via `new Worker(new URL('sculptcore-browser.js',
    // import.meta.url))` (see PThread.allocateUnusedWorker in the generated
    // glue); if esbuild content-hashes the chunk, that bare filename 404s and
    // every pool worker dies on startup. Pinning the name to
    // `build/sculptcore-browser.js` makes the self-reference resolve. The
    // dynamic `import('../build/sculptcore-browser.js')` in wasm.ts dedupes
    // onto this same output.
    {in: './sculptcore/typescript/build/sculptcore-browser.js', out: 'sculptcore-browser'},
  ],
  alias: {
    '@framework/api': Path.join(REPO_ROOT, 'scripts', 'framework_api.ts'),
  },
  outdir     : './build',
  bundle     : true,
  target     : 'es2022',
  // Overridable for the Pages build (ESBUILD_SOURCEMAP=external) so the served
  // entry_point.js isn't bloated by its ~20 MB inline map. Defaults to inline
  // for local dev (single file, no extra fetch). Accepts any esbuild sourcemap
  // mode: inline | external | linked | both.
  sourcemap  : process.env.ESBUILD_SOURCEMAP || 'inline',
  minify     : false,
  treeShaking: false,
  logLevel   : 'info',
  format     : 'esm',
  platform   : 'browser',
  loader     : {'.wasm': 'copy'},
  external: [
    'fs',
    'path',
    'marked',
    '*/build/sculptcore.js',
    'electron',
    'scripts/util/numeric.js',
    'numeric',
    'numeric.js',
    'scripts/util/numeric',
    './scripts/util/numeric.js',
    './scripts/util/numeric',
    './scripts/extern/Math.js',
    './scripts/extern/Math',
    './scripts/extern/jszip/*',
  ],
  splitting  : true,
  keepNames  : true,
  metafile   : true,
  logOverride: {'direct-eval': 'silent'},
  // Resolve `@addon/<id>/api` imports in main-bundle code to a runtime-lookup
  // stub (globalThis._addons.getAddonAPI(id).exports[id]) instead of inlining
  // the addon's source. This lets main-bundle code reference an addon without
  // statically pulling its code in — the prerequisite for extracting addons to
  // their own bundles without duplication.
  //
  // NOTE: the stub binds at the consumer module's *load time*, which in the
  // main bundle is before start() enables any addon — so the bindings are
  // `undefined` if read eagerly at module scope. Main-bundle code must access
  // addon exports lazily (via the getters in scripts/addon/addon_base.ts), not
  // through eager `@addon/<id>/api` value imports. `@framework/api` stays an
  // alias to the real file: the main bundle *is* the framework.
  plugins    : [addonApiPlugin(REPO_ROOT)],
}

// After the main bundle finishes, build any addon manifests we discover.
// Kept inline so `npm run build` and `npm run watch` automatically rebuild
// addons too. See plan §2.3.
async function buildAddons(opts = {}) {
  const args = ['./tools/build-addons.js']
  if (opts.watch) args.push('--watch')
  if (opts.includeFixtures) args.push('--include-fixtures')
  const {spawn} = await import('child_process')
  return new Promise((resolve, reject) => {
    const proc = spawn('node', args, {stdio: 'inherit'})
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build-addons exited ${code}`))))
    proc.on('error', reject)
  })
}

const handlers = {
  async help() {
    console.log('\nUsage: esbuilder --watch,-w --help\n')
  },
  async build() {
    const result = await esbuild.build(options)
    // Persist the main bundle's metafile so build-addons.js can run the
    // addon-duplication guard against it.
    if (result.metafile) {
      fs.mkdirSync(Path.dirname(MAIN_META_PATH), {recursive: true})
      fs.writeFileSync(MAIN_META_PATH, JSON.stringify(result.metafile))
    }
    await buildAddons()
  },

  async watch() {
    // Emit the main metafile on every rebuild so the addon watcher's guard
    // sees fresh inputs.
    const watchOptions = {
      ...options,
      plugins: [
        ...options.plugins,
        {
          name: 'write-main-metafile',
          setup(build) {
            build.onEnd((result) => {
              if (result.metafile) {
                fs.mkdirSync(Path.dirname(MAIN_META_PATH), {recursive: true})
                fs.writeFileSync(MAIN_META_PATH, JSON.stringify(result.metafile))
              }
            })
          },
        },
      ],
    }
    let ctx = await esbuild.context(watchOptions)
    await ctx.watch()
    // Run addon build in watch mode as a background child process so the
    // two watchers run concurrently.
    buildAddons({watch: true}).catch((err) => console.error('addons watcher:', err))
  },
}

let mode = 'build'
for (let arg of process.argv) {
  if (arg === '-w' || arg === '--watch') {
    mode = 'watch'
  }

  if (arg === '-h' || arg === '--help') {
    mode = 'help'
    break
  }
}

await handlers[mode]()
