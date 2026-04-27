import * as esbuild from 'esbuild'
import fs from 'fs'
import Path from 'path'

const onBuildFinished  = {
  name: 'env',
  setup(build) {
    // Load paths tagged with the "env-ns" namespace and behave as if
    // they point to a JSON file containing the environment variables.
    build.onEnd(result => {
      console.log('on build end!')
      fs.mkdirSync('./build', {recursive: true})
      fs.copyFileSync('./sculptcore/typescript/build/sculptcore-browser.wasm', './build/sculptcore-browser.wasm')
    })
  },
}

let options = {
  entryPoints: ['./scripts/entry_point.js'],
  outdir     : "./build",
  bundle     : true,
  target     : "es2022",
  sourcemap  : 'inline',
  minify     : false,
  treeShaking: false,
  logLevel   : "info",
  format     : "esm",
  platform   : "browser",
  external   : ["fs",
                "*/build/sculptcore.js",
                "electron",
                "scripts/util/numeric.js",
                "numeric",
                "numeric.js",
                "scripts/util/numeric",
                "./scripts/util/numeric.js",
                "./scripts/util/numeric",
                "./scripts/extern/Math.js",
                "./scripts/extern/Math",
                "./scripts/extern/jszip/*",
  ],
  splitting  : true,
  keepNames  : true,
  logOverride: {"direct-eval": "silent"},
  plugins    : [
    onBuildFinished
  ]
};

const handlers = {
  async help() {
    console.log("\nUsage: esbuilder --watch,-w --help\n");
  },
  async build() {
    await esbuild.build(options)
  },

  async watch() {
    let ctx = await esbuild.context(options);
    await ctx.watch();
  }
};


let mode = "build";
for (let arg of process.argv) {
  if (arg === "-w" || arg === "--watch") {
    mode = "watch"
  }

  if (arg === "-h" || arg === "--help") {
    mode = "help";
    break;
  }
}

await handlers[mode]()
