# Material draw-splitting: how much does splitting by material cost?

Step 4a of
[the per-face material plan](../plans/2026-07-16-1700-per-face-material-attribute.md).
The plan says step 4 (the renderer honouring more than one material slot) should
*measure before it builds*, because splitting draws by material attacks the exact
per-command cost that
[the 2026-07-15 stroke profile](2026-07-15-1430-nondyntopo-stroke-profile-1.5m.md)
identified as dominant. This is that measurement.

**Verdict: tractable, but only if same-slot geometry can merge *across* leaves.
That single design choice moves the cost by 10x and decides whether step 4 is
viable at all.**

## Setup

`--gen-scene litemesh-cube --scene-arg subdiv=354`, wasm backend, headless:

| | |
|---|---|
| faces | 747,654 (≈1.5M tris) |
| `gpu_tri_target` | 32768 (the `DEFAULT_GPU_TRI_TARGET` the app sets) |
| leaves | 1101 (≈1360 tris each; `leaf_limit` 1024) |
| GPU nodes = **draw commands today** | **82** |

Driven by `__materialFragTest` (`scripts/lite-mesh/litemesh_materialfragtest_support.ts`)
over the new `SpatialTree::materialStats(perLeaf, out)`.

**A GPU node is not a leaf.** A GPU node is an *internal* node aggregating a whole
subtree (~13 leaves here) into one VBO + one draw command
(`assign_gpu_nodes_recurse`, `spatial.cc:1209`). Leaves are the floor. The two
granularities answer different questions, so both are measured.

### Region shapes are a proxy — and the measurement self-validates

JS cannot read face positions in bulk, so regions are built from **face-index
ranges**, which on a freshly generated cube is generation order (side-major, then
grid) and therefore spatially coherent. That assumption is not directly
verifiable, so `speckle4` (random per face) is the **control**: if the coherent
scenarios scored like speckle, index order would not be spatial and every
coherent number would be meaningless.

They don't (11% vs 100% leaf straddle), and `speckle4` landed on **exactly
4.000** — the saturated value predicted in advance for 4 random slots over
~1360-tri leaves. The proxy holds and the instrument reads true.

## Results

Each scenario in its own process (see *Harness limitation*); all five `valid`.

| scenario | slots | leaf straddle | gpu straddle | cmds after | **multiplier** |
|---|---|---|---|---|---|
| `halves2` | 2 | 11.08% | 54.88% | 127 | **1.55x** |
| `quarters4` | 4 | 18.71% | 68.29% | 157 | **1.92x** |
| `sides6` | 6 | 15.99% | 68.29% | 154 | **1.88x** |
| `bands64x4` | 4 | 86.01% | 100% | 313 | 3.82x |
| `speckle4` (control) | 4 | 100% | 100% | 328 | 4.00x |

Leaf histogram (distinct slots → #leaves, of 1101):

| scenario | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| `halves2` | 979 | 122 | | |
| `quarters4` | 895 | 196 | 10 | |
| `sides6` | 925 | 167 | 9 | |
| `bands64x4` | 154 | 720 | 197 | 30 |
| `speckle4` | | | | 1101 |

**Realistic layouts leave 81–89% of leaves single-slot.** The plan's mitigating
argument — that command count grows with material *boundaries*, not material
*count* — holds: `sides6` (6 slots) costs *less* than `quarters4` (4 slots),
because what matters is boundary length, not how many materials exist.

The prior theoretical estimate of ~1.11x was **optimistic by ~1.5x**. It modelled
leaves as compact surface patches; real BVH leaves are elongated AABBs, and
"half a spherified cube" in index order has a boundary considerably longer than a
great circle. Measurement beat the model — as the plan expected it to.

## The finding that decides the design

Command count depends entirely on whether same-slot geometry can merge across
leaf boundaries. The two bounds are 10x apart and land on opposite sides of the
viability line:

| scenario | **lower** (merge across leaves) | **upper** (per-leaf runs) |
|---|---|---|
| `halves2` | 127 (1.55x) | 1223 (14.9x) |
| `quarters4` | 157 (1.91x) | 1317 (16.1x) |
| `sides6` | 154 (1.88x) | 1286 (15.7x) |
| `bands64x4` | 313 (3.82x) | 2305 (28.1x) |
| `speckle4` | 328 (4.00x) | 4404 (53.7x) |

Against the profile's calibration — **246 commands = 2.0ms/frame, 827 commands =
40–71ms/frame**:

- **Lower bound (127–157) is comfortably below 246.** Step 4 is affordable.
- **Upper bound (1223–1317) is well past 827.** Step 4 is a disaster.

The upper bound is barely worse than one-draw-per-leaf (1101), which is the real
point: *any* design that emits a draw per (leaf × slot) is already in the known-bad
regime before materials are even considered.

### This kills the cheap implementation

An earlier reading of the tree (`GpuData::slices` already stores a contiguous
`vert_start`/`vert_count` per leaf, `node.h:58`) suggested step 4 could simply
**reorder whole LeafSlices by slot** and skip the plan's "sort tris within each
leaf" work entirely.

**That does not reach the lower bound.** Reordering slices only merges *pure*
leaves; the 11–19% mixed ones still break every run they sit in. And the tension
is structural: `fill_leaf_slice` (`spatial_gpu.cc:60`) refills *one leaf's
contiguous range*, so per-leaf contiguity is load-bearing for incremental
updates, while per-slot contiguity is what draw ranges need. Both hold only when
every leaf is single-slot.

Three ways out, in preference order:

1. **Split mixed leaves along material boundaries** so every leaf is pure. Then
   LeafSlice reordering achieves the lower bound *and* keeps per-leaf
   contiguity. Costs ~11–19% more leaves (1101 → ~1300) on realistic layouts.
   Assignment is a rare, explicit user action, so paying at assign time is right.
2. **Full tri sort across the GPU node.** Reaches the lower bound, but breaks
   LeafSlice contiguity and therefore the incremental refill path.
3. **Per-leaf runs.** Simplest, and unusable — see above.

Option 1 was not visible before this measurement; it is only attractive *because*
81–89% of leaves are already pure.

### Still unmeasured

Command count is one axis. The plan also flags that splitting breaks the
**single-pipeline / single-`GPURenderBundle`** assumption (`batch.ts:380-443`,
`:692-693`): N materials means N pipelines and more bind-group switches inside
the bundle. This measurement says nothing about that, and it could dominate.
A real frame-time comparison against the 2026-07-15 baseline is still required
before step 4 is declared safe.

## Harness limitation (real, and it bit)

`LiteMesh._intVecOut()` constructs a bound `Vector<int>` that **nothing ever
frees**. Past ~17 cumulative `assignMaterialToFaces` calls in one process, the
tree starts reporting **zero GPU nodes** while leaves still read fine.

Isolated by construction, not guessed: the failure tracked cumulative allocation
count, not scenario content or position — six *identical* `halves2` scenarios
(12 allocations) never failed, while the 5th scenario failed in two different
runs at exactly 16 prior allocations, whichever scenario happened to be there.

Two consequences, both fixed:

- Each scenario now runs in a **fresh process** (`{only: '<name>'}`).
- `multiplier` is `null` + `valid: false` on a zero-node read. It previously
  fell back to `1`, which **fabricated a perfect-looking 1.000x** — the most
  flattering possible answer — out of a failed measurement.

The leak is in the measurement path only (`_intVecOut` has no free API on the
manager); it is not an engine defect, and the spatial tree is not corrupted.

## Reproducing

```
pnpm build
nw . --apptest-headless --no-devtools --backend wasm \
  --gen-scene litemesh-cube --scene-arg subdiv=354 \
  --eval "(async()=>{globalThis.__evalTestResult = await __materialFragTest({only:'halves2'})})()" \
  --dump out.json --exit
```

One scenario per invocation. `--dump` needs a **Windows** path (a Git Bash
`/tmp/...` path is silently not written). The renderer's stdout is unavailable
(the known NW.js fd EBADF quirk), so the dump file is the only channel.
