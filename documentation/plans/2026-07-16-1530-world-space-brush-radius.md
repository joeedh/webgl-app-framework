# World-space brush radius mode

ImmediateTODOs: *"Support world space brush radius mode. Primary (non-symmetry)
brush dabs should keep track of the last valid world and screen space radii, to
be used when switching modes."*

Status: **implemented and verified on a live app** (see Verification). All the
traps below were hit and handled; two are worth re-reading before touching this
code again (`calcRadius` double-apply, SHARED_SIZE indirection).

Known gap: the **pbvh** toolmode's own dab path does not honour `radiusMode` and
never populates the tracked radii, so world mode is sculptcore-only. The UI is
only built in sculptcore's header. Not verified: the tracking write itself
(`applyDabOne`) — it needs a real stroke on a mesh; the conversion either side of
it is verified.

## Today

`SculptBrush.radius` is **screen pixels** (default 55, range 0.1–350). The
screen→world conversion happens once per dab in `SculptPaintOp.applyDab`
(`scripts/editors/view3d/tools/sculptcore_ops.ts`):

```ts
const dist = m2.vectorDistance(p)   // world units per screen pixel at the dab point
radius *= dist                      // :463
```

`dist` is derived by projecting the dab point, stepping one pixel in x, and
unprojecting (`:455-462`).

## Precedent to mirror

Dyntopo already solves this exact problem for edge length:
`DynTopoSettingsSC.resolveEdgeGoal(radius, dist)`
(`scripts/brush/brush_dyntopo_sc.ts:110`) switches on
`DynTopoEdgeModeSC.{WORLD,PIXELS,PERCENT}` — `WORLD` uses the value as-is,
`PIXELS` multiplies by `dist`. `DynTopoModes = {SCREEN, WORLD}` also already
exists in `brush_base.ts`.

Follow that shape rather than inventing a new one.

## Design

1. **Mode enum** in `scripts/brush/brush_base.ts`:
   ```ts
   /** Unit for SculptBrush.radius: screen pixels (default) or mesh/world units. */
   export enum BrushRadiusModes { SCREEN = 0, WORLD = 1 }
   ```
   Prefer an enum field over a `BrushFlags` bit (next free bit is 32768) — it
   mirrors the dyntopo precedent and reads better in the UI.

2. **`SculptBrush.radiusMode`** (`scripts/brush/brush.ts`): add `radiusMode : int;`
   to the STRUCT, the field default, `defineAPI` (`bst.enum(...)`), and the
   three places every brush field must be repeated — `copyTo`, `equals`, and
   `calcHashKey`. Missing `calcHashKey` silently breaks brush-change detection.

3. **Resolve helper on `SculptBrush`**, mirroring `resolveEdgeGoal`:
   ```ts
   /** Resolve `radius` to mesh/world units. `dist` is world-units-per-pixel at
    * the dab point; a SCREEN-mode radius is in pixels and so scales with view. */
   resolveWorldRadius(radius: number, dist: number): number {
     return this.radiusMode === BrushRadiusModes.WORLD ? radius : radius * dist
   }
   ```
   Then `sculptcore_ops.ts:463` becomes `radius = brush.resolveWorldRadius(radius, dist)`.

4. **Track last valid radii** on `SculptCorePaintMode` (needs STRUCT + defineAPI
   if it should persist):
   ```ts
   lastScreenRadius = 0
   lastWorldRadius = 0
   ```
   Written in `applyDab` only when `mirrorIdx === 0` *and* the raycast hit
   (`isect !== undefined`) — that is what "primary (non-symmetry)" and "last
   valid" mean. `screenRadius = worldRadius / dist`.

5. **Mode switch** must not make the brush jump (55 px vs 55 world units is a
   wild size change). Use the tracked pair as the conversion factor:
   `dist ≈ lastWorldRadius / lastScreenRadius`, then
   `radius = mode === WORLD ? radius * dist : radius / dist`.
   Do this in an undoable `brush.set_radius_mode(mode)` ToolOp rather than a raw
   datapath write, so the conversion cannot be bypassed by the UI binding.
   Guard the no-tracking-yet case (both zero → skip conversion).

## Traps found while surveying (do not skip)

- **`calcRadius` is applied twice.** It is called on `brush.radius` when seeding
  the executor (`sculptcore_ops.ts:153`, `:264`) *and* again on `ps.radius` at
  `:422`. It is the identity function today so this is harmless, but making it
  convert would double-apply `dist`. The `:153`/`:264` values are overwritten
  per-dab by `wasmBrush.radius = radius` (`:504`) anyway — pass `brush.radius`
  directly there and delete the identity indirection.
- **There are two dab paths.** `applyDab`/execBrush *and* the standalone
  `opts`-based path (~`:822-984`, `const dist = opts.dist ?? 0`). The second
  receives an already-world radius from its caller — check every caller.
- **The brush overlay assumes pixels.** `SculptCorePaintMode.drawBrush`
  (`sculptcore.ts:~936`) draws a screen-space circle straight from
  `brush.radius`. In WORLD mode it must convert back to screen (divide by the
  tracked `dist`) or the cursor ring will be wrong.
- **The `F` modal assumes pixels.** `SetBrushRadius`
  (`pbvh_base.ts:~325`) seeds `cent_mpos` from `brush.radius / devicePixelRatio`.
  The drag itself is a *ratio* scale, so it is unit-agnostic, but that centre
  offset is not.
- **`pbvh.ts` shares `SculptBrush`.** The legacy pbvh toolmode reads the same
  brush. Decide explicitly whether it honours `radiusMode` or pins to SCREEN;
  doing nothing means it silently misreads a world radius as pixels.
  *Resolved:* left alone — pbvh isn't even instantiated in the app today
  (`toolmode_namemap` holds only `sculptcore`), and the UI is sculptcore-only.
- **SHARED_SIZE is the DEFAULT brush flag**, and it keeps the live radius on the
  toolmode (`sharedBrushRadius`), not on `brush.radius`. Any conversion that
  rewrites `brush.radius` alone is a silent no-op in the default configuration.
  This bit the first cut of `set_radius_mode`.
- **GPU brush path** (`this.gpu.dab(..., radius, filterRadius, ...)`, `:621`)
  takes the world radius — correct once (3) lands, but worth a soak check under
  flag `sculptcore.gpu_brush`.

## Verification

Typecheck cannot see any of the traps above. This needs the app driven for real:
set a world radius, orbit/zoom, and confirm the dab footprint stays fixed in
world space while the cursor ring tracks it; then toggle the mode and confirm
the on-screen size does **not** jump; then `F`-drag in both modes.

Working recipe (used to verify the `F`/sharedBrushRadius fix in `840a1406`):

```sh
node nwjs/launch.mjs --remote-debug --ephemeral    # prints the CDP port
node nwjs/cdp.mjs --port=<PORT> eval "return ..."  # NB: --port=N, and `return`
```

Drive ToolOps non-modally from the eval, the way `boxmodel.ts` does:

```js
const op = ctx.api.createTool(ctx, 'brush.set_radius(radius=123)')
op.is_modal = false                 // else it waits for pointer input forever
ctx.toolstack.execTool(ctx, op)
```

path.ux widgets live in **shadow DOM** — `document.querySelectorAll` finds
nothing; walk `el.shadowRoot` recursively to reach the header chips.

Note the `--eval` *flag* path (`launch.mjs --headless --eval`) does hang, and 13
jest integration suites fail with `dump not written` — but neither blocks manual
CDP verification. See `env_nwjs_jest_wedge`.
