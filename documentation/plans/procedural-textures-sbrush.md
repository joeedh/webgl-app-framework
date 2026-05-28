# Procedural textures on the `sbrush` compiler

A plan to replace the current GLSL→JS procedural-texture system
(`scripts/mathl` + `scripts/texture`) with one source language —
sculptcore's `sbrush` DSL — compiled to WGSL (GPU), C++/WASM (in-kernel CPU),
and JS (general CPU). Every phase produces **PNG images** so the result can be
eyeballed, not just trusted by tolerance numbers.

## Why

The current system has three structural problems:

1. **GPU path is orphaned.** Textures emit GLSL (`PatternGen.genGlsl`,
   `scripts/texture/proceduralTex.ts`) inlined into **WebGL2** fragment
   shaders (`pbvh_texpaint.ts`). The realtime renderer is now WebGPU-only;
   `scripts/mathl` has no WGSL backend (its GLSL output backend is a stub).
2. **No analytical derivatives.** Bump/pinch sampling uses numerical
   finite-difference — 4 evals per sample at eps `0.00015`
   (`proceduralTex.ts:327`), consumed at `pbvh_sculptops.ts:4156`.
3. **Two divergent codegen paths + a 9K-LOC bespoke compiler.** The GLSL
   string (GPU) and the mathl-compiled JS (CPU) can drift, and `scripts/mathl`
   (LALR parser, type system, JS codegen) is ours to maintain forever.

The `sbrush` DSL already solves all three. It is a statically-typed,
C/HLSL-flavored language with a real multi-backend compiler
(`sculptcore/source/brush/compiler/`: `emit_cpp.cc` 34KB, `emit_wgsl.cc`
46KB, plus CUDA/HIP/OpenCL). It already has:

- **Inline `texture` blocks** — pure `float eval(float3 p, float3 n)`
  functions that lower to a free function, bit-identical on every backend
  (`kernels/texdraw.sbrush`, `documentation/brush_dsl.md:177`).
- **Forward-mode autodiff** `grad(expr, var)` → analytical `float3` gradients
  on all backends (`kernels/graddraw.sbrush`, `brush_dsl.md:211`). This *is*
  the analytical-derivative feature; it replaces the finite-difference block.
- **A/B verification harness** — `node make.mjs sbrush-verify` already runs
  C++-vs-WGSL dumps through `debug_app` with tolerance
  (`make.mjs:410`), and procedural-texture brushes are already covered
  (`tests/scripts/brush_backends/draw_proc_tex_ab.txt`).

## Authoring model: hybrid

Two deployment modes share one front end (lexer → parser → sema → IR +
autodiff), differing only in emitter:

```
                          ┌─ emit_cpp  → checked-in .gen.h   BUILD-TIME, shipped library
texture source            │              inlined into WASM brush kernels (fastest CPU)
  ──► front end ──► IR ───┤─ emit_wgsl → WGSL module string  BUILD-TIME + RUNTIME
   (+ grad autodiff)      │              WebGPU createShaderModule (library & user textures)
                          └─ emit_js   → JS Function string   RUNTIME (NEW) — the mathl replacement
                                         general CPU sampling on the JS side
```

- **Shipped library**: textures authored as standalone `sbrush` texture units,
  `node make.mjs codegen` emits WGSL + C++. Built-ins sampled *inside* a WASM
  brush stroke become inline C++ calls — no per-vertex JS/WASM boundary.
- **User-authored at runtime**: the front end + `emit_wgsl` + `emit_js` are
  exposed through the WASM/N-API surface; in-app editing compiles live to a
  WGSL module (GPU) and a JS `Function` (CPU), errors marshalled back to JS.
- On the JS side, `emit_js` is the **universal** CPU path (built-ins and user
  textures both); `emit_cpp` is purely the in-kernel brush optimization.

### Standalone texture units

`texture` blocks are brush-scoped today. This plan makes them a top-level
compilation unit — a `.stex` file (or a top-level `texture` form) containing
one or more `texture Name { float eval(float3 p, float3 n) {…} uniform … }`
declarations. They compile independently of any brush; a brush's
`sampleBrushTex` / inline `texture` use is unchanged.

## Image-based testing strategy (the core of this plan)

Every texture, on every backend, is **baked to a PNG** by sampling
`eval(p, n)` over a fixed 2D object-space grid (default 512×512, `p = (u, v,
0)`, `n = (0, 0, 1)`), mapping the scalar result through a fixed colormap
(grayscale for value, and a separate signed colormap for gradient channels).
This gives three classes of artifact per texture:

1. **Reference image** (look-at): the JS bake. This is the "what does the
   texture look like" picture for Claude / the user to inspect.
2. **Per-backend images**: JS, C++ (via `debug_app`), WGSL (GPU readback).
   Same grid, same colormap.
3. **Diff image + stats**: abs-error heatmap between each backend pair, plus
   `max` / `mean` error printed. A green frame = within tolerance, red = fail.
   This turns the existing numeric A/B check into something visual.

Where the bakes run:

| Backend | Where it bakes | PNG writer |
|---|---|---|
| JS (`emit_js`) | Node/TS script `tools/bake_texture.mjs` | `pngjs` or canvas |
| C++ (`emit_cpp`) | new `debug_app` verb `bake_texture <name> <out.png>` | stb (`source/debug/stb_image_impl.cc`, already linked) |
| WGSL (GPU) | `debug_app` WebGPU/Dawn harness (same path as `webgpu-verify`, `make.mjs:519`) → readback | stb |

A new `node make.mjs tex-verify` mirrors `sbrush-verify`: for each texture in
a manifest it bakes all three backends, writes the per-backend PNGs + diff
PNGs into `build/tex_verify_out/`, and fails if any pair exceeds tolerance
(`VERIFY_ATOL 1e-5`, `VERIFY_RTOL 1e-4`, reuse `make.mjs:356`). The PNG
directory is the deliverable a human/Claude opens.

Also bake the **gradient** (`grad(eval, p)`) to its own image and diff
backends — autodiff correctness is otherwise invisible. A finite-difference
gradient bake (the *old* method) baked alongside lets us confirm the
analytical gradient matches the numerical one within eps.

## Phases

Each phase lists its deliverable **and the images it produces**.

### Phase 0 — Spike: port Worley, de-risk the language

Worley/Perlin need a hash/permutation primitive sbrush lacks, and iterate a
cell neighborhood (sbrush has `for` + fixed `Array<T,N>` but no dynamic arrays
or recursion). Port **Worley** end-to-end first; it's the worst case.

- Decide the hash approach: build from `fract(sin(dot(p,k))*m)` with existing
  intrinsics, or add a `hash`/`permute` intrinsic to `kernels/ir/intrinsics.cc`.
- Write `worley.stex`; confirm it parses and `emit_wgsl` + (stub) `emit_cpp`
  produce valid output.
- **Images:** `worley_js.png` baked via mathl-or-handwritten JS as a *visual
  target* (no `emit_js` yet), so we know what correct looks like before the
  pipeline exists.
- **Exit criterion:** Worley expressible in sbrush, or a concrete list of
  intrinsics/language features to add. If it can't be expressed, revisit the
  whole approach before sinking effort into `emit_js`.

### Phase 1 — `emit_js` backend + bake tooling

- New emitter `compiler/emit_js.cc` mirroring `emit_cpp.cc` (the semantic
  reference), including the dual-number autodiff lowering for `grad`.
- `tools/bake_texture.mjs`: compile a `.stex` via `emit_js`, sample the grid,
  write value + gradient PNGs.
- **Images:** `worley_js.png`, `worley_js_grad.png`. Compare against Phase 0
  target by eye and by pixel diff.
- **Exit criterion:** JS bake of Worley matches the Phase 0 target.

### Phase 2 — C++ bake + `tex-verify` harness

- `debug_app` verb `bake_texture <name> <out.png>` using `emit_cpp` output +
  stb.
- WGSL bake via the Dawn harness (reuse `webgpu-verify` plumbing).
- `node make.mjs tex-verify`: bake JS/C++/WGSL, write per-backend + diff PNGs
  to `build/tex_verify_out/`, fail on tolerance.
- Fold `emit_js` into the bit-comparison so JS is a verified backend alongside
  C++/WGSL (extend the A/B set, not just images).
- **Images:** `build/tex_verify_out/worley.{js,cpp,wgsl}.png`,
  `worley.diff_js_cpp.png`, `worley.diff_cpp_wgsl.png`, `worley.grad.*.png`.
- **Exit criterion:** all three backends agree within tolerance, diff frames
  green.

### Phase 3 — Port the existing library, switch the CPU sampler

- Rewrite SimpleNoise, MoireNoise, CombPattern, GaborNoise, Worley as `.stex`
  units. Gabor's bounded kernel loop and Worley's cells are the hard ports.
- Repoint `scripts/texture/proceduralTex.ts` CPU sampling from mathl to the
  `emit_js` Function; replace the finite-difference block
  (`proceduralTex.ts:327`) with a single `grad(eval, p)` call.
- **Images:** `tex-verify` gallery for all five textures + a finite-diff-vs-
  analytical gradient diff per texture (confirms `grad` matches the old
  numerical method within eps).
- **Exit criterion:** all five textures pass `tex-verify`; brush sampling in
  the app visually unchanged (Electron `--screenshot` before/after on a
  textured sculpt stroke, `test_harness.ts:267`).

### Phase 4 — Runtime authoring surface

- Expose `compileTextureToWGSL(src)` / `compileTextureToJS(src)` through the
  WASM/N-API binding (`source/brush/bindings.cc` pattern); marshal compile
  errors back to JS.
- In-app texture editor compiles live; GPU gets a WebGPU shader module, CPU
  gets a JS `Function`.
- **Images:** an Electron harness scene that authors a texture string at
  runtime, applies it, and `--screenshot`s the WebGPU result; a `tex-verify`
  run driven by a user-supplied `.stex` string.
- **Exit criterion:** a texture typed at runtime renders on GPU and samples on
  CPU, both matching a `tex-verify` bake of the same source.

### Phase 5 — Retire the old system

- Wire WGSL texture output into the WebGPU texture-paint shader, replacing the
  WebGL2 GLSL path in `pbvh_texpaint.ts`.
- Delete `scripts/mathl` and the `genGlsl` / `compileTexShaderJS`
  (`scripts/texture/textureGen.ts`) paths.
- Update `TODO.md` for any cross-layer consumers of the removed files.
- **Images:** final full-gallery `tex-verify` run as the regression baseline;
  an Electron `--screenshot` of WebGPU texture paint to confirm the GPU path
  works post-cutover.

## Risks

- **Language expressiveness** (highest). Hash primitives and bounded-loop
  noise are unproven in sbrush — Phase 0 exists to surface this before any
  `emit_js` work. If a texture needs dynamic arrays or recursion it can't be
  expressed; budget for adding intrinsics.
- **`emit_js` autodiff parity.** The JS dual-number lowering must match
  `emit_cpp` bit-for-bit modulo fp; the gradient bake + diff is the guard.
- **WASM boundary for JS-side built-ins.** Solved by making `emit_js` the
  universal JS-side CPU path; `emit_cpp` is in-kernel only.
- **GPU readback flakiness.** `canvas.toDataURL` is best-effort for a GPU
  canvas without `preserveDrawingBuffer` (`test_harness.ts:193`); prefer the
  `debug_app` Dawn-harness readback (as `webgpu-verify` does) for deterministic
  bake images, and chrome-devtools-mcp for in-app screenshots.

## New / touched files

```
sculptcore/source/brush/compiler/emit_js.cc        NEW emitter
sculptcore/source/brush/kernels/ir/intrinsics.cc   maybe add hash/permute
sculptcore/source/debug/script.cc                  NEW bake_texture verb
sculptcore/make.mjs                                 NEW tex-verify command
tools/bake_texture.mjs                              NEW JS bake script
scripts/texture/*.stex                              ported textures (NEW dir)
scripts/texture/proceduralTex.ts                    repoint CPU sampler to emit_js
scripts/editors/view3d/tools/pbvh_texpaint.ts       WGSL instead of WebGL2 GLSL
scripts/mathl/                                      DELETED in Phase 5
scripts/texture/textureGen.ts                       DELETED in Phase 5
build/tex_verify_out/                               image gallery (gitignored)
```
