import {FloatProperty, IntProperty, BoolProperty, ToolOp, PropertySlots, Vector3, Vector4, Matrix4} from '../path.ux/scripts/pathux'
import type {ViewContext, ToolContext} from '../core/context'
import {SceneObject} from '../sceneobject/sceneobject'
import {getWasmImmediate} from '@sculptcore/api/api'
import {LiteMesh, AttrDomain} from './litemesh'
import {makeDefaultMaterial} from '../core/material'

export class LiteMeshOp<Inputs extends PropertySlots = {}, Outputs extends PropertySlots = {}> extends ToolOp<
  Inputs,
  Outputs,
  ToolContext,
  ViewContext
> {}

export class AddLiteMeshCubeOp extends LiteMeshOp<{
  //
  sphere: FloatProperty
  dimen: IntProperty
  size: FloatProperty
}> {
  static tooldef() {
    return {
      toolpath: 'litemesh.add_cube',
      inputs: {
        sphere: new FloatProperty(0.0).setRange(0.0, 1.0).noUnits(),
        dimen : new IntProperty(50).setRange(1, 1024).noUnits(),
        size  : new FloatProperty(1.0),
      },
    }
  }

  exec(ctx: ToolContext) {
    const wasm = getWasmImmediate()!
    const {sphere, size, dimen} = this.getInputs()
    const wasmMesh = wasm.Mesh_createCube(dimen, size, sphere)

    const litemesh = new LiteMesh(wasmMesh)
    const ob = new SceneObject(litemesh)
    const mat = makeDefaultMaterial()

    ctx.datalib.add(mat)
    ctx.datalib.add(litemesh)
    ctx.datalib.add(ob)

    mat.lib_addUser(litemesh)
    litemesh.materials.push(mat)

    ctx.scene.add(ob)
    ctx.scene.objects.clearSelection()
    ctx.scene.objects.setSelect(ob, true)
    ctx.scene.objects.setActive(ob)

    window.redraw_viewport(true)
  }
}
ToolOp.register(AddLiteMeshCubeOp)

/** Shared mesh lookup for the attribute ToolOps. */
class LiteMeshAttrOp<Inputs extends PropertySlots = {}, Outputs extends PropertySlots = {}> extends LiteMeshOp<
  Inputs,
  Outputs
> {
  _getMesh(ctx: ToolContext): LiteMesh | undefined {
    const data = ctx.scene?.objects?.active?.data
    return data instanceof LiteMesh ? data : undefined
  }
}

/**
 * Add a new attribute layer (domain/type/use ints; see LiteMesh AttrDomain /
 * AttrType / AttrUseFlags). Undo removes the freshly-created layer by name (it
 * has no data worth preserving — any paint into it is a later, separately-undone
 * op). `_name` is captured at exec for the by-name remove on undo / redo.
 *
 * Note: unlike RemoveAttrOp / GenerateUVOp (which detach/reattach the *same*
 * layer via the C++ stash), redo here re-runs exec and mints a *fresh* layer —
 * `_name` is re-captured each time. That's fine because a just-added layer has
 * no data to preserve, but it does mean a redo can pick a different unique name
 * (`.NNN`) than the original add if the namespace changed in between.
 */
export class AddAttrOp extends LiteMeshAttrOp<{
  domain: IntProperty
  type: IntProperty
  use: IntProperty
}> {
  _name = ''

  static tooldef() {
    return {
      toolpath: 'litemesh.add_attr',
      uiname  : 'Add Attribute',
      inputs: {
        domain: new IntProperty(1),
        type  : new IntProperty(8),
        use   : new IntProperty(0),
      },
    }
  }

  undoPre(_ctx: ToolContext): void {}
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const {domain, type, use} = this.getInputs()
    mesh.addAttr(domain, type, use)
    this._name = mesh._selectedAttr?.attrName ?? ''
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._name) {
      mesh.removeAttrByName(this.getInputs().domain, this._name)
      window.redraw_all?.()
    }
  }
}
ToolOp.register(AddAttrOp)

/**
 * Remove the LiteMesh's currently-selected attribute layer (builtins refused in
 * C++). Detaches the layer into the C++ stash (data preserved, no serialize) so
 * undo restores it intact. The target (domain + name) is captured on the first
 * undoPre so redo re-detaches the same layer regardless of selection state.
 */
export class RemoveAttrOp extends LiteMeshAttrOp {
  _domain = -1
  _name = ''
  _stashId = -1

  static tooldef() {
    return {
      toolpath: 'litemesh.remove_attr',
      uiname  : 'Remove Attribute',
      inputs  : {},
    }
  }

  undoPre(ctx: ToolContext): void {
    if (this._name === '') {
      const sel = this._getMesh(ctx)?._selectedAttr
      if (sel) {
        this._domain = sel.domain
        this._name = sel.attrName
      }
    }
  }
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh || this._name === '') {
      return
    }
    this._stashId = mesh.detachAttrLayer(this._domain, this._name)
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._stashId >= 0) {
      mesh.reattachAttrLayer(this._stashId)
      window.redraw_all?.()
    }
  }
}
ToolOp.register(RemoveAttrOp)

/**
 * Wave 5: mark the shortest edge-path between two vertices as a seam
 * (EDGE_SEAM). Takes the path endpoints as vert indices; the C++ `markSeamPath`
 * runs Dijkstra + flags the path edges + recomputes derived boundary state, and
 * `edgePathCoords` gives the path for a viewport overlay. Undo restores each
 * path edge's *prior* seam bit (snapshotted at exec), so it doesn't clear seams
 * that pre-existed on edges this path happens to overlap.
 */
export class MarkSeamOp extends LiteMeshAttrOp<{
  vStart: IntProperty
  vEnd: IntProperty
}> {
  /** Path edges + their seam bit before this op, captured at exec for a
   * true-inverse undo (parallel arrays). */
  _priorEdges: number[] = []
  _priorStates: number[] = []

  static tooldef() {
    return {
      toolpath: 'litemesh.mark_seam',
      uiname  : 'Mark Seam Path',
      inputs: {
        vStart: new IntProperty(-1),
        vEnd  : new IntProperty(-1),
      },
    }
  }

  undoPre(_ctx: ToolContext): void {}
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const {vStart, vEnd} = this.getInputs()
    if (vStart < 0 || vEnd < 0) {
      return
    }
    // Snapshot the path edges' prior seam state before marking (so undo/redo are
    // exact inverses; the path is deterministic so re-capture on redo matches).
    this._priorEdges = mesh.edgePathEdges(vStart, vEnd)
    this._priorStates = this._priorEdges.map((e) => mesh.edgeSeam(e))
    const n = mesh.markSeamPath(vStart, vEnd, 1)
    if (n > 0) {
      this._drawPath(ctx, mesh, vStart, vEnd)
    }
    window.redraw_all?.()
  }

  undo(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    mesh.restoreSeamEdges(this._priorEdges, this._priorStates)
    const v3d = (ctx as unknown as {view3d?: {resetDrawLines?: () => void}}).view3d
    v3d?.resetDrawLines?.()
    window.redraw_all?.()
  }

  /** Draw the marked path as orange overlay lines (view3d.makeDrawLine). */
  _drawPath(ctx: ToolContext, mesh: LiteMesh, v0: number, v1: number) {
    const v3d = (
      ctx as unknown as {
        view3d?: {makeDrawLine(a: Vector3, b: Vector3, c: number[]): unknown}
      }
    ).view3d
    if (!v3d) {
      return
    }
    const c = mesh.edgePathCoords(v0, v1)
    for (let i = 0; i + 5 < c.length; i += 3) {
      const a = new Vector3([c[i], c[i + 1], c[i + 2]])
      const b = new Vector3([c[i + 3], c[i + 4], c[i + 5]])
      v3d.makeDrawLine(a, b, [1.0, 0.4, 0.0, 1.0])
    }
  }
}
ToolOp.register(MarkSeamOp)

/* Minimal structural views of the View3D/SceneObject bits the modal needs, so we
 * don't pull the whole View3D type into the lite-mesh layer. */
interface SeamView3D {
  getLocalMouse(x: number, y: number): {0: number; 1: number}
  activeCamera: {rendermat: Matrix4}
  unproject(p: Vector4, mat: Matrix4): void
  makeDrawLine(a: Vector3, b: Vector3, color: number[]): unknown
  resetDrawLines(): void
}
interface SeamCtx {
  view3d?: SeamView3D
  object?: {outputs: {matrix: {getValue(): Matrix4}}}
  scene?: {objects?: {active?: {data?: unknown}}}
}

/**
 * Wave 5: interactive chain (knife-style) seam marking. Modal tool — click
 * vertices in sequence; each click marks the shortest-path seam from the
 * previous vertex (live), with a hover preview of the next segment. Enter or
 * right-click finishes (a single undo step for the whole chain); Esc cancels.
 *
 * Vertex picking, path-finding and flag-writing are all engine-side
 * (`pickVert` / `markSeamPath` / `edgePathCoords`); this op is just the
 * interaction shell + overlay. Invoke without a pointer event (keymap/button)
 * so the modal receives pointer move/down events, not only key events.
 */
export class MarkSeamInteractiveOp extends LiteMeshAttrOp {
  /** Committed picked verts (the confirmed chain nodes). */
  _chain: number[] = []
  /** Cached world-space endpoint pairs for the committed segments (so a
   * mousemove redraw doesn't recompute every path). */
  _committed: [Vector3, Vector3][] = []
  _hoverVert = -1
  _hoverLines: [Vector3, Vector3][] = []
  /** Prior seam bit of every edge the chain touched, recorded the first time
   * each edge is seen (before it's live-marked), so undo restores the exact
   * pre-chain state instead of clearing pre-existing overlapping seams. */
  _priorByEdge: Map<number, number> = new Map()

  static tooldef() {
    return {
      toolpath: 'litemesh.mark_seam_interactive',
      uiname  : 'Mark Seam',
      inputs  : {},
      is_modal: true,
    }
  }

  undoPre(_ctx: ToolContext): void {}
  calcUndoMem(): number {
    return 0
  }

  modalStart(ctx: ViewContext) {
    this._chain = []
    this._committed = []
    this._hoverLines = []
    this._hoverVert = -1
    this._priorByEdge = new Map()
    return super.modalStart(ctx as never)
  }

  private _mctx(): SeamCtx | undefined {
    return this.modal_ctx as unknown as SeamCtx | undefined
  }

  /** Build the object-local ray through screen pixel (lx, ly) — same unproject
   * the BVH picking path uses. */
  private _localRay(view3d: SeamView3D, obmatrix: Matrix4, lx: number, ly: number) {
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

  /** edgePathCoords (object-local) → world-space endpoint pairs for drawing. */
  private _segmentLines(mesh: LiteMesh, obmatrix: Matrix4, a: number, b: number): [Vector3, Vector3][] {
    const c = mesh.edgePathCoords(a, b)
    const pts: Vector3[] = []
    for (let i = 0; i + 2 < c.length; i += 3) {
      const v = new Vector3([c[i], c[i + 1], c[i + 2]])
      v.multVecMatrix(obmatrix)
      pts.push(v)
    }
    const lines: [Vector3, Vector3][] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      lines.push([pts[i], pts[i + 1]])
    }
    return lines
  }

  private _pick(e: PointerEvent): number {
    const ctx = this._mctx()
    const mesh = ctx ? this._getMesh(ctx as unknown as ToolContext) : undefined
    if (!ctx || !ctx.view3d || !ctx.object || !mesh) {
      return -1
    }
    const m = ctx.view3d.getLocalMouse(e.x, e.y)
    const obmatrix = ctx.object.outputs.matrix.getValue()
    const {origin, dir} = this._localRay(ctx.view3d, obmatrix, m[0], m[1])
    return mesh.pickVert(origin, dir)
  }

  private _redraw() {
    const ctx = this._mctx()
    if (!ctx || !ctx.view3d) {
      return
    }
    const v3d = ctx.view3d
    v3d.resetDrawLines()
    for (const [a, b] of this._committed) {
      v3d.makeDrawLine(a, b, [1.0, 0.4, 0.0, 1.0])
    }
    for (const [a, b] of this._hoverLines) {
      v3d.makeDrawLine(a, b, [1.0, 0.7, 0.2, 0.7])
    }
    window.redraw_viewport?.()
  }

  on_pointermove(e: PointerEvent): void {
    const v = this._pick(e)
    if (v === this._hoverVert) {
      return
    }
    this._hoverVert = v
    this._hoverLines = []
    const ctx = this._mctx()
    const mesh = ctx ? this._getMesh(ctx as unknown as ToolContext) : undefined
    const anchor = this._chain.length ? this._chain[this._chain.length - 1] : -1
    if (ctx && ctx.object && mesh && anchor >= 0 && v >= 0 && v !== anchor) {
      this._hoverLines = this._segmentLines(mesh, ctx.object.outputs.matrix.getValue(), anchor, v)
    }
    this._redraw()
  }

  on_pointerdown(e: PointerEvent): void {
    if (e.button === 2) {
      this.modalEnd(false)
      return
    }
    if (e.button !== 0) {
      return
    }
    const v = this._pick(e)
    if (v < 0) {
      return
    }
    const anchor = this._chain.length ? this._chain[this._chain.length - 1] : -1
    if (v === anchor) {
      return
    }
    const ctx = this._mctx()
    const mesh = ctx ? this._getMesh(ctx as unknown as ToolContext) : undefined
    if (anchor >= 0 && ctx && ctx.object && mesh) {
      // Snapshot each path edge's prior seam bit (first sighting only) before
      // marking live, so undo can restore the exact pre-chain state.
      for (const e of mesh.edgePathEdges(anchor, v)) {
        if (!this._priorByEdge.has(e)) this._priorByEdge.set(e, mesh.edgeSeam(e))
      }
      // mark live for immediate feedback; exec() re-marks the whole chain on redo
      mesh.markSeamPath(anchor, v, 1)
      this._committed.push(...this._segmentLines(mesh, ctx.object.outputs.matrix.getValue(), anchor, v))
    }
    this._chain.push(v)
    this._hoverLines = []
    this._hoverVert = -1
    this._redraw()
  }

  on_keydown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      this.modalEnd(false)
    } else if (e.code === 'Escape') {
      this.modalEnd(true)
    }
  }

  modalEnd(wasCancelled: boolean) {
    // Clear the transient preview lines on *both* paths: on finish the
    // persistent seamBatch (rebuilt by exec's markSeamPath) carries the committed
    // seams, so the temp _committed/_hover lines would otherwise double-draw on
    // top until the next resetDrawLines.
    this._mctx()?.view3d?.resetDrawLines()
    return super.modalEnd(wasCancelled)
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    for (let i = 0; i + 1 < this._chain.length; i++) {
      mesh.markSeamPath(this._chain[i], this._chain[i + 1], 1)
    }
    window.redraw_all?.()
  }

  undo(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (mesh) {
      // Restore the snapshotted pre-chain seam bits (true inverse) rather than
      // blanket-clearing the chain, which would unset pre-existing seams the
      // chain overlapped.
      const edges = [...this._priorByEdge.keys()]
      const states = edges.map((e) => this._priorByEdge.get(e) ?? 0)
      mesh.restoreSeamEdges(edges, states)
    }
    ;(ctx as unknown as {view3d?: {resetDrawLines?: () => void}}).view3d?.resetDrawLines?.()
    window.redraw_all?.()
  }
}
ToolOp.register(MarkSeamInteractiveOp)

/**
 * Wave 7: generate a per-corner UV map from the marked seams (EDGE_SEAM). Calls
 * the engine unwrapper (`generateUVFromSeams`: flood-fill charts bounded by
 * seams → group-normal projection → shelf box-pack into [0,1]), which creates a
 * FLOAT2 corner layer tagged UV. Undo detaches that layer into the C++ stash
 * (data preserved); redo reattaches the same layer rather than regenerating.
 */
export class GenerateUVOp extends LiteMeshAttrOp<{
  margin: FloatProperty
}> {
  _name = ''
  _stashId = -1

  static tooldef() {
    return {
      toolpath: 'litemesh.generate_uv',
      uiname  : 'Generate UVs from Seams',
      inputs: {
        margin: new FloatProperty(0.01).setRange(0.0, 0.25).noUnits(),
      },
    }
  }

  undoPre(_ctx: ToolContext): void {}
  calcUndoMem(): number {
    return 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    if (this._stashId >= 0) {
      // redo after undo: restore the exact layer we detached
      mesh.reattachAttrLayer(this._stashId)
      this._stashId = -1
    } else {
      const {name} = mesh.generateUVFromSeams(this.getInputs().margin)
      this._name = name
    }
    window.redraw_all?.()
  }

  undo(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (mesh && this._name) {
      this._stashId = mesh.detachAttrLayer(AttrDomain.CORNER, this._name)
    }
    window.redraw_all?.()
  }
}
ToolOp.register(GenerateUVOp)

/**
 * Fan-triangulate every n-gon of the active LiteMesh and rebuild its spatial tree
 * cleanly (a balanced, all-triangle BVH — dyntopo is much faster on it; see the
 * "faster if triangulated" tip overlay). Whole-mesh topology change, so undo uses
 * a serialize snapshot of the pre-triangulate mesh (captured in undoPre only when
 * there is work to do); undo restores it via `_replaceMesh`, redo re-runs exec.
 */
export class TriangulateLiteMeshOp extends LiteMeshAttrOp {
  /** Pre-triangulate mesh blob, or undefined when the mesh was already all-tris. */
  _undoBlob?: Uint8Array

  static tooldef() {
    return {
      toolpath: 'litemesh.triangulate',
      uiname  : 'Triangulate',
      inputs  : {},
    }
  }

  undoPre(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    // Snapshot only when there's an n-gon to triangulate; an already-triangle
    // mesh makes exec a no-op, so undo has nothing to restore.
    this._undoBlob = mesh && mesh.hasNgons() ? mesh.serialize() : undefined
  }
  calcUndoMem(): number {
    return this._undoBlob?.length ?? 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    mesh.triangulate()
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._undoBlob) {
      const wasm = getWasmImmediate()!
      mesh._replaceMesh(wasm.Mesh_deserialize(this._undoBlob))
      window.redraw_all?.()
    }
  }
}
ToolOp.register(TriangulateLiteMeshOp)

/**
 * Feature-aligned global quad remesh of the active LiteMesh (cross-field →
 * seamless param → integer quantization → quad extraction → reprojection). A
 * whole-mesh topology change, so undo snapshots the pre-remesh mesh (serialize)
 * and restores it via `_replaceMesh`; redo re-runs exec. A clean failure
 * (infeasible field / too many folds) leaves the mesh untouched and drops the
 * snapshot. Input defaults mirror C++ `remesh_params.h` — keep them in sync, as
 * exec always passes every field, overriding the bound struct's own defaults.
 */
export class QuadRemeshLiteMeshOp extends LiteMeshAttrOp<{
  targetEdgeLength: FloatProperty
  solveEdgeLength: FloatProperty
  useCurvature: BoolProperty
  useSharpFeatures: BoolProperty
  sharpAngle: FloatProperty
  useDensity: BoolProperty
  reproject: BoolProperty
  smoothIterations: IntProperty
  smoothStrength: FloatProperty
  seed: IntProperty
}> {
  /** Pre-remesh mesh blob, or undefined when the remesh cleanly failed (no-op). */
  _undoBlob?: Uint8Array

  static tooldef() {
    return {
      toolpath: 'litemesh.quad_remesh',
      uiname  : 'Quad Remesh',
      inputs  : {
        targetEdgeLength: new FloatProperty(0.1).setRange(0.001, 10.0),
        solveEdgeLength : new FloatProperty(0.0).setRange(0.0, 10.0).noUnits(),
        useCurvature    : new BoolProperty(true),
        useSharpFeatures: new BoolProperty(false),
        sharpAngle      : new FloatProperty(0.7853982).setRange(0.0, Math.PI),
        useDensity      : new BoolProperty(false),
        reproject       : new BoolProperty(false),
        smoothIterations: new IntProperty(2).setRange(0, 20).noUnits(),
        smoothStrength  : new FloatProperty(0.5).setRange(0.0, 1.0).noUnits(),
        seed            : new IntProperty(1).setRange(0, 1 << 30).noUnits(),
      },
    }
  }

  undoPre(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    this._undoBlob = mesh ? mesh.serialize() : undefined
  }
  calcUndoMem(): number {
    return this._undoBlob?.length ?? 0
  }

  exec(ctx: ToolContext) {
    const mesh = this._getMesh(ctx)
    if (!mesh) {
      return
    }
    const i = this.getInputs()
    const changed = mesh.quadRemesh({
      targetEdgeLength: i.targetEdgeLength,
      solveEdgeLength : i.solveEdgeLength,
      useCurvature    : i.useCurvature,
      useSharpFeatures: i.useSharpFeatures,
      sharpAngle      : i.sharpAngle,
      useDensity      : i.useDensity,
      reproject       : i.reproject,
      smoothIterations: i.smoothIterations,
      smoothStrength  : i.smoothStrength,
      seed            : i.seed,
    })
    // Clean failure leaves the mesh untouched, so there's nothing to undo.
    if (!changed) {
      this._undoBlob = undefined
    }
    window.redraw_all?.()
  }

  undo(ctx: ToolContext): void {
    const mesh = this._getMesh(ctx)
    if (mesh && this._undoBlob) {
      const wasm = getWasmImmediate()!
      mesh._replaceMesh(wasm.Mesh_deserialize(this._undoBlob))
      window.redraw_all?.()
    }
  }
}
ToolOp.register(QuadRemeshLiteMeshOp)
