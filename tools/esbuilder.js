import * as esbuild from 'esbuild'
import fs from 'fs'
import Path from 'path'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..')

let options = {
  entryPoints: [
    './scripts/entry_point.js',
    {in: './sculptcore/typescript/build/sculptcore-browser.wasm', out: 'sculptcore-browser'},
  ],
  alias: {
    '@framework/api': Path.join(REPO_ROOT, 'scripts', 'framework_api.ts'),
  },
  outdir     : './build',
  bundle     : true,
  target     : 'es2022',
  sourcemap  : 'inline',
  minify     : false,
  treeShaking: false,
  logLevel   : 'info',
  format     : 'esm',
  platform   : 'browser',
  loader     : {'.wasm': 'copy'},
  external: [
    'fs',
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
  logOverride: {'direct-eval': 'silent'},
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
    await esbuild.build(options)
    await buildAddons()
  },

  async watch() {
    let ctx = await esbuild.context(options)
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
