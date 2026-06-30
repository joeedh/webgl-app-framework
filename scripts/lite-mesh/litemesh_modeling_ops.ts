/**
 * Box-modeling tools for sculptcore LiteMeshes (Milestone 0 of
 * documentation/plans/boxModelingTools.md): the selection tools.
 *
 * Every op is a thin interaction shell — all the geometry (pick, region query,
 * shortest path) and the `select` attribute writes happen in C++ through the
 * shared MeshLog, so selection rides undo/redo on the same per-step element swap
 * as positions (the draft's "selection is undoable"). The undo plumbing mirrors
 * `ReorderLocalityOp` (`litemesh_ops.ts`): `undoPre` empty, `exec` runs the C++
 * select against the shared MeshLog and captures `lastStepId()`, `undo`/`redo`
 * route through `MeshLog.undo/redo`, `calcUndoMem` reports `stepMemSize`.
 *
 * Per the draft, selection is NOT reset between tools and `shift` deselects
 * (no-shift selects). Which element domains a tool writes is the toolmode's
 * selection mode (vertex/edge/face bitmask), mapped to the C++ domain codes
 * 0 = vertex, 1 = edge, 2 = face.
 */
import {
  EnumProperty,
  FloatProperty,
  BoolProperty,
  Mat4Property,
  PropertySlots,
  ToolMacro,
  ToolOp,
  Vector2,
  Vector3,
  Vector4,
  Matrix4,
} from '../path.ux/scripts/pathux'
import type {ViewContext, ToolContext} from '../core/context'
import type {SceneObject} from '../sceneobject/sceneobject'
import type {View3D} from '../editors/view3d/view3d'
import {SelMask, SelToolModes} from '../editors/view3d/selectmode'
import {SculptPaintOp} from '../editors/view3d/tools/sculptcore_ops'
import {TranslateOp} from '../editors/view3d/transform/transform_ops'
import {LiteMesh, IMeshLogSelect} from './litemesh'
import {LiteMeshOp} from './litemesh_ops'
import {Icons} from '../editors/icon_enum.js'

/** Map a SelMask bitmask (VERTEX=1/EDGE=2/FACE=4) to the C++ domain codes
 * (0/1/2). Defaults to vertex when nothing is set. */
export function selMaskToDomains(mask: number): number[] {
  const ds: number[] = []
  if (mask & SelMask.VERTEX) ds.push(0)
  if (mask & SelMask.EDGE) ds.push(1)
  if (mask & SelMask.FACE) ds.push(2)
  return ds.length ? ds : [0]
}

/** The box-modeling fields the toolmode exposes that the ops read. */
interface IBoxModelToolMode {
  boxModelSelMode?: number
  selectRadius?: number
}

/** Structural view of the modal context the selection ops touch. */
interface SelModalView3D {
  getLocalMouse(x: number, y: number): {0: number; 1: number}
  activeCamera: {rendermat: Matrix4; pos: Vector3}
  unproject(p: Vector4, mat: Matrix4): void
  overdraw?: {clear(): void; line(a: number[], b: number[], color: string): unknown}
}
interface SelModalCtx {
  view3d?: SelModalView3D & View3D
  object?: SceneObject
  toolmode?: IBoxModelToolMode
}

/**
 * Shared base for the undoable selection ops. The actual selection happens in
 * `exec` (which opens/closes one MeshLog step); undo/redo defer to MeshLog, so
 * `exec` runs exactly once per logical operation (the framework for non-modal
 * ops, the modal commit for modal ones) and redo never re-runs it.
 */
export abstract class LiteMeshSelectOpBase<
  Inputs extends PropertySlots = {},
  Outputs extends PropertySlots = {},
> extends LiteMeshOp<Inputs, Outputs> {
  /** MeshLog step id owned by this op (-1 = none); keys calcUndoMem/onUndoDestroy. */
  _logStepId = -1

  _getMesh(ctx: ToolContext): LiteMesh | undefined {
    const data = ctx.scene?.objects?.active?.data
    return data instanceof LiteMesh ? data : undefined
  }

  /** The shared C++ MeshLog, cast to its box-modeling selection surface. */
  _log(): IMeshLogSelect {
    return SculptPaintOp.ensureMeshLog() as unknown as IMeshLogSelect
  }

  /** Domains (0/1/2) the active toolmode selection mode covers. */
  _domains(ctx: ToolContext): number[] {
    const mode = (ctx.toolmode as unknown as IBoxModelToolMode | undefined)?.boxModelSelMode
    return selMaskToDomains(mode ?? SelMask.VERTEX)
  }

  /** Push the new active elements into the LiteMesh overlay + redraw. */
  _refreshOverlay(mesh: LiteMesh, log: IMeshLogSelect): void {
    mesh.markSelectionDirty(log.activeVert(), log.activeEdge(), log.activeFace())
    window.redraw_viewport()
  }

  undoPre(_ctx: ToolContext): void {}

  calcUndoMem(_ctx: ToolContext): number {
    const log = SculptPaintOp.meshLog
    return log && this._logStepId >= 0 ? log.stepMemSize(this._logStepId) : 0
  }

  onUndoDestroy(): void {
    const log = SculptPaintOp.meshLog
    if (log && this._logStepId >= 0) {
      log.freeStep(this._logStepId)
      this._logStepId = -1
    }
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    const log = SculptPaintOp.meshLog
    if (mesh && log) {
      log.undo(mesh.mesh, mesh.spatial)
      this._refreshOverlay(mesh, log as unknown as IMeshLogSelect)
    }
  }

  redo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    const log = SculptPaintOp.meshLog
    if (mesh && log) {
      log.redo(mesh.mesh, mesh.spatial)
      this._refreshOverlay(mesh, log as unknown as IMeshLogSelect)
    }
  }
}

/**
 * Select all / none / auto (auto = all-if-nothing-selected, else none). Operates
 * on every domain in the current selection mode.
 */
export class SelectAllLiteMeshOp extends LiteMeshSelectOpBase<{mode: EnumProperty}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.select_all',
      uiname  : 'Select All',
      inputs: {
        // ALL select everything, NONE clear, AUTO toggle by current count.
        mode: new EnumProperty(2, {ALL: 0, NONE: 1, AUTO: 2}),
      },
    }
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const log = this._log()
    const domains = this._domains(ctx)
    let mode = this.inputs.mode.getValue()
    if (mode === 2) {
      // auto: select-all unless something is already selected in any domain.
      let any = 0
      for (const d of domains) {
        any += (mesh.mesh as unknown as {selectedCount(d: number): number}).selectedCount(d)
      }
      mode = any > 0 ? 1 : 0
    }
    const state = mode === 0 ? 1 : 0

    log.selectionBeginStep()
    for (const d of domains) {
      log.selectAllElems(mesh.mesh, d, state)
    }
    log.selectionEndStep()
    this._logStepId = log.lastStepId()
    this._refreshOverlay(mesh, log)
  }
}

/**
 * Box select: rubber-band a screen rectangle, then select (or, with shift,
 * deselect) the elements inside it across the current selection-mode domains.
 */
export class SelectBoxLiteMeshOp extends LiteMeshSelectOpBase<{mode: EnumProperty}> {
  mdown = false
  start = new Vector2()
  end = new Vector2()

  static tooldef() {
    return {
      toolpath: 'litemesh.select_box',
      uiname  : 'Box Select',
      is_modal: true,
      inputs: {
        mode: new EnumProperty(SelToolModes.ADD, SelToolModes).private(),
      },
    }
  }

  _ctx(): SelModalCtx | undefined {
    return this.modal_ctx as unknown as SelModalCtx | undefined
  }

  on_pointerdown(e: PointerEvent): void {
    const ctx = this._ctx()
    if (!ctx?.view3d) {
      return
    }
    if (e.button === 2) {
      this.modalEnd(true)
      return
    }
    this.inputs.mode.setValue(e.shiftKey ? SelToolModes.SUB : SelToolModes.ADD)
    const m = ctx.view3d.getLocalMouse(e.x, e.y)
    this.start.load(m as unknown as Vector2)
    this.end.load(m as unknown as Vector2)
    this.mdown = true
  }

  on_pointermove(e: PointerEvent): void {
    if (!this.mdown) {
      return
    }
    const ctx = this._ctx()
    if (!ctx?.view3d) {
      return
    }
    this.end.load(ctx.view3d.getLocalMouse(e.x, e.y) as unknown as Vector2)
    this._drawRect(ctx.view3d)
  }

  on_pointerup(_e: PointerEvent): void {
    const ctx = this._ctx()
    if (this.mdown && ctx) {
      this._apply(ctx as unknown as ToolContext)
    }
    this.mdown = false
    ctx?.view3d?.overdraw?.clear()
    this.modalEnd(false)
  }

  on_keydown(e: KeyboardEvent): void {
    if (e.code === 'Escape') {
      this._ctx()?.view3d?.overdraw?.clear()
      this.modalEnd(true)
    }
  }

  private _drawRect(view3d: SelModalView3D): void {
    if (!view3d.overdraw) {
      return
    }
    view3d.overdraw.clear()
    const a = this.start
    const b = this.end
    view3d.overdraw.line([a[0], a[1]], [b[0], a[1]], 'white')
    view3d.overdraw.line([b[0], a[1]], [b[0], b[1]], 'white')
    view3d.overdraw.line([b[0], b[1]], [a[0], b[1]], 'white')
    view3d.overdraw.line([a[0], b[1]], [a[0], a[1]], 'white')
  }

  /** Apply the box selection in one MeshLog step (run once, from on_pointerup —
   * not exec, so the framework can't double-create the step). */
  private _apply(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    const view3d = (ctx as unknown as SelModalCtx).view3d
    const object = (ctx as unknown as SelModalCtx).object
    if (!mesh || !view3d || !object) {
      return
    }
    const min = new Vector2([Math.min(this.start[0], this.end[0]), Math.min(this.start[1], this.end[1])])
    const max = new Vector2([Math.max(this.start[0], this.end[0]), Math.max(this.start[1], this.end[1])])
    const state = this.inputs.mode.getValue() === SelToolModes.SUB ? 0 : 1

    const log = this._log()
    log.selectionBeginStep()
    for (const d of this._domains(ctx)) {
      mesh.selectRect(view3d, object, min, max, d, state, log)
    }
    log.selectionEndStep()
    this._logStepId = log.lastStepId()
    this._refreshOverlay(mesh, log)
  }

  // Work happens live in the modal; redo replays via MeshLog.
  exec(_ctx: ToolContext) {}
}

/**
 * Circle/brush select: drag with a circular brush, continuously selecting (or
 * deselecting, with shift) elements under it. The whole drag is one undo step —
 * the C++ side snapshots each element only on first touch.
 */
export class SelectCircleLiteMeshOp extends LiteMeshSelectOpBase<{radius: FloatProperty; mode: EnumProperty}> {
  mdown = false
  _inStep = false

  static tooldef() {
    return {
      toolpath: 'litemesh.select_circle',
      uiname  : 'Circle Select',
      is_modal: true,
      inputs: {
        radius: new FloatProperty(25).setRange(1, 500).noUnits().saveLastValue(),
        mode  : new EnumProperty(SelToolModes.ADD, SelToolModes).private(),
      },
    }
  }

  _ctx(): SelModalCtx | undefined {
    return this.modal_ctx as unknown as SelModalCtx | undefined
  }

  modalStart(ctx: ViewContext) {
    this.mdown = false
    this._inStep = false
    const radius = (ctx.toolmode as unknown as IBoxModelToolMode | undefined)?.selectRadius
    if (radius) {
      this.inputs.radius.setValue(radius)
    }
    return super.modalStart(ctx)
  }

  /** Open the single accumulating MeshLog step lazily on the first stamp. */
  private _ensureStep(log: IMeshLogSelect): void {
    if (!this._inStep) {
      log.selectionBeginStep()
      this._inStep = true
    }
  }

  private _stamp(e: PointerEvent): void {
    const ctx = this._ctx()
    const mesh = ctx ? this._getMesh(ctx as unknown as ToolContext) : undefined
    if (!ctx?.view3d || !ctx.object || !mesh) {
      return
    }
    const m = ctx.view3d.getLocalMouse(e.x, e.y)
    const mpos = new Vector2([m[0], m[1]])
    const state = e.shiftKey ? 0 : 1
    const radius = this.inputs.radius.getValue()
    const log = this._log()
    this._ensureStep(log)
    for (const d of this._domains(ctx as unknown as ToolContext)) {
      mesh.selectCircle(ctx.view3d, ctx.object, mpos, radius, d, state, log)
    }
    this._refreshOverlay(mesh, log)
  }

  on_pointerdown(e: PointerEvent): void {
    if (e.button === 2) {
      this._commit()
      this.modalEnd(false)
      return
    }
    this.mdown = true
    this._stamp(e)
  }

  on_pointermove(e: PointerEvent): void {
    if (this.mdown) {
      this._stamp(e)
    }
  }

  on_pointerup(_e: PointerEvent): void {
    this.mdown = false
  }

  on_keydown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
      this._commit()
      this.modalEnd(e.code === 'Escape')
    }
  }

  /** Close the accumulated step and record it for undo. */
  private _commit(): void {
    if (!this._inStep) {
      return
    }
    const log = this._log()
    log.selectionEndStep()
    this._inStep = false
    this._logStepId = log.lastStepId()
  }

  // Work happens live during the drag; nothing to do on a re-exec.
  exec(_ctx: ToolContext) {}
}

/**
 * Select the single element nearest the cursor (within the brush radius), and
 * make it the active element of its domain. The picking domain is the first one
 * enabled in the selection mode (vertex, else edge, else face).
 */
export class SelectNearestLiteMeshOp extends LiteMeshSelectOpBase<{mode: EnumProperty}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.select_nearest',
      uiname  : 'Select',
      is_modal: true,
      inputs: {
        mode: new EnumProperty(SelToolModes.ADD, SelToolModes).private(),
      },
    }
  }

  _ctx(): SelModalCtx | undefined {
    return this.modal_ctx as unknown as SelModalCtx | undefined
  }

  private _localRay(view3d: SelModalView3D, obmatrix: Matrix4, lx: number, ly: number) {
    const imat = new Matrix4(obmatrix)
    imat.multiply(view3d.activeCamera.rendermat)
    imat.invert()
    const d = 0.9999
    const p1 = new Vector4([lx, ly, -d, 1.0])
    view3d.unproject(p1, imat)
    const origin = new Vector3(p1)
    const p2 = new Vector4([lx, ly, d, 1.0])
    view3d.unproject(p2, imat)
    const dir = new Vector3(p2).sub(origin)
    return {origin, dir}
  }

  on_pointerdown(e: PointerEvent): void {
    const ctx = this._ctx()
    if (e.button === 2) {
      this.modalEnd(true)
      return
    }
    if (e.button !== 0 || !ctx?.view3d || !ctx.object) {
      return
    }
    this.inputs.mode.setValue(e.shiftKey ? SelToolModes.SUB : SelToolModes.ADD)
    const mesh = this._getMesh(ctx as unknown as ToolContext)
    if (!mesh) {
      this.modalEnd(false)
      return
    }
    const m = ctx.view3d.getLocalMouse(e.x, e.y)
    const obmatrix = ctx.object.outputs.matrix.getValue()
    const {origin, dir} = this._localRay(ctx.view3d, obmatrix, m[0], m[1])

    const domain = this._domains(ctx as unknown as ToolContext)[0]
    let idx = -1
    if (domain === 2) {
      idx = mesh.pickFace(origin, dir)
    } else {
      // vertex (and, for now, edge mode) resolve to the nearest vertex hit.
      idx = mesh.pickVert(origin, dir)
    }
    if (idx < 0) {
      this.modalEnd(false)
      return
    }
    const pickDomain = domain === 2 ? 2 : 0
    const state = e.shiftKey ? false : true

    const log = this._log()
    log.selectionBeginStep()
    log.selectOne(mesh.mesh, pickDomain, idx, state)
    log.setActiveElem(pickDomain, idx)
    log.selectionEndStep()
    this._logStepId = log.lastStepId()
    this._refreshOverlay(mesh, log)
    this.modalEnd(false)
  }

  // Work happens in on_pointerdown; redo replays via MeshLog.
  exec(_ctx: ToolContext) {}
}

/**
 * Select the shortest edge-path from the active vertex to the clicked vertex;
 * the clicked vertex becomes the new active vertex. Click again to extend.
 */
export class SelectPathLiteMeshOp extends LiteMeshSelectOpBase<{mode: EnumProperty}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.select_path',
      uiname  : 'Select Shortest Path',
      is_modal: true,
      inputs: {
        mode: new EnumProperty(SelToolModes.ADD, SelToolModes).private(),
      },
    }
  }

  _ctx(): SelModalCtx | undefined {
    return this.modal_ctx as unknown as SelModalCtx | undefined
  }

  private _localRay(view3d: SelModalView3D, obmatrix: Matrix4, lx: number, ly: number) {
    const imat = new Matrix4(obmatrix)
    imat.multiply(view3d.activeCamera.rendermat)
    imat.invert()
    const d = 0.9999
    const p1 = new Vector4([lx, ly, -d, 1.0])
    view3d.unproject(p1, imat)
    const origin = new Vector3(p1)
    const p2 = new Vector4([lx, ly, d, 1.0])
    view3d.unproject(p2, imat)
    const dir = new Vector3(p2).sub(origin)
    return {origin, dir}
  }

  on_pointerdown(e: PointerEvent): void {
    const ctx = this._ctx()
    if (e.button === 2) {
      this.modalEnd(false)
      return
    }
    if (e.button !== 0 || !ctx?.view3d || !ctx.object) {
      return
    }
    const mesh = this._getMesh(ctx as unknown as ToolContext)
    if (!mesh) {
      return
    }
    const m = ctx.view3d.getLocalMouse(e.x, e.y)
    const obmatrix = ctx.object.outputs.matrix.getValue()
    const {origin, dir} = this._localRay(ctx.view3d, obmatrix, m[0], m[1])
    const vEnd = mesh.pickVert(origin, dir)
    if (vEnd < 0) {
      return
    }
    const state = e.shiftKey ? 0 : 1

    const log = this._log()
    log.selectionBeginStep()
    // From-active path select; vEnd becomes the new active vertex. With no prior
    // active vertex the C++ side just sets active and selects nothing.
    log.selectShortestPath(mesh.mesh, vEnd, state)
    log.selectOne(mesh.mesh, 0, vEnd, state !== 0)
    log.setActiveElem(0, vEnd)
    log.selectionEndStep()
    this._logStepId = log.lastStepId()
    this._refreshOverlay(mesh, log)
  }

  on_keydown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
      this.modalEnd(e.code === 'Escape')
    }
  }

  exec(_ctx: ToolContext) {}
}

/**
 * Shared base for box-modeling topology ops. The C++ macro-op runs inside one
 * MeshLog step (so it's one undo press); since topology changes wholesale, the
 * spatial tree is rebuilt after exec/undo/redo (a perf follow-up is the
 * incremental dyntopo tree path). Undo/redo route through MeshLog.
 */
export abstract class LiteMeshTopoOpBase<
  Inputs extends PropertySlots = {},
  Outputs extends PropertySlots = {},
> extends LiteMeshOp<Inputs, Outputs> {
  _logStepId = -1

  _getMesh(ctx: ToolContext): LiteMesh | undefined {
    const data = ctx.scene?.objects?.active?.data
    return data instanceof LiteMesh ? data : undefined
  }

  _log(): IMeshLogSelect {
    return SculptPaintOp.ensureMeshLog() as unknown as IMeshLogSelect
  }

  undoPre(_ctx: ToolContext): void {}

  calcUndoMem(_ctx: ToolContext): number {
    const log = SculptPaintOp.meshLog
    return log && this._logStepId >= 0 ? log.stepMemSize(this._logStepId) : 0
  }

  onUndoDestroy(): void {
    const log = SculptPaintOp.meshLog
    if (log && this._logStepId >= 0) {
      log.freeStep(this._logStepId)
      this._logStepId = -1
    }
  }

  /** Rebuild the tree + normals + overlay after a topology change. */
  _afterTopoChange(mesh: LiteMesh): void {
    mesh.rebuildSpatialFromEdit()
    mesh.recalcNormals()
    mesh.regenBounds()
    const log = this._log()
    mesh.markSelectionDirty(log.activeVert(), log.activeEdge(), log.activeFace())
    window.redraw_viewport()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    const log = SculptPaintOp.meshLog
    if (mesh && log) {
      log.undo(mesh.mesh, mesh.spatial)
      this._afterTopoChange(mesh)
    }
  }

  redo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    const log = SculptPaintOp.meshLog
    if (mesh && log) {
      log.redo(mesh.mesh, mesh.spatial)
      this._afterTopoChange(mesh)
    }
  }
}

/** Build the geom-op + TranslateOp macro for a "T" tool (one undo unit). The
 * geom op's `normalSpace` output is wired to the translate's constraint space and
 * the constraint is locked to that space's Z (the extrude normal). */
function makeTransformMacro(tool: ToolOp, constrainNormal = true): ToolMacro<ToolContext> {
  const macro = new ToolMacro<ToolContext>()
  macro.add(tool)
  const translate = new TranslateOp()
  translate.inputs.selmask.setValue(SelMask.GEOM)
  macro.add(translate)
  if (constrainNormal) {
    // Lock the drag to the geom op's averaged normal (extrude/inset lift).
    translate.inputs.constraint.setValue([0, 0, 1])
    macro.connect(tool, 'normalSpace', translate, 'constraint_space')
  }
  return macro
}

/** Extrude the selected face region, then (with transform=1) grab the new region
 * along its averaged normal. */
export class LiteMeshExtrudeRegionOp extends LiteMeshTopoOpBase<{}, {normalSpace: Mat4Property}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.extrude_region',
      uiname  : 'Extrude Region',
      icon    : Icons.EXTRUDE,
      // transform=1 chains a modal grab via a ToolMacro (one undo unit).
      inputs  : {transform: new BoolProperty(false).private()},
      outputs : {normalSpace: new Mat4Property()},
    }
  }

  static invoke(ctx: ViewContext, args: Record<string, unknown>): ToolOp {
    const tool = super.invoke(ctx, args) as unknown as LiteMeshExtrudeRegionOp
    if (args['transform']) {
      return makeTransformMacro(tool) as unknown as ToolOp
    }
    return tool as unknown as ToolOp
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const log = this._log()
    const no = mesh.extrudeRegion(log)
    this._logStepId = log.lastStepId()
    this._afterTopoChange(mesh)
    const n = new Vector3(no.length === 3 ? no : [0, 0, 1])
    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(n))
  }
}

/** Extrude each selected face individually (split adjacent faces), then grab. */
export class LiteMeshExtrudeIndividualOp extends LiteMeshTopoOpBase<{}, {normalSpace: Mat4Property}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.extrude_individual',
      uiname  : 'Extrude Individual Faces',
      icon    : Icons.EXTRUDE,
      inputs  : {transform: new BoolProperty(false).private()},
      outputs : {normalSpace: new Mat4Property()},
    }
  }

  static invoke(ctx: ViewContext, args: Record<string, unknown>): ToolOp {
    const tool = super.invoke(ctx, args) as unknown as LiteMeshExtrudeIndividualOp
    if (args['transform']) {
      return makeTransformMacro(tool) as unknown as ToolOp
    }
    return tool as unknown as ToolOp
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const log = this._log()
    const no = mesh.extrudeIndividual(log)
    this._logStepId = log.lastStepId()
    this._afterTopoChange(mesh)
    const n = new Vector3(no.length === 3 ? no : [0, 0, 1])
    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(n))
  }
}

/** Extrude selected verts as wires, then (with transform=1) grab the duplicates. */
export class LiteMeshExtrudeWireOp extends LiteMeshTopoOpBase<{}, {normalSpace: Mat4Property}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.extrude_wire',
      uiname  : 'Extrude Wire',
      icon    : Icons.EXTRUDE,
      inputs  : {transform: new BoolProperty(false).private()},
      outputs : {normalSpace: new Mat4Property()},
    }
  }

  static invoke(ctx: ViewContext, args: Record<string, unknown>): ToolOp {
    const tool = super.invoke(ctx, args) as unknown as LiteMeshExtrudeWireOp
    if (args['transform']) {
      return makeTransformMacro(tool) as unknown as ToolOp
    }
    return tool as unknown as ToolOp
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const log = this._log()
    const no = mesh.extrudeWireVerts(log)
    this._logStepId = log.lastStepId()
    this._afterTopoChange(mesh)
    const n = new Vector3(no.length === 3 ? no : [0, 0, 1])
    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(n))
  }
}

/** Split (detach) the selected face region off the mesh, then (transform=1) grab
 * the detached piece with a free translate. */
export class LiteMeshSplitOffOp extends LiteMeshTopoOpBase<{}, {normalSpace: Mat4Property}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.split_off',
      uiname  : 'Split Faces Off',
      icon    : Icons.EXTRUDE,
      inputs  : {transform: new BoolProperty(false).private()},
      outputs : {normalSpace: new Mat4Property()},
    }
  }

  static invoke(ctx: ViewContext, args: Record<string, unknown>): ToolOp {
    const tool = super.invoke(ctx, args) as unknown as LiteMeshSplitOffOp
    if (args['transform']) {
      // Free translate — drag the detached region anywhere.
      return makeTransformMacro(tool, false) as unknown as ToolOp
    }
    return tool as unknown as ToolOp
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const log = this._log()
    const no = mesh.splitFacesOff(log)
    this._logStepId = log.lastStepId()
    this._afterTopoChange(mesh)
    const n = new Vector3(no.length === 3 ? no : [0, 0, 1])
    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(n))
  }
}

/**
 * Parametric inset of the selected face region. Builds the inset ring up front
 * (one open MeshLog step), then the mouse drags the inset width —
 * `co = base + width·tangent` per inset vert (the C++ op emits each vert's base
 * position + inward in-plane tangent). Topology + final positions are one undo
 * step (the op holds the step open across the drag). Left-click / Enter confirms;
 * right-click / Esc cancels (undoes the topology). The custom-TransType
 * integration the draft sketches (§3c) is a later refinement — this dedicated
 * modal gives the same single-undo parametric behavior.
 */
export class LiteMeshInsetOp extends LiteMeshTopoOpBase {
  private _inStep = false
  private _mesh?: LiteMesh
  private _idx: number[] = []
  private _idxVec: unknown
  private _base: number[] = []
  private _tan: number[] = []
  private _startX = 0
  private _haveStart = false
  private _scale = 0.01

  static tooldef() {
    return {
      toolpath: 'litemesh.inset_region',
      uiname  : 'Inset Faces',
      icon    : Icons.EXTRUDE,
      is_modal: true,
      inputs  : {},
    }
  }

  _ctx(): SelModalCtx | undefined {
    return this.modal_ctx as unknown as SelModalCtx | undefined
  }

  /** Build the parametric topology in the open step; returns the movable verts +
   * base coords + tangents. Overridden by the bevel op (same drag/confirm modal). */
  protected _buildParametric(
    mesh: LiteMesh,
    log: unknown
  ): {idxVec: unknown; idx: number[]; base: number[]; tangent: number[]} {
    return mesh.insetRegion(log)
  }

  modalStart(ctx: ViewContext) {
    const mesh = this._getMesh(ctx as unknown as ToolContext)
    this._mesh = mesh
    this._haveStart = false
    if (mesh) {
      const log = this._log()
      log.selectionBeginStep()
      const data = this._buildParametric(mesh, log)
      this._idx = data.idx
      this._idxVec = data.idxVec
      this._base = data.base
      this._tan = data.tangent
      mesh.rebuildSpatialFromEdit()
      mesh.markSelectionDirty(log.activeVert(), log.activeEdge(), log.activeFace())
      this._inStep = true
      this._scale = this._computeScale()
      window.redraw_viewport()
    }
    return super.modalStart(ctx as never)
  }

  /** object-local units per screen pixel near the region (drag → width map). */
  private _computeScale(): number {
    const c = this._ctx()
    if (!c?.view3d || !c.object) {
      return 0.01
    }
    const obmat = c.object.outputs.matrix.getValue()
    const imat = new Matrix4(obmat)
    imat.multiply(c.view3d.activeCamera.rendermat)
    imat.invert()
    const d = 0.5
    const p1 = new Vector4([0, 0, d, 1.0])
    c.view3d.unproject(p1, imat)
    const p2 = new Vector4([100, 0, d, 1.0])
    c.view3d.unproject(p2, imat)
    return new Vector3(p1).vectorDistance(new Vector3(p2)) / 100
  }

  private _applyInset(width: number): void {
    const mesh = this._mesh
    if (!mesh) {
      return
    }
    for (let i = 0; i < this._idx.length; i++) {
      const bx = this._base[i * 3] ?? 0
      const by = this._base[i * 3 + 1] ?? 0
      const bz = this._base[i * 3 + 2] ?? 0
      const tx = this._tan[i * 3] ?? 0
      const ty = this._tan[i * 3 + 1] ?? 0
      const tz = this._tan[i * 3 + 2] ?? 0
      mesh.setVertCo(this._idx[i], bx + width * tx, by + width * ty, bz + width * tz)
    }
    if (this._idxVec) {
      mesh.markVertsMovedGPU(this._idxVec)
    }
    mesh.recalcNormals()
    mesh.regenBounds()
    window.redraw_viewport()
  }

  on_pointermove(e: PointerEvent): void {
    const c = this._ctx()
    if (!c?.view3d) {
      return
    }
    const m = c.view3d.getLocalMouse(e.x, e.y)
    if (!this._haveStart) {
      this._startX = m[0]
      this._haveStart = true
      return
    }
    this._applyInset((m[0] - this._startX) * this._scale)
  }

  on_pointerdown(e: PointerEvent): void {
    if (e.button === 2) {
      this._cancel()
      this.modalEnd(true)
      return
    }
    if (e.button === 0) {
      this._confirm()
      this.modalEnd(false)
    }
  }

  on_keydown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      this._confirm()
      this.modalEnd(false)
    } else if (e.code === 'Escape') {
      this._cancel()
      this.modalEnd(true)
    }
  }

  private _confirm(): void {
    if (!this._inStep) {
      return
    }
    const log = this._log()
    log.selectionEndStep()
    this._logStepId = log.lastStepId()
    this._inStep = false
  }

  private _cancel(): void {
    if (!this._inStep) {
      return
    }
    const log = this._log()
    log.selectionEndStep()
    const mesh = this._mesh
    if (mesh && SculptPaintOp.meshLog) {
      SculptPaintOp.meshLog.undo(mesh.mesh, mesh.spatial)
      mesh.rebuildSpatialFromEdit()
      mesh.recalcNormals()
      mesh.regenBounds()
      mesh.markSelectionDirty(-1, -1, -1)
      window.redraw_viewport()
    }
    this._inStep = false
  }

  // Topology + drag happen live in the modal; redo replays via MeshLog.
  exec(_ctx: ToolContext) {}
}

/**
 * Parametric vertex bevel — the edge-split family's bevel/chamfer. Reuses the
 * inset modal wholesale (drag → width, one topology+positions undo step); only
 * the build differs: each selected interior-manifold vert is replaced by an
 * offset vert per incident edge (sliding along that edge) plus a cap n-gon.
 */
export class LiteMeshBevelOp extends LiteMeshInsetOp {
  static tooldef() {
    return {
      toolpath: 'litemesh.bevel_verts',
      uiname  : 'Bevel Vertices',
      icon    : Icons.EXTRUDE,
      is_modal: true,
      inputs  : {},
    }
  }

  protected _buildParametric(mesh: LiteMesh, log: unknown) {
    return mesh.bevelVerts(log)
  }
}

export const BoxModelSelectOps = [
  SelectAllLiteMeshOp,
  SelectBoxLiteMeshOp,
  SelectCircleLiteMeshOp,
  SelectNearestLiteMeshOp,
  SelectPathLiteMeshOp,
]

export const BoxModelTopoOps = [
  LiteMeshExtrudeRegionOp,
  LiteMeshExtrudeIndividualOp,
  LiteMeshExtrudeWireOp,
  LiteMeshSplitOffOp,
  LiteMeshInsetOp,
  LiteMeshBevelOp,
]

for (const op of BoxModelSelectOps) {
  ToolOp.register(op)
}
for (const op of BoxModelTopoOps) {
  ToolOp.register(op)
}

