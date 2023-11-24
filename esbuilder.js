import * as esbuild from 'esbuild'

let options = {
  entryPoints: ['./scripts/entry_point.js'],
  outdir     : "./build",
  bundle     : true,
  sourcemap  : true,
  minify     : false,
  treeShaking: false,
  logLevel   : "info",
  format     : "esm",
  platform   : "browser",
  external   : ["fs",
                "electron",
                "scripts/util/numeric.js",
                "numeric",
                "numeric.js",
                "scripts/util/numeric",
                "./scripts/util/numeric.js",
                "./scripts/util/numeric",
                "./scripts/extern/Math.js",
                "./scripts/extern/Math",
                "./scripts/path.ux/*"],
  splitting  : true,
  keepNames  : true,
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
