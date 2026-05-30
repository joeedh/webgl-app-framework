import {CommandExecutor, Brush as WasmBrush, BrushProgram} from '@sculptcore/api'
import {IWasmInterface} from '@sculptcore/api/api'
import {SculptBrush} from '../../../brush/index'
import {StructType} from '@litestl/typescript-runtime'
import {LiteMesh} from '../../../lite-mesh/index'
import {SculptBrushes} from '@sculptcore/api/sculptcore/brush/SculptBrushes'
import {SculptTools, BrushFlags} from '../../../brush/brush_base'

/** Mirror of the C++ enum FalloffShape (brush.h); passed to setFalloffShape. */
const FalloffShape = {Spherical: 0, Cube: 1, Linear: 2, Box: 3} as const

/** Mirror of C++ enum DeviceType (prop_dynamics.h). */
const DeviceType = {
  PRESSURE: 0,
  TILTX: 1,
  TILTY: 2,
  SPEED: 3,
  ANGLE: 4,
  CURVATURE: 5,
  TWIST: 6,
} as const

/** Mirror of C++ enum BasicMix (litestl/math/mix.h). */
const BasicMix = {LINEAR: 0, MULTIPLY: 1, ADD: 2, SUBTRACT: 3, DIFFERENCE: 4} as const

/**
 * Mirror of C++ enum `BrushProp` (brush.h). Float props are addressed by id,
 * not name, across the binding — the TS runtime can't marshal a JS string into
 * a `util::string` parameter.
 */
const BrushProp = {STRENGTH: 0, RADIUS: 1, AUTOSMOOTH: 2, PLANEOFF: 3, SPACING: 4} as const

/**
 * TS BrushDynamics channel → sculptcore Brush prop id. Only channels backed by
 * a bound float prop are bridged; channels with no sculptcore equivalent (rake,
 * concaveFilter, …) are skipped.
 */
const DYNAMIC_CHANNEL_TO_PROP: Record<string, number> = {
  strength: BrushProp.STRENGTH,
  radius: BrushProp.RADIUS,
  autosmooth: BrushProp.AUTOSMOOTH,
}
const DYN_CURVE_SAMPLES = 32

/**
 * Configure the brush's pen-dynamics stack from the TS BrushDynamics channels
 * (called once per stroke). Each channel with `useDynamics` adds a PRESSURE
 * device whose response curve is the channel's `Curve1D` baked into a 32-entry
 * table, applied multiplicatively — this is the C++-side replacement for the
 * old TS `getchannel()` curve eval.
 */
export function configureBrushDynamics(wasmBrush: WasmBrush, brush: SculptBrush): void {
  for (const propId of Object.values(DYNAMIC_CHANNEL_TO_PROP)) {
    wasmBrush.clearPropDynamics(propId)
  }
  for (const chanName in DYNAMIC_CHANNEL_TO_PROP) {
    const propId = DYNAMIC_CHANNEL_TO_PROP[chanName]
    const ch = brush.dynamics.getChannel(chanName, false)
    if (!ch || !ch.useDynamics) {
      continue
    }
    wasmBrush.addPropDynamic(propId, DeviceType.PRESSURE, BasicMix.MULTIPLY, 1.0)
    for (let i = 0; i < DYN_CURVE_SAMPLES; i++) {
      const x = i / (DYN_CURVE_SAMPLES - 1)
      const y = ch.curve.evaluate(x)
      wasmBrush.setPropDynamicSample(propId, DeviceType.PRESSURE, i, DYN_CURVE_SAMPLES, y)
    }
  }
}

/**
 * Push per-dab device samples for the next loadProps. Only PRESSURE is consumed
 * today (the one device `configureBrushDynamics` wires up); tilt/twist are
 * pushed but currently inert until a channel maps to them. Mouse has no
 * pressure, so it reads as full strength (curve(1) ≈ 1).
 */
export function pushBrushDeviceInputs(wasmBrush: WasmBrush, e: PointerEvent): void {
  wasmBrush.clearDeviceInputs()
  const pressure = e.pointerType === 'mouse' ? 1.0 : e.pressure || 1.0
  wasmBrush.pushDeviceInput(DeviceType.PRESSURE, pressure)
  wasmBrush.pushDeviceInput(DeviceType.TILTX, (e.tiltX || 0) / 90)
  wasmBrush.pushDeviceInput(DeviceType.TILTY, (e.tiltY || 0) / 90)
  const twist = (e as PointerEvent & {twist?: number}).twist
  if (twist !== undefined) {
    wasmBrush.pushDeviceInput(DeviceType.TWIST, twist / 360)
  }
}

/**
 * Maps a TS `SculptTools` brush tool to the sculptcore `SculptBrushes` kernel
 * that implements it. Tools with no sculptcore equivalent are absent from the
 * map; the caller (`SculptPaintOp`) warns and skips those.
 *
 * The plane family CLAY/SCRAPE/FILL all run the `plane` kernel; the per-tool
 * planeoff/planeSide uniforms (set in `configureToolUniforms`) select build-up
 * / cut / fill. WING_SCRAPE runs its own kernel.
 */
export const TOOL_TO_SCULPTBRUSH: Partial<Record<SculptTools, SculptBrushes>> = {
  [SculptTools.DRAW]:        SculptBrushes.DRAW,
  [SculptTools.SMOOTH]:      SculptBrushes.SMOOTH,
  [SculptTools.INFLATE]:     SculptBrushes.INFLATE,
  [SculptTools.SHARP]:       SculptBrushes.SHARP,
  [SculptTools.PINCH]:       SculptBrushes.PINCH,
  [SculptTools.MASK_PAINT]:  SculptBrushes.MASK,
  [SculptTools.CLAY]:        SculptBrushes.CLAY,
  [SculptTools.SCRAPE]:      SculptBrushes.SCRAPE,
  [SculptTools.FILL]:        SculptBrushes.FILL,
  [SculptTools.WING_SCRAPE]: SculptBrushes.WINGSCRAPE,
}

/** Resolve a TS sculpt tool to its sculptcore kernel, or undefined if none. */
export function toolToSculptBrush(tool: SculptTools): SculptBrushes | undefined {
  return TOOL_TO_SCULPTBRUSH[tool]
}

/**
 * (Re)build a composite brush program for one dab: the main brush command,
 * plus a chained SMOOTH command (autosmooth) when `brush.autosmooth > 0`.
 *
 * The SMOOTH command's strength is scaled so the kernel's effective smooth
 * factor (`strength * falloff * radius * 0.1`) lands at `autosmooth * falloff`
 * independent of the per-dab screen radius. The program is run over the same
 * node set, so SMOOTH re-snapshots `co_prev` after the main pass and smooths
 * the deformed result.
 */
export function buildBrushProgram(
  prog: BrushProgram,
  mainBrushType: SculptBrushes,
  brush: SculptBrush,
  radius: number
): void {
  prog.clear()
  prog.addCommand(mainBrushType)

  if (brush.autosmooth > 0 && radius > 0) {
    const smoothStrength = brush.autosmooth / (radius * 0.1)
    const i = prog.addCommand(SculptBrushes.SMOOTH)
    prog.setCommandFloat(i, BrushProp.STRENGTH, smoothStrength)
  }
}

/**
 * Configure the plane-family + wing + falloff uniforms on `wasmBrush` for the
 * active TS tool. Clay/Scrape/Fill share one kernel, selected by `planeoff`
 * (signed offset ×radius) and `planeSide` (+1/-1); SQUARE-flagged brushes use
 * the stroke-aligned oriented Box falloff (the executor sets falloff_dir =
 * strokeDir per dab).
 *
 * Must run before the per-dab `writeProps()` so the props-backed `planeoff`
 * round-trips through `loadProps`; `planeSide` / `falloff_shape` are plain
 * members that `loadProps` leaves untouched.
 */
export function configureToolUniforms(wasmBrush: WasmBrush, brush: SculptBrush): void {
  wasmBrush.setFalloffShape(FalloffShape.Spherical)
  wasmBrush.planeoff = 0.0
  wasmBrush.planeSide = 1.0

  switch (brush.tool) {
    case SculptTools.CLAY:
      // Plane above the surface; pull verts below it up (build material up).
      wasmBrush.planeoff = 0.05 + brush.planeoff * 0.1
      wasmBrush.planeSide = 1.0
      break
    case SculptTools.SCRAPE:
      // Plane below the surface; pull verts above it down (cut away).
      wasmBrush.planeoff = -0.05 + brush.planeoff * 0.1
      wasmBrush.planeSide = -1.0
      break
    case SculptTools.FILL:
      // Plane at the surface; fill cavities behind it up to the plane.
      wasmBrush.planeoff = brush.planeoff * 0.1
      wasmBrush.planeSide = 1.0
      break
    case SculptTools.WING_SCRAPE:
      // Half-angle of the two stroke-following wing planes.
      wasmBrush.wingAngle = 0.3
      break
  }

  // SQUARE brushes get the stroke-aligned oriented cuboid falloff.
  if (brush.flag & BrushFlags.SQUARE) {
    wasmBrush.setFalloffShape(FalloffShape.Box)
  }
}

export function builSculptcoreBrush({
  wasm,
  brush,
  wasmBrush,
  radius,
  invert,
  wasmExec,
  mesh,
}: {
  wasm: IWasmInterface
  brush: SculptBrush
  wasmBrush?: WasmBrush
  radius: number
  invert: boolean
  wasmExec?: CommandExecutor
  mesh: LiteMesh
}) {
  let freshBrush = false
  if (wasmBrush === undefined) {
    wasmBrush = wasm.manager.construct('sculptcore::brush::Brush')
    freshBrush = true
    if (wasmExec !== undefined) {
      wasmExec[Symbol.dispose]()
      wasmExec = undefined
    }
  }

  // sync properties
  wasmBrush.strength = brush.strength
  wasmBrush.radius = radius
  wasmBrush.invert = invert
  wasmBrush.spacing = brush.spacing
  wasmBrush.autosmooth = brush.autosmooth

  // Per-tool plane / wing / falloff uniforms (runs before the caller's
  // writeProps() so props-backed scalars round-trip through loadProps).
  configureToolUniforms(wasmBrush, brush)

  // Pen-dynamics stack only needs (re)building when the brush is fresh — its
  // channels/curves are fixed for the stroke.
  if (freshBrush) {
    configureBrushDynamics(wasmBrush, brush)
  }

  if (wasmExec === undefined) {
    const st = wasm.manager.get('sculptcore::brush::CommandExecutor') as StructType
    const ctor = st.findConstructor('main')!
    wasmExec = wasm.manager.constructWith(ctor, mesh.spatial, wasmBrush) as CommandExecutor
    // SMOOTH (and autosmooth) read neighbors from the CSR ring1 cache, not the
    // live disk — a freshly built LiteMesh doesn't maintain live disk links, so
    // LiveDisk smooth would find no neighbors and no-op. (1 = NeighborMode::Csr)
    wasmExec.setNeighborMode(1)
  }

  return {wasmExec, wasmBrush}
}
