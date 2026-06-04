import {Container, DataAPI, DataStruct, Matrix4, nstructjs, Vector2, Vector3, Vector4} from '../path.ux/pathux'
import type {ListBoxChangeEvent} from '../path.ux/pathux'
import type {ScreenPickResult} from '../editors/view3d/findnearest'
import type {ViewContext} from '../core/context'
import {AttrSet} from './litemesh_attrSet'
import {AttrType} from './litemesh_base'
import {
  BoolAttribute,
  Float3Attribute,
  Int2Attribute,
  Int4Attribute,
  IntAttribute,
  ShortAttribute,
} from './litemesh_types'
import {SceneObjectData} from '../sceneobject/sceneobject_base'
import {BlockLoader, BlockLoaderAddUser, DataBlock} from '../core/lib_api'
import {SelMask} from '../editors/view3d/selectmode'
import {NodeFlags} from '../core/graph'
import {DrawBatch, SpatialTree, Mesh as WasmMesh} from '@sculptcore/api'
import {getWasmImmediate, IWasmInterface} from '@sculptcore/api/api'
import type {RequestedAttrBridge} from '@sculptcore/api/api'
import type {RequestedAttrDesc} from '../shadernodes/shader_nodes_wgsl'
import {LightGenWgsl, type IRenderLights} from '../shadernodes/shader_lib_wgsl'
import {IUniformsBlock, WebGLBatchExecutor} from '../webgl/index'
import type {View3D} from '../editors/all'
import {SceneObject} from '../sceneobject/index'
import {Shaders} from '../shaders/shaders'
import {GenericIsect} from '../util/spatial'
import type {SculptCorePaintMode} from '../editors/view3d/tools/sculptcore'
import type {DrawQueue, FrameContext} from '../render/queue'
import {isWebGPU} from '../core/renderer_flag'
import {getActiveWebGpuContext} from '../render/queue_factory'
import {WebGPUBatchExecutor, type CommandBindGroup} from '../webgpu/batch'
import {UniformBindings} from '../webgpu/uniform_bindings'
import type {Pipeline} from '../webgpu/pipeline'
import {wgslForSpatialShader} from './litemesh_wgsl'

/**
 * Which per-element attributes the LiteMesh surface is colored by in the
 * viewport. A bitmask — both can be active at once (the C++ side composites
 * the painted color modulated by the group color). Drives
 * `SpatialTree.setColorDisplayMode` (the C++ render color stream). View state
 * only — not serialized. Values mirror the C++ `displayColorMode` bitmask in
 * `spatial_gpu.cc`.
 */
export const LiteMeshDisplayMode = {
  VERTEX_COLOR: 1,
  POLY_GROUP  : 2,
} as const

/** Element domains (mirror the C++ `ElemType`, which isn't bound to TS). */
export const AttrDomain = {VERTEX: 1, EDGE: 2, CORNER: 4, LIST: 8, FACE: 16} as const
const ATTR_DOMAIN_LABEL: Record<number, string> = {1: 'vert', 2: 'edge', 4: 'corner', 8: 'list', 16: 'face'}
/** Bound `AttrType` integer values are the C++ bitflags (FLOAT=1, FLOAT4=8, …). */
const ATTR_TYPE_LABEL: Record<number, string> = {
  1   : 'Float',
  2   : 'Float2',
  4   : 'Float3',
  8   : 'Float4',
  16  : 'Bool',
  32  : 'Int',
  64  : 'Int2',
  128 : 'Int3',
  256 : 'Int4',
  512 : 'Byte',
  1024: 'Short',
}
/** `AttrUse` bitflags = the attribute's category/role. */
export const AttrUseFlags = {NONE: 0, UNIT: 1, COLOR: 2, UV: 4, POLYGROUP: 8} as const

/** User-selectable attribute categories for the ObData dropdown (the brushable
 * subset of AttrUse + None). Values match AttrUseFlags so they pass straight to
 * the C++ `setAttrUse`. */
export const LiteMeshAttrCategory = {NONE: 0, COLOR: 2, UV: 4, POLYGROUP: 8} as const

/**
 * One mesh attribute, surfaced in the ObData attribute ListBox. `name` is the
 * composite row label (the ListBox labels by `.name`); `attrName`/`domain`/
 * `attrType`/`use` are the underlying fields the data-API + logic use.
 */
/**
 * Categories (AttrUse roles) a layer of the given type/domain may take, plus
 * NONE. Mirrors the Wave 2b valid-categories table; the ObData category
 * dropdown offers exactly this set, and `setAttrCategory` rejects anything
 * outside it. `type`/`domain` are the bound AttrType / LiteMesh AttrDomain ints.
 */
export function validCategories(type: number, domain: number): number[] {
  const out: number[] = [AttrUseFlags.NONE]
  if (domain === AttrDomain.VERTEX && type === AttrType.Float4) out.push(AttrUseFlags.COLOR)
  if (type === AttrType.Float2) out.push(AttrUseFlags.UV) // vertex now, corner later
  if (domain === AttrDomain.FACE && type === AttrType.Int) out.push(AttrUseFlags.POLYGROUP)
  return out
}

/** A LiteMesh area-pick hit (`ScreenPickResult.elements` entry): a mesh element
 * index tagged with the domain it indexes, so consumers can tell faces from
 * verts. */
export interface LiteMeshPickElem {
  type: 'vert' | 'face'
  index: number
}

export class LiteMeshAttrItem {
  constructor(
    public attrName: string,
    public domain: number,
    public attrType: number,
    public use: number,
    /** Index of this layer in its domain's full AttrGroup.attrs (the index
     * space the C++ setAttrUse / brush override consume). */
    public layerIndex: number = -1
  ) {}

  get name(): string {
    const dom = ATTR_DOMAIN_LABEL[this.domain] ?? '?'
    const ty = ATTR_TYPE_LABEL[this.attrType] ?? '?'
    const cats: string[] = []
    if (this.use & AttrUseFlags.COLOR) cats.push('Color')
    if (this.use & AttrUseFlags.UV) cats.push('UV')
    if (this.use & AttrUseFlags.POLYGROUP) cats.push('PolyGroup')
    const cat = cats.length ? `   ·   ${cats.join('+')}` : ''
    return `${this.attrName}   ·   ${dom} ${ty}${cat}`
  }
}

export class VertexData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.VertexData {}')

  constructor() {
    super()
  }

  get positions() {
    return this.attrs.get('positions') as Float3Attribute
  }
  get normals() {
    return this.attrs.get('normals') as Float3Attribute
  }
  get select() {
    return this.attrs.get('select') as BoolAttribute
  }
}

export class EdgeData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.EdgeData {}')

  constructor() {
    super()
  }

  get vs() {
    return this.attrs.get('.edge.vs') as Int2Attribute
  }
  get disk() {
    return this.attrs.get('.edge.vs.disk') as Int4Attribute
  }
  get select() {
    return this.attrs.get('.edge.select') as BoolAttribute
  }
  get c() {
    return this.attrs.get('.edge.c') as IntAttribute
  }
}

export class CornerData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.CornerData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Int, '.corner.v')
    this.ensureAttr(AttrType.Int, '.corner.e')
    this.ensureAttr(AttrType.Int, '.corner.l')
    this.ensureAttr(AttrType.Int, '.corner.next')
    this.ensureAttr(AttrType.Int, '.corner.prev')
    this.ensureAttr(AttrType.Int, '.corner.radial_next')
    this.ensureAttr(AttrType.Int, '.corner.radial_prev')
  }
  get v() {
    return this.attrs.get('.corner.v') as IntAttribute
  }
  get e() {
    return this.attrs.get('.corner.e') as IntAttribute
  }
  get l() {
    return this.attrs.get('.corner.l') as IntAttribute
  }
  get next() {
    return this.attrs.get('.corner.next') as IntAttribute
  }
  get prev() {
    return this.attrs.get('.corner.prev') as IntAttribute
  }
  get radial_next() {
    return this.attrs.get('.corner.radial_next') as IntAttribute
  }
  get radial_prev() {
    return this.attrs.get('.corner.radial_prev') as IntAttribute
  }
}

/** Face boundary/hole list. */
export class ListData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.ListData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Int, '.list.c')
    this.ensureAttr(AttrType.Int, '.list.f')
    this.ensureAttr(AttrType.Int, '.list.next')
    this.ensureAttr(AttrType.Int, '.list.size')
  }
  get c() {
    return this.attrs.get('.list.c') as IntAttribute
  }
  get f() {
    return this.attrs.get('.list.f') as IntAttribute
  }
  get next() {
    return this.attrs.get('.list.next') as IntAttribute
  }
  get size() {
    return this.attrs.get('.list.size') as IntAttribute
  }
}

export class FaceData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.FaceData {}')
  constructor() {
    super()
    this.ensureAttr(AttrType.Short, '.face.list_count')
    this.ensureAttr(AttrType.Int, '.face.list')
    this.ensureAttr(AttrType.Float3, '.face.normal')
  }
  get list_count() {
    return this.attrs.get('.face.list_count') as ShortAttribute
  }
  get list() {
    return this.attrs.get('.face.list') as IntAttribute
  }
  get normal() {
    return this.attrs.get('.face.normal') as Float3Attribute
  }
}

export class LiteMesh extends SceneObjectData {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.LiteMesh {
      _data : iter(byte) | this.serialize();
    }
    `
  )

  static nodedef() {
    return {
      name   : 'litemesh',
      uiname : 'LiteMesh',
      flag   : NodeFlags.SAVE_PROXY,
      inputs : {...super.nodedef().inputs},
      outputs: {...super.nodedef().outputs},
    }
  }

  static blockDefine() {
    return {
      typeName   : 'litemesh',
      defaultName: 'LiteMesh',
      uiName     : 'LiteMesh',
      flag       : 0,
      icon       : -1,
    }
  }

  static dataDefine() {
    return {
      name      : 'LiteMesh',
      selectMask: SelMask.MESH,
      tools     : undefined,
      dataKind  : 'litemesh',
    }
  }

  static defineAPI(api: DataAPI, struct?: DataStruct): DataStruct {
    let mstruct = SceneObjectData.defineAPI(api, struct ?? api.mapStruct(this, true))

    let def = mstruct
      .flags(
        'displayColorMode',
        'displayColorMode',
        LiteMeshDisplayMode,
        'Display',
        'Attributes shown on the LiteMesh surface (combinable)'
      )
      .uiNames({
        VERTEX_COLOR: 'Vertex Color',
        POLY_GROUP  : 'Poly Groups',
      })
    def.on('change', function () {
      window.redraw_viewport()
    })

    // ObData attribute manager (Wave 2b). The attribute ListBox binds to this
    // `attrs` DataList; `showBuiltinAttrs` toggles the builtin filter.
    mstruct.bool('showBuiltinAttrs', 'showBuiltinAttrs', 'Show builtin attributes').on('change', function () {
      window.redraw_all?.()
    })

    // Category (AttrUse) of the attr selected in the ListBox. The setter rejects
    // roles invalid for the attr's type/domain (validCategories), so offering the
    // full set here is safe; setting a role also activates the layer.
    mstruct
      .enum('selectedAttrCategory', 'selectedAttrCategory', LiteMeshAttrCategory, 'Category', 'Attribute category / role')
      .uiNames({NONE: 'None', COLOR: 'Color', UV: 'UV', POLYGROUP: 'Poly Group'})
      .on('change', function () {
        window.redraw_all?.()
      })

    let astruct = api.mapStruct(LiteMeshAttrItem, true)
    astruct.string('attrName', 'attrName', 'Name').readOnly()

    // list(valueProp, apiPathSegment, funcs): value read from mesh.attrItems,
    // addressed in the data API as `object.data.attrs`.
    mstruct.list('attrItems', 'attrs', {
      getIter(api: DataAPI, list: LiteMeshAttrItem[]) {
        return list
      },
      getLength(api: DataAPI, list: LiteMeshAttrItem[]) {
        return list.length
      },
      get(api: DataAPI, list: LiteMeshAttrItem[], key: number) {
        return list[key]
      },
      getKey(api: DataAPI, list: LiteMeshAttrItem[], obj: LiteMeshAttrItem) {
        return list.indexOf(obj)
      },
      getStruct(api: DataAPI, list: LiteMeshAttrItem[], key: number) {
        return api.mapStruct(LiteMeshAttrItem)
      },
    })

    return mstruct
  }

  /**
   * Object Data ("ObData") properties tab — LiteMesh settings reachable
   * outside the sculptcore toolmode. Currently the surface display mode
   * (vertex color vs poly groups); attribute info + add/remove controls will
   * live here too. Bound through the data-API struct in
   * `api_define_litemesh` (see the note there re: future static defineAPI).
   */
  static buildPropertiesTab(container: Container<ViewContext>) {
    container.label('LiteMesh')

    const display = container.panel('Display')
    display.prop('object.data.displayColorMode')

    const attrs = container.panel('Attributes')
    attrs.prop('object.data.showBuiltinAttrs')
    // pathux ListBox bound to the attribute DataList (api_define_litemesh).
    const listbox = document.createElement('listbox-x')
    listbox.setAttribute('datapath', 'object.data.attrs')
    // Clicking a categorized row makes that attr the active layer for its
    // category (color/poly-group/UV) — the sculptcore bridge then points the
    // matching brush at it. The ListBox fires a `ListBoxChangeEvent` whose
    // `selection.id` is the data-list key (here `attrItems.indexOf(row)`, see
    // the `attrs` list in api_define.js) and whose `selection.item` is the
    // ListItem *widget*, not our row — so resolve the id against attrItems.
    listbox.addEventListener('change', (e: Event) => {
      const id = (e as ListBoxChangeEvent).selection?.id
      const mesh = container.ctx?.object?.data
      if (typeof id === 'number' && mesh instanceof LiteMesh) {
        const item = mesh.attrItems[id]
        if (item) {
          mesh.setSelectedAttrFromItem(item)
          mesh.setActiveAttrFromItem(item)
          window.redraw_all?.()
        }
      }
    })
    attrs.add(listbox as unknown as Container<ViewContext>)

    // Category dropdown for the selected attr (Wave 2b). The enum offers all
    // roles; selectedAttrCategory's setter rejects any not valid for the attr's
    // type/domain (validCategories). Setting a role also activates the layer.
    attrs.prop('object.data.selectedAttrCategory')

    // Add / Remove (Wave 2b) run through ToolOps (litemesh.add_attr /
    // remove_attr) so they're undoable. Add picks a (domain, type, category)
    // per the valid-categories table and lets C++ assign a unique name; Remove
    // deletes the selected layer (C++ refuses builtins). Args are the AttrDomain
    // / AttrType / AttrUseFlags ints.
    const C = AttrDomain.VERTEX,
      F = AttrDomain.FACE
    attrs.tool(`litemesh.add_attr(domain=${C} type=${AttrType.Float4} use=${AttrUseFlags.COLOR})`, {label: 'Add Color'})
    attrs.tool(`litemesh.add_attr(domain=${C} type=${AttrType.Float2} use=${AttrUseFlags.UV})`, {label: 'Add UV'})
    attrs.tool(`litemesh.add_attr(domain=${F} type=${AttrType.Int} use=${AttrUseFlags.POLYGROUP})`, {
      label: 'Add Poly Group',
    })
    attrs.tool('litemesh.remove_attr()', {label: 'Remove Selected'})
  }

  afterSTRUCT(): void {
    super.afterSTRUCT()
  }

  dataLink(getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser) {
    return super.dataLink(getblock, getblock_addUser)
  }

  loadSTRUCT(reader: nstructjs.StructReader<this>): void {
    reader(this)
    super.loadSTRUCT(reader)

    if (this._data && this._data.length > 0) {
      this.mesh = this.wasm.Mesh_deserialize(new Uint8Array(this._data))
    } else {
      // Legacy / empty block (saved before mesh serialization was wired): fall
      // back to a default cube so the file still loads with geometry.
      this.mesh = this.wasm.Mesh_createCube(120, 1.0, 1.0)
    }
    this._initSpatial()
    this._data = undefined
  }

  // Assigned in the constructor, or (deferInit path) in loadSTRUCT.
  mesh!: WasmMesh
  spatial!: SpatialTree
  wasm: IWasmInterface
  drawBatch?: DrawBatch
  treeBatch?: DrawBatch
  /** Persistent seam-edge overlay (EDGE_SEAM) line batch + its rebuild flag.
   * Rebuilt only when the seam set or geometry changes (see markSeamsDirty). */
  seamBatch?: DrawBatch
  _seamsDirty = true
  drawBatchExecutor?: WebGLBatchExecutor
  drawBatchExecutorGPU?: WebGPUBatchExecutor
  private gpuUniforms?: IUniformsBlock
  /** True once `setDrawShader` installed a real material WGSL on the spatial
   * tree (M6). The viewport draw then provides the material's full uniform set
   * (frame/object/lights across @group 0/1/2) instead of the basic-shader
   * single @group(0) block — see `drawQ` / `drawQGPU`. */
  private _hasMaterialDrawShader = false
  /** Serialized mesh blob, populated only during `loadSTRUCT` (a plain byte
   * array from nstructjs); cleared once the mesh is rebuilt. */
  _data?: number[] | Uint8Array
  /** Viewport surface color source (see LiteMeshDisplayMode). View state only,
   * not serialized — defaults to VERTEX_COLOR on load. Mirrors the C++
   * SpatialTree.displayColorMode (which TS can't read back). */
  _displayColorMode: number = LiteMeshDisplayMode.VERTEX_COLOR

  constructor(wasmMesh?: WasmMesh, deferInit = false) {
    super()

    // this code cannot run before wasm loads
    this.wasm = getWasmImmediate()!

    // `deferInit` is set by `newSTRUCT` when nstructjs is about to deserialize:
    // skip building the throwaway default cube — `loadSTRUCT` reconstructs the
    // real mesh from the blob.
    if (deferInit) {
      return
    }

    this.mesh = wasmMesh ?? this.wasm.Mesh_createCube(120, 1.0, 1.0)
    this._initSpatial()
  }

  /** nstructjs instance factory — bypass the default-cube build (see ctor). */
  static newSTRUCT(): LiteMesh {
    return new LiteMesh(undefined, /*deferInit=*/ true)
  }

  /** Build the spatial tree + draw batches over `this.mesh`. Shared by the
   * constructor and the deserialization path. */
  private _initSpatial(): void {
    this.spatial = this.wasm.Mesh_buildSpatialTree(this.mesh, 1024, 20)
    this.spatial.update(this.wasm.gpu)
    this.drawBatch = this.spatial.getDrawBatch()
    this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
  }

  /** Serialize the mesh to a versioned, compressed blob for the STRUCT getter. */
  serialize(): Uint8Array {
    return this.wasm.Mesh_serialize(this.mesh)
  }

  rayCast(origin: Vector3, dir: Vector3): GenericIsect | undefined {
    const isectOut = this.wasm.manager.construct('sculptcore::spatial::CastRayIsect')
    try {
      // Backend-agnostic: pass the ray endpoints as bound float3s (the wasm/native
      // ring helper) rather than poking raw heap pointers — castRay takes them by
      // reference, so both backends marshal the wrapper's address. (Native keeps
      // the pointer in C++; there is no HEAPF32 to write through.)
      const originF3 = this.wasm.float3([origin[0], origin[1], origin[2]])
      const dirF3 = this.wasm.float3([dir[0], dir[1], dir[2]])

      const result = this.spatial.castRay(originF3, dirF3, isectOut)
      if (!result) {
        return undefined
      }

      const isect = new GenericIsect()
      for (let i = 0; i < 3; i++) {
        isect.p[i] = isectOut.p.vec[i]
        isect.normal[i] = isectOut.normal.vec[i]
      }
      isect.tri = isectOut.triIndex
      isect.face = isectOut.faceIndex
      isect.dis = isectOut.t
      isect.uv[0] = isectOut.uv.vec[0]
      isect.uv[1] = isectOut.uv.vec[1]
      return isect
    } finally {
      // WASM exposes an explicit disposer; the native backend GC-finalizes the
      // owning wrapper, so the disposer is absent there.
      ;(isectOut as unknown as {[Symbol.dispose]?: () => void})[Symbol.dispose]?.()
    }
  }

  /** Resolve a ray to the mesh vertex nearest the hit point (the hit triangle's
   * highest-barycentric-weight corner, computed in C++). -1 if the ray misses.
   * Used by the seam-marking modal to turn a click into a path endpoint. */
  pickVert(origin: Vector3, dir: Vector3): number {
    const isectOut = this.wasm.manager.construct('sculptcore::spatial::CastRayIsect')
    try {
      const originF3 = this.wasm.float3([origin[0], origin[1], origin[2]])
      const dirF3 = this.wasm.float3([dir[0], dir[1], dir[2]])
      const hit = this.spatial.castRay(originF3, dirF3, isectOut)
      return hit ? (isectOut as unknown as {nearestVert: number}).nearestVert : -1
    } finally {
      ;(isectOut as unknown as {[Symbol.dispose]?: () => void})[Symbol.dispose]?.()
    }
  }

  /* ----- Wave 5: seam/boundary marking ----- */

  /** Mark (state=1) or clear (state=0) the shortest edge-path between two verts
   * as a seam (EDGE_SEAM). Returns the edge count, or -1 if no path. */
  markSeamPath(vStart: number, vEnd: number, state: number): number {
    const n = (this.mesh as unknown as {markSeamPath(a: number, b: number, s: number): number}).markSeamPath(
      vStart,
      vEnd,
      state
    )
    this._seamsDirty = true // the persistent overlay rebuilds on next draw
    return n
  }

  /** Flag the seam overlay for rebuild (e.g. after a topology/seam change). */
  markSeamsDirty(): void {
    this._seamsDirty = true
  }

  /** Rebuild the seam-edge overlay batch if the seam set/geometry changed. */
  private _ensureSeamBatch(): void {
    if (!this._seamsDirty) {
      return
    }
    this._seamsDirty = false
    if (this.seamBatch) {
      this.wasm.gpu.destroyBatch(this.seamBatch, true, true)
      this.seamBatch = undefined
    }
    this.seamBatch = this.spatial.buildSeamBatch(this.wasm.gpu) ?? undefined
  }

  /** The shortest edge-path's vertex positions as flat xyz triples (for drawing
   * the candidate/marked seam). Reads the bound Vector<float> out-param. */
  edgePathCoords(vStart: number, vEnd: number): number[] {
    const cls = (
      this.wasm.manager as {
        findVectorClass(n: string): {buildFullName(): string; findDefaultConstructor(): unknown} | undefined
      }
    ).findVectorClass('float')
    if (!cls) return []
    const ctor = cls.findDefaultConstructor()
    const vec = (this.wasm.manager as {constructWith(c: unknown): unknown}).constructWith(ctor)
    ;(this.mesh as unknown as {edgePathCoords(a: number, b: number, out: never): void}).edgePathCoords(
      vStart,
      vEnd,
      vec as never
    )
    const arr = this.wasm.getBoundVector(cls.buildFullName(), vec as never) as ArrayLike<number>
    const out: number[] = []
    for (let i = 0; i < arr.length; i++) out.push(arr[i])
    return out
  }

  /** Edge indices along the shortest vStart→vEnd path (the edges markSeamPath
   * would flag), so a ToolOp can snapshot their prior seam state for undo. */
  edgePathEdges(vStart: number, vEnd: number): number[] {
    const out = this._intVecOut()
    ;(this.mesh as unknown as {edgePathEdges(a: number, b: number, o: never): void}).edgePathEdges(
      vStart,
      vEnd,
      out.vec as never
    )
    const arr = out.read()
    const res: number[] = []
    for (let i = 0; i < arr.length; i++) res.push(arr[i])
    return res
  }

  /** Read a single edge's EDGE_SEAM bit (0/1). */
  edgeSeam(e: number): number {
    return (this.mesh as unknown as {edgeSeam(e: number): number}).edgeSeam(e)
  }

  /** Restore a batch of edge seam bits (parallel arrays) then recompute derived
   * boundary state once — the true inverse used by seam-marking undo, instead of
   * blanket-clearing the path (which would unset pre-existing overlapping seams). */
  restoreSeamEdges(edges: number[], states: number[]): void {
    const m = this.mesh as unknown as {
      setEdgeSeam(e: number, s: number): void
      recomputeBoundary(): void
    }
    for (let i = 0; i < edges.length; i++) m.setEdgeSeam(edges[i], states[i])
    m.recomputeBoundary()
    this._seamsDirty = true
  }

  /* ----- Wave 7: UV generation from seams ----- */

  /** Corner-domain layer names (to diff what generateUVFromSeams just created). */
  private _cornerLayerNames(): string[] {
    const grp = this._domainGroup(AttrDomain.CORNER)
    if (!grp?.attrs) return []
    const cls = (
      this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string} | undefined}
    ).findVectorClass('sculptcore::mesh::AttrRef')
    if (!cls) return []
    const arr = this.wasm.getBoundVector(cls.buildFullName(), grp.attrs as never) as ArrayLike<{name: string}>
    const out: string[] = []
    for (let i = 0; i < arr.length; i++) out.push(arr[i].name)
    return out
  }

  /** Generate a per-corner UV map from EDGE_SEAM-bounded charts (the unwrapper).
   * `margin` is the [0,1] shelf-pack margin. Creates a FLOAT2 corner layer
   * (tagged UV) and returns {charts, name} — the new layer's name lets the tool
   * undo by detaching it. */
  generateUVFromSeams(margin = 0.01): {charts: number; name: string} {
    const before = new Set(this._cornerLayerNames())
    const charts = (this.mesh as unknown as {generateUVFromSeams(m: number): number}).generateUVFromSeams(
      Math.round(margin * 1000)
    )
    const name = this._cornerLayerNames().find((n) => !before.has(n)) ?? ''
    return {charts, name}
  }

  /** Seam every edge (so generateUVFromSeams produces a per-face cuboid map).
   * Test/demo helper; flags the seam overlay for rebuild. */
  markAllSeams(): void {
    ;(this.mesh as unknown as {markAllSeams(): void}).markAllSeams()
    this._seamsDirty = true
  }

  /** Fill the first vertex FLOAT4 COLOR layer with a deterministic position->rgb
   * gradient. Test/demo helper (no brush stroke needed). */
  fillVertexColorFromPosition(): void {
    ;(this.mesh as unknown as {fillVertexColorFromPosition(): void}).fillVertexColorFromPosition()
  }

  /* ----- Viewport area picking (overrides SceneObjectData defaults) -----
   * Backed by the sculptcore SpatialTree's cone (circle) / frustum (rect)
   * queries. Backend-agnostic: ray endpoints and rect corners are marshaled as
   * bound float3s, and the face/vert index out-params as bound Vector<int>s
   * (WASM via the binding runtime; native via the N-API makeIntVector helper).
   * Elements are mesh face/vertex indices, so `ScreenPickResult.elements` holds
   * numbers (consistent with the `unknown[]` contract). */

  /** Construct two empty bound Vector<int> out-params + an array-like reader. */
  private _intVecOut() {
    const cls = (
      this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string; findDefaultConstructor(): unknown}}
    ).findVectorClass('int')
    const ctor = cls.findDefaultConstructor()
    const vec = (this.wasm.manager as {constructWith(c: unknown): unknown}).constructWith(ctor)
    const read = () => this.wasm.getBoundVector(cls.buildFullName(), vec as never) as ArrayLike<number>
    return {vec, read}
  }

  castScreenCircle(
    _ctx: ViewContext,
    view3d: View3D,
    object: SceneObject,
    selmask: number,
    mpos: Vector2,
    radius: number
  ): ScreenPickResult {
    const obmatrix = object.outputs.matrix.getValue()
    const imat = new Matrix4(obmatrix)
    imat.multiply(view3d.activeCamera.rendermat)
    imat.invert()

    // Build the view cone (near→far through the cursor) in object-local space,
    // exactly as the WebGL BVH brush path does.
    const x = ~~mpos[0]
    const y = ~~mpos[1]
    const d = 0.9999

    const p1 = new Vector4()
    const p2 = new Vector4()

    p1[0] = x
    p1[1] = y
    p1[2] = -d
    p1[3] = 1.0
    view3d.unproject(p1, imat)
    const origin = new Vector3(p1)

    p2[0] = x + 1.0
    p2[1] = y + 1.0
    p2[2] = -d
    p2[3] = 1.0
    view3d.unproject(p2, imat)
    const radius1 = (new Vector3(p2).vectorDistance(origin) * radius) / Math.sqrt(2)

    p1[0] = x
    p1[1] = y
    p1[2] = d
    p1[3] = 1.0
    view3d.unproject(p1, imat)
    const dest = new Vector3(p1)
    const ray = new Vector3(dest).sub(origin)

    p2[0] = x + 1.0
    p2[1] = y + 1.0
    p2[2] = d
    p2[3] = 1.0
    view3d.unproject(p2, imat)
    const radius2 = (new Vector3(p2).vectorDistance(dest) * radius) / Math.sqrt(2)

    const faces = this._intVecOut()
    const verts = this._intVecOut()

    this.spatial.castScreenCircle(
      this.wasm.float3([origin[0], origin[1], origin[2]]) as never,
      this.wasm.float3([ray[0], ray[1], ray[2]]) as never,
      radius1,
      radius2,
      faces.vec as never,
      verts.vec as never
    )

    return this._buildPickResult(object, faces.read(), verts.read(), selmask)
  }

  castScreenRect(
    _ctx: ViewContext,
    view3d: View3D,
    object: SceneObject,
    selmask: number,
    min: Vector2,
    max: Vector2
  ): ScreenPickResult {
    const obmatrix = object.outputs.matrix.getValue()
    const imat = new Matrix4(obmatrix)
    imat.multiply(view3d.activeCamera.rendermat)
    imat.invert()

    // Unproject the 4 rect corners at the near and far clip planes → 8
    // object-local corners (the SpatialTree builds + orients the planes).
    const corners2d = [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ]
    const d = 0.9999
    const local: Vector3[] = []

    for (const [px, py] of corners2d) {
      const pn = new Vector4([px, py, -d, 1.0])
      view3d.unproject(pn, imat)
      local.push(new Vector3(pn))
    }
    for (const [px, py] of corners2d) {
      const pf = new Vector4([px, py, d, 1.0])
      view3d.unproject(pf, imat)
      local.push(new Vector3(pf))
    }

    const f3 = (v: Vector3) => this.wasm.float3([v[0], v[1], v[2]]) as never

    const faces = this._intVecOut()
    const verts = this._intVecOut()

    this.spatial.castScreenRect(
      f3(local[0]),
      f3(local[1]),
      f3(local[2]),
      f3(local[3]),
      f3(local[4]),
      f3(local[5]),
      f3(local[6]),
      f3(local[7]),
      faces.vec as never,
      verts.vec as never
    )

    return this._buildPickResult(object, faces.read(), verts.read(), selmask)
  }

  /**
   * Pack face + vert index arrays into a ScreenPickResult. `selmask` selects
   * which domain(s) are returned (VERTEX and/or FACE; defaulting to vertices
   * when neither bit is set, since brush/box select is vertex-centric). Each
   * element is a `LiteMeshPickElem` tagging its domain, so a consumer narrowing
   * the `unknown[]` can tell a face index from a vert index (the C++ query
   * always fills both vectors; the mask just filters what we surface).
   */
  private _buildPickResult(
    object: SceneObject,
    faces: ArrayLike<number>,
    verts: ArrayLike<number>,
    selmask: number
  ): ScreenPickResult {
    const elements: LiteMeshPickElem[] = []
    const elementObjects: SceneObject[] = []
    const elementDists: number[] = []

    const wantFaces = !!(selmask & SelMask.FACE)
    const wantVerts = !!(selmask & SelMask.VERTEX) || !wantFaces

    if (wantFaces) {
      for (let i = 0; i < faces.length; i++) {
        elements.push({type: 'face', index: faces[i]})
        elementObjects.push(object)
        elementDists.push(0)
      }
    }
    if (wantVerts) {
      for (let i = 0; i < verts.length; i++) {
        elements.push({type: 'vert', index: verts[i]})
        elementObjects.push(object)
        elementDists.push(0)
      }
    }

    return {elements, elementObjects, elementDists}
  }

  regenTreeBatch() {
    if (this.treeBatch) {
      this.wasm.gpu.destroyBatch(this.treeBatch, true, true)
      this.treeBatch = undefined
    }
    return this
  }

  /** Surface color source; see LiteMeshDisplayMode. Setting it flags every GPU
   * node (via the C++ setColorDisplayMode) so the next update re-fills the color
   * stream from the new source. The draw batch isn't cached on the TS side
   * (getDrawBatch is re-fetched each frame), so nothing to drop here. */
  get displayColorMode(): number {
    return this._displayColorMode
  }
  set displayColorMode(mode: number) {
    this._displayColorMode = mode
    this.spatial?.setColorDisplayMode(mode)
  }

  /** ObData attribute list: when false (default) builtin attributes (geometry
   * + `.`-prefixed internal layers) are hidden, leaving the user/paint attrs. */
  _showBuiltinAttrs = false

  get showBuiltinAttrs(): boolean {
    return this._showBuiltinAttrs
  }
  set showBuiltinAttrs(v: boolean) {
    this._showBuiltinAttrs = v
  }

  /**
   * Active attribute *name* per category (Wave 2b brush bridge). Clicking a
   * categorized attr in the ObData ListBox sets the entry for that category;
   * the sculptcore bridge resolves it to a layer index per stroke and points
   * the matching brush handle at it (replacing the hardcoded `color`/`group`).
   * View/paint state — not serialized (the layer it names lives on the mesh).
   * Keyed by AttrUseFlags (COLOR/POLYGROUP/UV).
   */
  _activeAttr: {color?: string; polygroup?: string; uv?: string} = {}

  /** Domain that a given category's layers live on (mirrors the W2b table). */
  static categoryDomain(category: number): number {
    if (category & AttrUseFlags.COLOR) return AttrDomain.VERTEX
    if (category & AttrUseFlags.POLYGROUP) return AttrDomain.FACE
    if (category & AttrUseFlags.UV) return AttrDomain.VERTEX // corner later
    return 0
  }

  /** Set the active attr for `item`'s category from a clicked ListBox row. */
  setActiveAttrFromItem(item: LiteMeshAttrItem): void {
    if (item.use & AttrUseFlags.COLOR) this._activeAttr.color = item.attrName
    else if (item.use & AttrUseFlags.POLYGROUP) this._activeAttr.polygroup = item.attrName
    else if (item.use & AttrUseFlags.UV) this._activeAttr.uv = item.attrName
    this._syncDisplayAttrs()
  }

  /** Point the C++ display sources at the active color/poly-group layers so the
   * viewport shows the active attr, not the layer literally named color/group.
   * -1 (no active layer) falls back to the by-name default in fill_leaf_slice. */
  _syncDisplayAttrs(): void {
    if (!this.spatial) return
    this.spatial.setDisplayColorAttr(this.activeAttrLayerIndex(AttrUseFlags.COLOR))
    this.spatial.setDisplayGroupAttr(this.activeAttrLayerIndex(AttrUseFlags.POLYGROUP))
  }

  /** The ObData ListBox's selected attribute (Wave 2b category dropdown acts on
   * it). Stored by its stable fields, not object identity (attrItems rebuilds
   * its LiteMeshAttrItems each enumeration). */
  _selectedAttr?: {domain: number; layerIndex: number; attrName: string; attrType: number}

  setSelectedAttrFromItem(item: LiteMeshAttrItem): void {
    this._selectedAttr = {
      domain    : item.domain,
      layerIndex: item.layerIndex,
      attrName  : item.attrName,
      attrType  : item.attrType,
    }
  }

  /** Live AttrUse (category) of the layer at (domain, layerIndex), via the bound
   * AttrGroup.attrs proxy. 0 (NONE) when out of range. */
  private _attrUseAt(domain: number, layerIndex: number): number {
    const grp = this._domainGroup(domain)
    if (!grp?.attrs || layerIndex < 0) return 0
    const cls = (
      this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string} | undefined}
    ).findVectorClass('sculptcore::mesh::AttrRef')
    if (!cls) return 0
    const arr = this.wasm.getBoundVector(cls.buildFullName(), grp.attrs as never) as ArrayLike<{use: number}>
    return layerIndex < arr.length ? arr[layerIndex].use : 0
  }

  /**
   * Write a layer's category (AttrUse) through the C++ `setAttrUse` primitive
   * (`AttrRef.use` is read-only via the native proxy; the layer is addressed by
   * index, since names don't marshal). Setting a real category also makes the
   * layer the active attr for it (so the matching brush targets it).
   */
  setAttrCategory(domain: number, layerIndex: number, attrName: string, use: number): void {
    ;(this.mesh as unknown as {setAttrUse(d: number, i: number, u: number): void}).setAttrUse(domain, layerIndex, use)
    if (use & AttrUseFlags.COLOR) this._activeAttr.color = attrName
    else if (use & AttrUseFlags.POLYGROUP) this._activeAttr.polygroup = attrName
    else if (use & AttrUseFlags.UV) this._activeAttr.uv = attrName
    this._syncDisplayAttrs()
  }

  /**
   * Add a new attribute layer (Wave 2b). C++ owns the unique name (names don't
   * marshal) and returns the new index; we read the name back, select it, and
   * activate it for its category. `type` is an AttrType int, `use` an
   * AttrUseFlags int.
   */
  addAttr(domain: number, type: number, use: number): number {
    const idx = (this.mesh as unknown as {addAttr(d: number, t: number, u: number): number}).addAttr(domain, type, use)
    if (idx >= 0) {
      const grp = this._domainGroup(domain)
      const cls = (
        this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string} | undefined}
      ).findVectorClass('sculptcore::mesh::AttrRef')
      let name = ''
      if (grp?.attrs && cls) {
        const arr = this.wasm.getBoundVector(cls.buildFullName(), grp.attrs as never) as ArrayLike<{name: string}>
        if (idx < arr.length) name = arr[idx].name
      }
      this._selectedAttr = {domain, layerIndex: idx, attrName: name, attrType: type}
      if (use & AttrUseFlags.COLOR) this._activeAttr.color = name
      else if (use & AttrUseFlags.POLYGROUP) this._activeAttr.polygroup = name
      else if (use & AttrUseFlags.UV) this._activeAttr.uv = name
      this._syncDisplayAttrs()
    }
    return idx
  }

  /** Remove the selected attribute layer (refused for builtins in C++). Clears
   * the selection and any active-attr entry that named it. */
  removeSelectedAttr(): void {
    const s = this._selectedAttr
    if (!s) return
    ;(this.mesh as unknown as {removeAttr(d: number, i: number): void}).removeAttr(s.domain, s.layerIndex)
    if (this._activeAttr.color === s.attrName) this._activeAttr.color = undefined
    if (this._activeAttr.polygroup === s.attrName) this._activeAttr.polygroup = undefined
    if (this._activeAttr.uv === s.attrName) this._activeAttr.uv = undefined
    this._selectedAttr = undefined
    this._syncDisplayAttrs()
  }

  /** Category enum for the selected attr (ObData dropdown). Reads/writes the
   * live AttrUse; the setter ignores categories invalid for the attr's type. */
  get selectedAttrCategory(): number {
    const s = this._selectedAttr
    return s ? this._attrUseAt(s.domain, s.layerIndex) : AttrUseFlags.NONE
  }
  set selectedAttrCategory(use: number) {
    const s = this._selectedAttr
    if (!s) return
    if (!validCategories(s.attrType, s.domain).includes(use)) return
    this.setAttrCategory(s.domain, s.layerIndex, s.attrName, use)
  }

  /** Bound `AttrGroup` for a domain (the same object attrItems enumerates). */
  private _domainGroup(domain: number): {attrs: unknown} | undefined {
    const m = this.mesh as unknown as {
      v?: {attrs?: {attrs: unknown}}
      c?: {attrs?: {attrs: unknown}}
      f?: {attrs?: {attrs: unknown}}
    }
    if (domain === AttrDomain.VERTEX) return m.v?.attrs
    if (domain === AttrDomain.CORNER) return m.c?.attrs
    if (domain === AttrDomain.FACE) return m.f?.attrs
    return undefined
  }

  /**
   * Index of the active attr for `category` within its domain's full
   * `AttrGroup.attrs` vector (the same index space the C++ override consumes),
   * or -1 when none is set / it no longer exists. Enumerates the *unfiltered*
   * bound vector so the index matches `grp->attrs[layerIndex]` in C++.
   */
  activeAttrLayerIndex(category: number): number {
    let name: string | undefined
    if (category & AttrUseFlags.COLOR) name = this._activeAttr.color
    else if (category & AttrUseFlags.POLYGROUP) name = this._activeAttr.polygroup
    else if (category & AttrUseFlags.UV) name = this._activeAttr.uv
    if (!name) return -1
    return this.layerIndexByName(LiteMesh.categoryDomain(category), name)
  }

  /** Index of layer `name` within `domain`'s full (unfiltered) AttrGroup.attrs —
   * the index space the C++ override / setAttrUse / detachAttr consume. -1 if
   * absent. */
  layerIndexByName(domain: number, name: string): number {
    const grp = this._domainGroup(domain)
    if (!grp?.attrs) return -1
    const cls = (
      this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string} | undefined}
    ).findVectorClass('sculptcore::mesh::AttrRef')
    if (!cls) return -1
    const arr = this.wasm.getBoundVector(cls.buildFullName(), grp.attrs as never) as ArrayLike<{name: string}>
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].name === name) return i
    }
    return -1
  }

  /**
   * Detach a layer (by name) into the C++ stash for undoable removal — preserves
   * its data (no serialize, no free), clears any active-attr/selection naming it,
   * and returns the stash id (or -1). The RemoveAttr ToolOp owns this; undo is
   * `reattachAttrLayer`.
   */
  detachAttrLayer(domain: number, name: string): number {
    const idx = this.layerIndexByName(domain, name)
    if (idx < 0) return -1
    const stashId = (this.mesh as unknown as {detachAttr(d: number, i: number): number}).detachAttr(domain, idx)
    if (this._activeAttr.color === name) this._activeAttr.color = undefined
    if (this._activeAttr.polygroup === name) this._activeAttr.polygroup = undefined
    if (this._activeAttr.uv === name) this._activeAttr.uv = undefined
    if (this._selectedAttr?.attrName === name) this._selectedAttr = undefined
    this._syncDisplayAttrs()
    return stashId
  }

  /** Reattach a stashed layer (undo of detachAttrLayer). */
  reattachAttrLayer(stashId: number): void {
    ;(this.mesh as unknown as {reattachAttr(id: number): number}).reattachAttr(stashId)
    this._syncDisplayAttrs()
  }

  /** Remove the named layer outright (frees it; no undo data). Used by AddAttr
   * undo, where the layer is newly created and has nothing to preserve. */
  removeAttrByName(domain: number, name: string): void {
    const idx = this.layerIndexByName(domain, name)
    if (idx < 0) return
    ;(this.mesh as unknown as {removeAttr(d: number, i: number): void}).removeAttr(domain, idx)
    if (this._activeAttr.color === name) this._activeAttr.color = undefined
    if (this._activeAttr.polygroup === name) this._activeAttr.polygroup = undefined
    if (this._activeAttr.uv === name) this._activeAttr.uv = undefined
    if (this._selectedAttr?.attrName === name) this._selectedAttr = undefined
    this._syncDisplayAttrs()
  }

  /** True for geometry/internal attributes hidden by default in the ObData list. */
  static isBuiltinAttr(name: string): boolean {
    return name.startsWith('.') || name === 'positions' || name === 'normals' || name === 'select'
  }

  /**
   * Enumerate the C++ mesh's attributes (vertex + face for now) as descriptors
   * for the ObData ListBox. Reads the bound `AttrGroup.attrs` Vector<AttrRef>
   * through `getBoundVector` (the cross-backend way — direct `.attrs[i]` doesn't
   * materialize on the native backend). Builtins filtered unless
   * `showBuiltinAttrs`.
   */
  get attrItems(): LiteMeshAttrItem[] {
    const items: LiteMeshAttrItem[] = []
    const m = this.mesh as unknown as {
      v?: {attrs?: {attrs: unknown}}
      c?: {attrs?: {attrs: unknown}}
      f?: {attrs?: {attrs: unknown}}
    }
    const cls = (
      this.wasm.manager as {findVectorClass(n: string): {buildFullName(): string} | undefined}
    ).findVectorClass('sculptcore::mesh::AttrRef')
    if (!cls) {
      return items
    }
    const groups: [number, {attrs?: {attrs: unknown}} | undefined][] = [
      [AttrDomain.VERTEX, m.v],
      [AttrDomain.CORNER, m.c],
      [AttrDomain.FACE, m.f],
    ]
    for (const [domain, grp] of groups) {
      if (!grp?.attrs) {
        continue
      }
      const arr = this.wasm.getBoundVector(cls.buildFullName(), grp.attrs.attrs as never) as ArrayLike<{
        name: string
        type: number
        use: number
      }>
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i]
        if (!this._showBuiltinAttrs && LiteMesh.isBuiltinAttr(a.name)) {
          continue
        }
        // `i` is the index in the *unfiltered* group vector — the index space
        // the C++ setAttrUse / brush override consume.
        items.push(new LiteMeshAttrItem(a.name, domain, a.type, a.use, i))
      }
    }
    return items
  }

  /**
   * Install the material's requested geometry-attribute set on this mesh's
   * spatial tree (M6). The shader-graph only knows each attribute's *category*
   * (UV/Color/Generic); the true element *domain* (UVs corner-domain, vertex
   * color vertex-domain) is resolved here against the live mesh layers
   * (`attrItems`), falling back to a category default when the layer is absent
   * (it gets default-filled in C++). sculptcore then builds one vertex buffer
   * per entry, by name, in slot order. Never throws — an empty set restores the
   * legacy single-color draw path.
   */
  setRequestedAttrs(reqs: RequestedAttrDesc[]): void {
    if (!this.spatial) {
      return
    }
    // Index the live layers by name so each request resolves to its real domain.
    const byName = new Map<string, LiteMeshAttrItem>()
    for (const item of this.attrItems) {
      byName.set(item.attrName, item)
    }
    const bridges: RequestedAttrBridge[] = reqs.map((r) => {
      const item = byName.get(r.name)
      const domain = item ? item.domain : LiteMesh._defaultDomainForCategory(r.category)
      // Missing color reads as white (the legacy default); everything else zero.
      const defaultKind = r.category === AttrUseFlags.COLOR ? 1 : 0
      return {name: r.name, srcType: r.gpuType, elemSize: r.elemSize, slot: r.slot, domain, defaultKind}
    })
    this.wasm.SpatialTree_setRequestedAttrs(this.spatial, bridges)
  }

  /** Default element domain to assume for an absent requested layer, by category
   * (UV → corner, matching box-unwrap; everything else vertex). Only used for
   * the missing-layer (default-filled) case — present layers use their real
   * domain. */
  private static _defaultDomainForCategory(category: number): number {
    return category === AttrUseFlags.UV ? AttrDomain.CORNER : AttrDomain.VERTEX
  }

  /**
   * Set the material WGSL the spatial tree's draw batches render with (M6).
   * C++ stores it on the tree's `drawShader` ShaderDef (`wgslSource`) and flags
   * leaves for a GPU regen; `wgslForSpatialShader` reads it straight back off
   * the bound ShaderDef. Call after `setRequestedAttrs`.
   */
  setDrawShader(wgsl: string): void {
    if (!this.spatial) {
      return
    }
    this.wasm.SpatialTree_setDrawShader(this.spatial, wgsl)
    this._hasMaterialDrawShader = !!wgsl && wgsl.length > 0
  }

  /**
   * The advisory list of requested slots with no matching mesh layer (rendered
   * with defaults). Read once after a material change to warn the user. Never
   * throws.
   */
  getMissingAttrSlots(): number[] {
    if (!this.spatial) {
      return []
    }
    return this.wasm.SpatialTree_getMissingAttrSlots(this.spatial)
  }

  /**
   * A cheap order-sensitive hash of the mesh's attribute layers (name + type +
   * domain + use, across every domain). The renderengine compares it frame to
   * frame: when it changes but the material hash hasn't, only the *layers* moved
   * (e.g. a color attribute was added/removed), and it calls
   * `refreshRequestedAttrs()` to re-gather the per-attribute buffers without
   * relinking the shader. Built from the same `attrItems` `setRequestedAttrs`
   * resolves domains against, so the two always agree.
   */
  attrLayersSignature(): number {
    let h = 0x811c9dc5 | 0 // FNV-1a basis
    const mix = (v: number) => {
      h ^= v | 0
      h = Math.imul(h, 0x01000193)
    }
    for (const item of this.attrItems) {
      const name = item.attrName
      for (let i = 0; i < name.length; i++) {
        mix(name.charCodeAt(i))
      }
      mix(item.attrType)
      mix(item.domain)
      mix(item.use)
    }
    return h | 0
  }

  /**
   * Force the spatial tree to re-gather its per-attribute vertex buffers against
   * the *current* mesh layers, even when the requested descriptor set is
   * byte-identical (a layer added/removed whose domain matches the category
   * default leaves the descriptors unchanged but flips a buffer between
   * default-fill and real data). Cheaper than `setDrawShader` — no ShaderDef
   * relink. The renderengine calls this when `attrLayersSignature` changed but
   * the material hash didn't. Never throws.
   */
  refreshRequestedAttrs(): void {
    if (!this.spatial) {
      return
    }
    this.wasm.SpatialTree_refreshRequestedAttrs(this.spatial)
  }

  /**
   * DataBlock teardown — called by the library when the block is removed
   * (including the scene-clear that precedes a file load). Releases the C++
   * mesh + spatial tree (allocator-correct `Mesh_free`/`SpatialTree_free`, NOT
   * `[Symbol.dispose]`) and the GPU batches/executors this LiteMesh owns. Nulls
   * each handle so a double-remove can't double-free.
   */
  destroy(): void {
    this.drawBatchExecutor?.dispose()
    this.drawBatchExecutor = undefined
    this.drawBatchExecutorGPU?.dispose()
    this.drawBatchExecutorGPU = undefined

    if (this.treeBatch) {
      this.wasm.gpu.destroyBatch(this.treeBatch, true, true)
      this.treeBatch = undefined
    }
    if (this.seamBatch) {
      this.wasm.gpu.destroyBatch(this.seamBatch, true, true)
      this.seamBatch = undefined
    }
    // drawBatch is owned by the spatial tree; freeing the tree releases it.
    this.drawBatch = undefined

    if (this.spatial) {
      this.wasm.SpatialTree_free(this.spatial)
      this.spatial = undefined as unknown as SpatialTree
    }
    if (this.mesh) {
      this.wasm.Mesh_free(this.mesh)
      this.mesh = undefined as unknown as WasmMesh
    }

    super.destroy()
  }

  drawQ(view3d: View3D, queue: DrawQueue, frame: FrameContext, _object: SceneObject) {
    const toolmode = view3d.ctx?.scene?.toolmode as SculptCorePaintMode
    const drawBVH = toolmode?.drawBVH
    // Default on: only an explicit `drawFeatureOverlay === false` hides it (other
    // tool modes have no such field and should still show seams).
    const drawFeatures = toolmode?.drawFeatureOverlay !== false
    if (this.spatial.update(this.wasm.gpu)) {
      if (this.treeBatch) {
        this.wasm.gpu.destroyBatch(this.treeBatch, true, true)
        if (drawBVH) {
          this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
        }
      }
    }
    this.drawBatch = this.spatial.getDrawBatch()
    // Rebuild only when the seam *set* changes (markSeamsDirty), not on every
    // geometry update: `.edge.vs` is freed under frozen topology, so a per-dab
    // rebuild would thaw in the sculpt hot path. The overlay therefore tracks
    // seam *topology*, not live vert motion mid-stroke (refreshed on next seam
    // edit) — an acceptable trade for not thawing every frame.
    this._ensureSeamBatch()

    if (drawBVH && !this.treeBatch) {
      this.treeBatch = this.spatial.buildLeafBoundsBatch(this.wasm.gpu)
    }

    const uniforms = frame.uniforms
    const drawMatrix = new Matrix4(uniforms.projectionMatrix)
    if (uniforms.objectMatrix instanceof Matrix4) {
      drawMatrix.multiply(uniforms.objectMatrix)
    }

    const normalMatrix = drawMatrix.copy().makeRotationOnly()

    const uniforms2 = {
      uColor: [1, 1, 1, 1],
      ...uniforms,
      drawMatrix,
      normalMatrix,
    } as IUniformsBlock & Record<string, unknown>

    // When a material WGSL is the draw shader, the spatial mesh batch needs the
    // renderengine's full uniform schema (FrameUniforms @group0, lights @group1,
    // ObjectUniforms @group2) rather than the basic shader's single packed
    // @group(0) block. Provide it here so the LiteMesh renders the material on
    // both the offscreen BasePass and the viewport canvas pass (the C++ tree
    // ShaderDef is shared between them). The basic line/bounds overlays still
    // read `drawMatrix`/`uColor` from the same block — UniformBindings ignores
    // fields a given shader doesn't declare.
    if (this._hasMaterialDrawShader) {
      const scene = view3d.ctx?.scene as unknown as
        | {lights?: Iterable<unknown>; envlight?: {color?: unknown; power?: number}}
        | undefined
      // ObjectUniforms.normalMatrix is the object's world rotation (the material
      // lights in world space) — NOT the proj*object rotation the basic shader
      // wants. Overwrite the basic value computed above.
      if (uniforms.objectMatrix instanceof Matrix4) {
        uniforms2.normalMatrix = uniforms.objectMatrix.copy().makeRotationOnly()
      } else {
        uniforms2.normalMatrix = new Matrix4()
      }
      if (uniforms2.ambientColor === undefined && scene?.envlight?.color !== undefined) {
        uniforms2.ambientColor = scene.envlight.color
      }
      if (uniforms2.ambientPower === undefined) {
        uniforms2.ambientPower = scene?.envlight?.power ?? 1.0
      }
      if (uniforms2.viewportSize === undefined) uniforms2.viewportSize = view3d.glSize
      if (uniforms2.uSample === undefined) uniforms2.uSample = 1
      if (uniforms2.alpha === undefined) uniforms2.alpha = 1.0
      // Per-light uniforms (POINTLIGHTS[i].co/.power/...) — the same
      // RenderLight-fed machinery the renderengine BasePass uses. Build a
      // minimal IRenderLights from the scene lights (only `.light` is read).
      const rlights: IRenderLights = {}
      let lid = 0
      if (scene?.lights) {
        for (const light of scene.lights) {
          ;(rlights as Record<string, unknown>)[lid++] = {light}
        }
      }
      LightGenWgsl.setUniforms(uniforms2 as unknown as Record<string, unknown>, scene, rlights)
    }

    if (isWebGPU()) {
      this.drawQGPU(uniforms2, drawBVH, drawFeatures)
      return
    }

    queue.scheduleRawGLPass((gl: WebGL2RenderingContext) => {
      let exec = this.drawBatchExecutor
      if (exec === undefined) {
        exec = new WebGLBatchExecutor(gl, this.wasm, Shaders.BasicLineShader2)
        this.drawBatchExecutor = exec
      }
      if (this.drawBatch) {
        exec.dispatch(this.drawBatch, uniforms2)
      }
      if (drawBVH && this.treeBatch) {
        exec.dispatch(this.treeBatch, uniforms2)
      }
      if (this.seamBatch && drawFeatures) {
        exec.dispatch(this.seamBatch, uniforms2)
      }
    })
  }

  /**
   * WebGPU sibling of the `scheduleRawGLPass` body above. Runs against
   * the active `WebGpuRenderContext`'s currently-open render pass,
   * routing sculptcore `DrawBatch`es through `WebGPUBatchExecutor`.
   * `bindGroupForCommand` lazily reflects each pipeline's WGSL via
   * `UniformBindings` and returns the `@group(0)` bind group with
   * `drawMatrix`/`normalMatrix`/`uColor` already written.
   */
  private drawQGPU(uniforms: IUniformsBlock, drawBVH: boolean, drawFeatures = true): void {
    const ctx = getActiveWebGpuContext()
    if (!ctx || !ctx.currentPass) return
    const pass = ctx.currentPass
    const surfaceFormat = navigator.gpu.getPreferredCanvasFormat()

    // The bindGroupForCommand callback runs inside `exec.dispatch()` —
    // route the per-frame uniforms through an instance field so the
    // closure (built once on first dispatch) always reads the active
    // frame's values.
    this.gpuUniforms = uniforms

    let exec = this.drawBatchExecutorGPU
    if (exec === undefined) {
      const bindingsCache = new WeakMap<Pipeline, UniformBindings>()
      const self: LiteMesh = this
      exec = new WebGPUBatchExecutor({
        device             : ctx.device,
        wasm               : this.wasm,
        pipelineCache      : ctx.pipelineCache,
        wgslForShader      : wgslForSpatialShader,
        colorTargets: [
          {
            format: surfaceFormat,
            blend: {
              color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
              alpha: {srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add'},
            },
          },
        ],
        depthStencil: {
          format           : 'depth24plus',
          depthWriteEnabled: true,
          depthCompare     : 'less-equal',
        },
        bindGroupForCommand: (_cmd, pipeline) => {
          let bindings = bindingsCache.get(pipeline)
          if (!bindings) {
            bindings = new UniformBindings(ctx.device, pipeline.descriptor.wgsl, pipeline.descriptor.label)
            bindingsCache.set(pipeline, bindings)
          }
          const uniforms = self.gpuUniforms!
          bindings.write(uniforms)
          // Bind every @group the shader declares — the basic spatial shaders
          // use only @group(0), but a material draw shader spans @group 0/1/2
          // (frame / lights / object). Missing/declined groups are skipped (a
          // throw on the render seam is swallowed as a drawObjects warning and
          // silently aborts the whole pass).
          const groups: CommandBindGroup[] = []
          for (const group of bindings.groups.keys()) {
            const bg = bindings.getBindGroup(pipeline.handle, group, uniforms)
            if (bg) groups.push({group, bindGroup: bg})
          }
          if (groups.length === 0) {
            console.error('litemesh: spatial pipeline declares no uniform bind groups')
            return null
          }
          return groups
        },
      })
      this.drawBatchExecutorGPU = exec
    }

    if (this.drawBatch) exec.dispatch(this.drawBatch, pass)
    if (drawBVH && this.treeBatch) exec.dispatch(this.treeBatch, pass)
    if (this.seamBatch && drawFeatures) exec.dispatch(this.seamBatch, pass)
  }

  regenRender() {
    //
  }
  regenTessellation() {
    //
  }
  regenElementsDraw() {}
}

DataBlock.register(LiteMesh)
SceneObjectData.register(LiteMesh)
