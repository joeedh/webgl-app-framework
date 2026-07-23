# Release build mode

**Sources:** `tools/esbuilder.js`, `tools/build-addons.js`, `sculptcore/make.mjs`,
`.github/workflows/deploy-pages.yml`

Release mode is what the GitHub Pages CI ships: no JavaScript source maps
anywhere, and a sculptcore WASM module built optimized with no debug info. It is
one flag on each half of the build, and both halves run locally too.

```sh
pnpm build:release                            # app bundle, no source maps
node sculptcore/make.mjs build wasm --release # CMAKE_BUILD_TYPE=Release WASM
```

## What it changes

**App bundle (`--release` → `tools/esbuilder.js`).** `sourcemap` becomes `false`
for the main bundle *and*, through the `--release` flag it forwards to
`tools/build-addons.js`, for every addon bundle. Both default to inline maps, so
release mode is the difference between a ~25 MB and a ~7 MB `entry_point.js` —
the addon bundles carried full inline maps as well. Nothing else changes:
`minify` and `treeShaking` stay off (the app reflects on class and function
names — `keepNames`, nstructjs `STRUCT` parsing — so minification needs its own
soak), and `metafile` stays on because the addon-duplication guard reads it.

Sourcemap precedence in `resolveSourcemap()`: `--release` (none) →
`ESBUILD_SOURCEMAP` (`inline | external | linked | both | none`) → `inline`.

**sculptcore WASM (`--release` → `make.mjs`).** Forces
`CMAKE_BUILD_TYPE=Release` instead of the `RelWithDebInfo` default, i.e. emcc
`-O3 -DNDEBUG` with no `-g`/`-gsource-map`: no DWARF in the `.wasm`, no
`.wasm.map`, `assert()` compiled out, and Emscripten's `ASSERTIONS` off (its
default at `-O1`+). Roughly a 5x smaller module. An explicit
`SCULPTCORE_CMAKE_BUILD_TYPE` env var still wins — it exists so Blender's CMake
integration can pin the config from the superproject.

The WASM tree is shared between configs (`sculptcore/build/`), so `build wasm`
compares the build dir's cached `CMAKE_BUILD_TYPE` against the requested one and
re-runs `configure` when they differ. Toggling `--release` on and off therefore
works without a manual reconfigure — at the cost of a full recompile each way.

## What it does *not* change

- **Native / node-addon builds.** `build native` and `build node` are unaffected
  by design: they keep `RelWithDebInfo` and the clang `-g -gcodeview` + `/DEBUG`
  PDB block in `sculptcore/CMakeLists.txt`, which is what makes Crashpad
  minidumps symbolizable (`documentation/plans/crashpad.md`). Passing `--release`
  to them sets Release but is not part of any shipping flow.
- **Dev builds.** `pnpm build` / `pnpm watch` keep inline maps.

## CI

`.github/workflows/deploy-pages.yml` runs `node make.mjs configure wasm
--release` + `node make.mjs build wasm --release` (cached by sculptcore submodule
SHA), then `pnpm build:release`. A "Verify no source maps shipped" step fails the
job if `_site` contains any `*.map` or any `sourceMappingURL=data:` — that guard
is the regression test for this mode.
