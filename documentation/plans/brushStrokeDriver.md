# Generic Brush Stroke Driver

## Context

The current stroke logic is duplicated and ad-hoc: `pbvh_base.ts::feedTask` (~966-1109)
builds an interpolated stroke from queued pointer events with **linear** interpolation (it
has a TODO to use a real spline), and `pbvh_sculptops.ts::processSample` (~818-1226) is a
from-scratch rewrite that does the same job with Catmull-Rom-from-history. Both mix the
generic concern (turn noisy pointer events into evenly-spaced `PaintSample` dabs along a
smooth curve) with consumer-specific concerns (mesh raycasting, mirroring, the ToolOp async
queue, mode-specific brush params).

This task extracts the generic concern into one reusable, self-contained
`BrushStrokeDriver` class: it ingests raw pointer events, fits an **interpolating cubic
spline** through them, and emits `PaintSample` objects sampled at **even spacing in either
screen space or world space**. World-space spacing raycasts each input point into the scene
and falls back to a camera-facing plane for rays that miss. The driver does **not** mirror
(downstream owns that) and does **not** apply dabs to geometry. We are **not** porting
`feedTask`/`processSample` to use it in this task — those stay as-is.

### Locked design decisions (from the user)
1. **Decoupled** via narrow capability interfaces (no hard `View3D`/`Brush` dependency).
2. **Centripetal** Catmull-Rom (alpha=0.5) — robust to clustered/jittery input.
3. **Self-contained** — the driver owns the raw-input queue and pacing; a consumer just
   pushes events and pulls ready samples on its tick.
4. **Add a `hit` field to `PaintSample`** so downstream can tell surface hits from
   camera-plane fallback samples.

## New file & class

- **File:** `scripts/editors/view3d/tools/stroke_driver.ts`
- **Class:** `BrushStrokeDriver`

### Public types

```ts
export interface StrokeInput {
  x: number; y: number          // client-space coords as delivered by the event source
  pressure: number              // 0..1 (caller normalizes: mouse=1, pen/touch=e.pressure)
  invert: boolean               // caller pre-resolves ctrlKey + BrushFlags.INVERT
  time: number                  // ms; informational only (not used for spacing)
  pointerType?: string
}
export enum StrokeSpaceMode { SCREEN = 0, WORLD = 1 }

export interface IStrokeProjection {            // adapter over View3D
  project(co: Vector4, rendermat?: Matrix4): number
  unproject(co: Vector4, irendermat?: Matrix4): number
  getViewVec(localX: number, localY: number): Vector3
  getLocalMouse(x: number, y: number): Vector2
  cameraPos(): Vector3
  rendermat(): Matrix4
  glSize(): Vector2                              // device px, for world-radius conversion
}
export interface IStrokeHit { p: Vector3; normal: Vector3; dist: number }
export type StrokeRayCast = (origin: Vector3, dir: Vector3) => IStrokeHit | undefined

export interface StrokeParams { radius: number; strength: number; spacing: number; color: Vector4 }
export type StrokeParamProvider = (pressure: number) => StrokeParams  // lifts feedTask's getchannel

export interface StrokeDriverOptions {
  projection: IStrokeProjection
  getParams: StrokeParamProvider
  spaceMode: StrokeSpaceMode
  rayCast?: StrokeRayCast        // required for WORLD mode; optional for SCREEN
}
```

### Self-contained API (the driver owns queue + pacing)

```ts
constructor(opts: StrokeDriverOptions)
push(input: StrokeInput): void          // enqueue one raw event (called from on_pointermove)
poll(): PaintSample[]                    // drain queued events through the spline, return ready dabs; call each tick
end(): void                             // pointer-up: subsequent poll() flushes the trailing segment
get finished(): boolean                 // true once ended AND fully drained
reset(): void                           // clear all per-stroke state for reuse
```

Consumer loop (illustrative, **not** part of this task): `on_pointermove` calls
`driver.push(...)`; the modal timer tick calls `for (const ps of driver.poll()) { applyWithMirror(ps); yield }`;
pointer-up calls `driver.end()` then keeps polling until `driver.finished`. Mirroring,
yielding, and the actual dab application stay in the consumer. This replaces both the
`queue`/`makeTask`/`timer_on_tick` machinery **and** the `appendPath` pre-smoothing in
`PaintOpBase` (the CR spline subsumes appendPath's janky-event sub-segmenting; fast moves
just yield more dabs per segment via arc-length sampling).

### Internal state

```ts
private inQueue: StrokeInput[]
private cps: StrokeControlPoint[]        // accepted control points; keep last >= 4
private sumS = 0; private lastDabS = 0; private walkCarry = 0   // spacing cadence (feedTask sumDabS/lastDabS)
private firstHit = false; private lastHitWorld = new Vector3()  // miss-plane anchor
private prevEmitted?: PaintSample        // for dp/dScreenP + futureAngle back-patch
private ended = false
// StrokeControlPoint = { screen:Vector2, world:Vector3, hit:boolean, normal:Vector3,
//                        pressure:number, params:StrokeParams, invert:boolean }
```

## Algorithm

### Control-point ingestion (`poll` drains `inQueue`)
For each queued `StrokeInput`: build a `StrokeControlPoint`, set `screen =
getLocalMouse(x,y)`, `params = getParams(pressure)`, then raycast:
- `viewvec = getViewVec(screen)`, `origin = cameraPos()`; `hit = rayCast?.(origin, viewvec)`.
- **hit** → `world=hit.p`, `normal=hit.normal`, `cp.hit=true`, `firstHit=true`, `lastHitWorld=hit.p`.
- **miss, before any hit** (`!firstHit`) → **discard the control point** (don't append, don't
  advance spacing) — matches the `feedTask`/`sampleViewRay` early-return; the stroke begins
  at the first real hit.
- **miss, after first hit** → synthesize world pos via the `sampleViewRay` project/swap/unproject
  trick (`pbvh_base.ts` ~1299-1328): project `lastHitWorld` to screen, overwrite x/y with
  `cp.screen`, unproject back → a point on the camera-facing plane through the last hit;
  `cp.hit=false`, `cp.normal=viewvec`.

After appending a control point, if `cps.length >= 4`, emit the now-complete segment between
`cps[n-2]` and `cps[n-1]` (1-segment lookahead lag — a CR segment needs both neighbors). The
**first** control point emits one raw dab immediately (`isInterp=false`, `strokeS=0`), mirroring
`feedTask`'s `if (!this.lastps1)`. `end()` + `poll()` flushes the final segment with the
right neighbor clamped (`P3 := P2`).

### Centripetal Catmull-Rom → cubic Bezier (build twice per segment: screen & world)
For control points `P0,P1,P2,P3`, the segment between `P1,P2` becomes `Bezier(B0,B1,B2,B3)`.
Knots `dt_i = |P_{i+1}-P_i|^0.5` (centripetal); tangents:
```
m1 = (P2-P1)/dt1 - (P2-P0)/(dt0+dt1) + (P1-P0)/dt0
m2 = (P3-P2)/dt2 - (P3-P1)/(dt1+dt2) + (P2-P1)/dt1
B0=P1; B1=P1 + m1*dt1/3; B2=P2 - m2*dt1/3; B3=P2
```
Endpoint clamp: missing `P0` → `P0:=P1`; missing `P3` → `P3:=P2`. Reuse `Bezier` from
`scripts/util/bezier.js` (`new Bezier(a,b,c,d)`, `.evaluate(s)`, `.derivative(s)`,
`.createQuads()`). Screen Bezier uses `cps[].screen` (z=0); world Bezier uses `cps[].world`.
Both share `s∈[0,1]`, so `screenBez.evaluate(s)` and `worldBez.evaluate(s)` are the screen/world
image of the **same** logical point — the invariant that keeps `screenP` and `p` consistent.

### Even arc-length sampling (chord-marching; `Bezier` has no arc-length method)
Walk the driving curve, accumulating chord length until reaching `spacingDist`, carrying the
remainder across segments (`walkCarry`) so cadence is continuous (what `feedTask` fakes with
`sumDabS`/`lastDabS`):
```
FINE=32; prev=bez.evaluate(0); acc=walkCarry; ts=[]
for k in 1..FINE: s=k/FINE; cur=bez.evaluate(s); seg=dist(prev,cur)
  while acc+seg >= spacingDist:
    f=(spacingDist-acc)/seg; emitS=(s-1/FINE)+f/FINE; ts.push(emitS)
    prev=lerp(prev,cur,f); seg=dist(prev,cur); acc=0
  acc+=seg; prev=cur
walkCarry=acc
```

### Screen vs world branch
- **SCREEN:** `spacingDist = params.spacing * 2 * radiusPx` (brush.radius is screen px). Walk `screenBez`.
- **WORLD:** `worldRadius = radiusPx / max(glSize) * abs(w)` where `w` is the projected weight of
  `worldBez.evaluate(0.5)` (the `sampleViewRay` ~1336-1340 conversion). `spacingDist =
  params.spacing * 2 * worldRadius`. Walk `worldBez`.

For each emitted `t`: evaluate **both** curves → `screenP` and `p` (`p[3]`=projective w);
`dScreenP/dp` from `prevEmitted`; `strokeS += spacing` (`dstrokeS` accordingly);
`angle = atan2(dScreenP.y, dScreenP.x)`, and **back-patch** `prevEmitted.futureAngle = angle`
(processSample ~1177-1180); `vec` = interpolated endpoint normals (or viewvec if miss);
`ps.curve` = small sub-Bezier slice of `worldBez` around `t`, `.createQuads()`. Interior
samples `isInterp=true`.

### Non-positional interpolation (separate, simpler)
Plain **linear** lerp between the two segment-endpoint inputs for `radius`, `strength`,
`pressure`, `color`, `invert` — NOT the CR spline (matches processSample `radius2` ~1085 and
feedTask `interpScalar`).

### PaintSample fields
- **Driver fills:** `p, dp, screenP, dScreenP, strokeS, dstrokeS, angle, futureAngle, vec,
  viewvec, viewPlane, vieworigin, rendermat, radius, strength, pressure, color, w, curve,
  isInterp, invert, hit` (new).
- **Left at default for downstream:** `rake, pinch, sharp, autosmooth, autosmoothInflate,
  concaveFilter, planeoff, smoothProj, esize, origp, mirrored` (mode-specific / need mesh data
  the driver must not touch).

## PaintSample change

In `scripts/editors/view3d/tools/pbvh_paintsample.ts`, add a `hit` field:
- STRUCT line `hit : bool;`
- runtime field `hit: boolean` with constructor default `true`
- copy it in `copyTo`

Default `true` keeps existing producers/serialized data backward-compatible. `mirror()` leaves
`hit` unchanged.

## Reused symbols

| Symbol | Path | Use |
|---|---|---|
| `PaintSample`, `interpKeys`, `copyTo`, `copy` | `scripts/editors/view3d/tools/pbvh_paintsample.ts` | output objects (+ new `hit`) |
| `Bezier` (`evaluate`/`derivative`/`createQuads`) | `scripts/util/bezier.js` | per-segment curve + `ps.curve` slice |
| `Vector2/3/4`, `Matrix4` | `scripts/path.ux/scripts/pathux.js` | math (in-place `.interp/.load/.sub/.addFac`) |
| project/unproject/getViewVec/getLocalMouse/glSize | `scripts/editors/view3d/view3d.ts` (~716,729,760,1178) | adapter for `IStrokeProjection` |
| miss-plane trick; world-radius `radius/maxGl*|w|` | `pbvh_base.ts::sampleViewRay` ~1299-1340 | `synthesizeMissPoint`, world spacing |
| spacing cadence, first-dab-raw | `pbvh_base.ts::feedTask` ~1062-1104 | sampling loop |
| CR-from-history, angle/futureAngle, curve slice, radius lerp | `pbvh_sculptops.ts::processSample` ~1002-1206 | behavior to generalize |

## Verification

1. **Pure-math unit tests** (`tests/unit/stroke_math.test.ts`): factor the math into
   path.ux-free helpers on plain `[x,y,z]` arrays (`crSegmentToBezier`, `evalCubic`,
   `arcLengthWalk`). Assert CR passes **through** endpoints (`evalCubic(B,0)==P1`,
   `(B,1)==P2`); a straight line of length L at spacing d emits ~L/d uniformly-spaced dabs
   with carry continuity across abutting segments; centripetal CR doesn't overshoot the input
   bbox on a clustered-then-far triple. (Vectors don't transform under jsdom — keep these
   host-independent.)
2. **Integration** (`tests/integration/stroke_driver.test.ts`, headless NW.js via the
   `--eval`→`CTX` bridge, see `tests/integration/node_editor_ops.test.ts`): build a driver with
   a real `view3d` adapter against a known mesh, push a scripted `StrokeInput[]` (diagonal +
   sharp corner + one off-mesh point), expose results via a small `CTX.debug` hook (the driver
   isn't a ToolOp, so `execTool` doesn't apply). Assert dab count ≈ L/(spacing·2·radius)
   within tolerance; consecutive `screenP` spacing ≈ constant; `p` on the mesh for hits and on
   the camera-plane (`hit===false`) for the off-mesh input; first sample `isInterp===false`,
   interior `===true`.
3. **Manual** (`/run` or `/verify`): once a consumer is wired (future task), sculpt a fast
   jittery stroke and confirm even spacing + smoothness, and that strokes leaving the mesh
   stay on the camera-facing plane rather than snapping to the origin.

`npx tsgo --noEmit` must stay clean for the new file and the `PaintSample` change.
