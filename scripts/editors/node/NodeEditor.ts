import {Area, contextWrangler} from '../../path.ux/scripts/screen/ScreenArea.js'
import {Editor, VelPan, type EditorSideBar} from '../editor_base'

import {
  startMenu,
  saveUIData,
  loadUIData,
  DataPathError,
  KeyMap,
  HotKey,
  haveModal,
  nstructjs,
  type DataAPI,
  type DataStruct,
  type Menu,
  type IAreaDef,
} from '../../path.ux/scripts/pathux.js'

import {UIBase, PackFlags, color2css} from '../../path.ux/scripts/core/ui_base.js'
import {Container, RowFrame} from '../../path.ux/scripts/core/ui.js'
import {Vector2} from '../../util/vectormath.js'
import * as util from '../../util/util.js'
import {ShaderNodeTypes} from '../../shadernodes/shader_nodes.js'

import {VelPanPanOp} from '../velpan.js'
import {SelOneToolModes} from '../view3d/selectmode.js'
import {Node, NodeFlags, SocketTypes, Graph, type NodeSocketType, INodeUI} from '../../core/graph.js'
import {Overdraw} from '../../path.ux/scripts/util/ScreenOverdraw.js'
import {layoutNode} from '../../core/graph_spatial.js'
import {ModalFlags} from '../../core/modalflags.js'
import {Icons} from '../icon_enum.js'
import type {ViewContext} from '../../core/context'
import type {Material} from '../../core/material'
import type {Screen} from '../../path.ux/scripts/screen/FrameManager'
import type {StructReader} from '../../path.ux/scripts/util/nstructjs'

const projcos = util.cachering.fromConstructor<Vector2>(Vector2, 64)

type AnyGraph = Graph<unknown>
type SocketType = NodeSocketType
/** an array that also carries `.highlight` = the currently hover-highlighted element */
type HighlightArray<T> = T[] & {highlight?: T}

/* loose view of the object returned by layoutNode() (graph_spatial.js, untyped) */
interface NodeLayout {
  pos: Vector2
  size: Vector2
  socksize: number
  inputs: {[k: string]: number[]}
  outputs: {[k: string]: number[]}
}

type UINode = Node & INodeUI

/**
 * One input/output socket: the little colored connection dot (drawn on its own
 * `canvas`) plus, for inputs, the socket's inline value UI. Caches a direct
 * reference to its graph `socket` (re-fetching from the data API per frame would
 * be too slow with many sockets) — keep it current via `updateSocketRef`.
 */
export class NodeSocketElem extends RowFrame<ViewContext> {
  canvas: HTMLCanvasElement
  g: CanvasRenderingContext2D
  size = 20
  /** drawn socket-dot radius, in CSS px (pre-DPI) */
  radius = 5
  /** 'input' or 'output' (or undefined before init); see the `isOutput` getter */
  type: 'input' | 'output' | undefined = undefined
  isHighlight = false

  _last_update_key: string | undefined = undefined
  ned: NodeEditorBase | undefined = undefined //owning node editor

  //okay, it's going to be too slow to always fetch sockets from the data api
  //instead, cache direct references to them here
  //but make sure to keep up to date. . .
  socket: SocketType | undefined = undefined
  needDraw = true

  uinode: NodeUI | undefined = undefined
  pos = new Vector2()
  _abspos = new Vector2()
  _last_dpi: number

  constructor() {
    super()

    this.canvas = document.createElement('canvas')
    this.g = this.canvas.getContext('2d')!

    this.inherit_packflag |= PackFlags.NO_NUMSLIDER_TEXTBOX

    //XXX hackish event stuff
    this.addEventListener('pointerdown', (e) => {
      if (!haveModal()) {
        try {
          this.ned!.push_ctx_active()
          this.click(e)
        } finally {
          this.ned!.pop_ctx_active()
        }
      }
    })

    this.addEventListener('pointermove', (e) => {
      try {
        this.ned!.push_ctx_active()
        this.ned!.on_mousemove(e)
      } finally {
        this.ned!.pop_ctx_active()
      }
    })

    this._last_dpi = this.getDPI()
  }

  /** true for output sockets; derived from `type` so the two can't disagree */
  get isOutput(): boolean {
    return this.type === 'output'
  }

  static define() {
    return {
      tagname: 'node-socket-elem-x',
    }
  }

  click(_e?: PointerEvent): void {
    this.updateSocketRef()

    if (haveModal()) {
      return
    }

    if (this.socket === undefined) {
      console.warn('socket ui error')
      return
    }

    console.log('socket click!')

    const node = this.uinode!.getNode()
    const sock = this.socket

    if (sock === undefined) {
      console.warn('Error in node editor ui socket', this, this.uinode)
      return
    }

    let cmd

    console.log(sock, sock.socketType === SocketTypes.INPUT, sock.edges.length)

    if (sock.socketType === SocketTypes.INPUT && sock.edges.length === 1) {
      const srcsock = sock.edges[0]
      const srcnode = srcsock.node

      cmd = `node.connect(useNodeEditorGraph=1 node1_id=${srcnode.graph_id}`
      cmd += ` disconnectSockID=${sock.graph_id}`
      cmd += ` sock1_id=${srcsock.graph_id})`
    } else {
      cmd = `node.connect(useNodeEditorGraph=1 node1_id=${node.graph_id}`
      cmd += ` sock1_id=${sock.graph_id})`
    }

    this.ctx.api.execTool(this.ctx, cmd)
  }

  getAbsPos(center_in_circle = false): Vector2 {
    const p = this._abspos

    p.load(this.pos).add(this.uinode!.pos)

    if (this.type === 'output') {
      p[0] -= this.size
    } else {
      p[0] += this.size
    }

    p[1] += this.size

    if (center_in_circle) {
      const r = this.radius

      p[0] += this.type === 'output' ? r : -r
      p[1] -= r

      if (this.type === 'input') {
        p[1] -= r
      }
    }

    return p
  }

  updateSocketRef(): void {
    try {
      this.socket = this.ctx.api.getValue<SocketType>(this.ctx, this.getAttribute('datapath')!)
    } catch (error) {
      if (error instanceof DataPathError) {
        this.socket = undefined
      } else {
        throw error
      }
    }

    if (this.socket === undefined) {
      console.warn('Bad socket reference')
      //this.remove();
    }
  }

  init(): void {
    super.init()

    if (this.type === 'input') {
      this.add(this.canvas as unknown as UIBase<ViewContext>)
    }

    if (this.socket !== undefined) {
      this.dataPrefix = this.getAttribute('datapath') + '.'

      this.overrideDefault('height', 20)
      this.overrideDefault('width', 70)

      const onchange = () => {
        window.redraw_viewport()
      }

      this.socket.buildUI(this, onchange)
    }
    if (this.type === 'output') {
      this.add(this.canvas as unknown as UIBase<ViewContext>)
    }

    this.setCSS()

    this.updateSocketRef()
    this._redraw()

    this.background = 'rgba(0,0,0,0)'
  }

  _redraw(): void {
    const g = this.g
    const dpi = this.getDPI()
    const size = Math.ceil(this.size * dpi)

    this.canvas.width = size
    this.canvas.height = size

    g.beginPath()
    g.clearRect(0, 0, size, size)

    if (this.socket === undefined) {
      this.updateSocketRef()
    }

    if (this.socket === undefined) {
      console.warn('bad socket', this.getAttribute('datapath'))
      return
    }
    const rawColor: number[] | string | undefined = this.socket.constructor!.nodedef().color

    let color: string
    if (rawColor === undefined) {
      color = 'blue'
    } else if (rawColor instanceof Array) {
      color = color2css(rawColor)
    } else {
      color = rawColor
    }

    g.fillStyle = color
    g.beginPath()

    const r = this.radius * dpi

    g.moveTo(size * 0.5, size * 0.5)
    g.arc(size * 0.5, size * 0.5, r, -Math.PI, Math.PI)
    g.fill()

    if (this.isHighlight) {
      g.fillStyle = 'rgba(255, 255, 255, 0.5)'
      g.fill()
    }
  }

  updateDPI(): void {
    const dpi = this.getDPI()

    if (dpi !== this._last_dpi) {
      this._last_dpi = dpi

      console.log('dpi update')

      this.setCSS()
      this._redraw()
    }
  }

  updatePos(): void {
    const key =
      '' +
      this.pos[0] +
      ':' +
      this.pos[1] +
      ':' +
      this.size +
      ':' +
      this.ned?.velpan?.scale[0] +
      ':' +
      this.ned?.velpan?.scale[1] +
      UIBase.getDPI()
    if (key === this._last_update_key) {
      return
    }
    this._last_update_key = key
    this.setCSS()
  }

  update(): void {
    super.update()

    this.updateDPI()
    //this.updatePos();

    //DO NOT CALL this.updateSocketRef! there will be far
    //too many sockets to regularly update the socket reference
    //in each update tick

    if (this.needDraw) {
      this.needDraw = false
      this._redraw()
    }
  }

  setCSS(): void {
    super.setCSS()

    this.style['position'] = 'absolute'
    this.style['margin'] = this.style['padding'] = '0px'
    this.saneStyle['white-space'] = 'nowrap'

    if (this.ned === undefined) {
      console.warn('no node editor in setCSS()')
      return
    }

    const ned = this.ned

    const pos = new Vector2(this.pos)

    pos.add(this.uinode!.pos)

    const npos = new Vector2(this.uinode!.pos)

    ned.project(pos, false)
    ned.project(npos, false)

    const r = this.getBoundingClientRect()
    let w = 0

    if (r) {
      w = r.width
    }

    if (this.isOutput) {
      pos[0] -= w
    }

    this.style['left'] = pos[0] + 'px'
    this.style['top'] = pos[1] + 'px'

    this.canvas.style['width'] = this.size + 'px'
    this.canvas.style['height'] = this.size + 'px'

    this.style['height'] = this.size + 'px'
    this._redraw()
    this.background = 'rgba(0,0,0,0)'
  }
}

UIBase.register(NodeSocketElem)

/**
 * The widget for one graph node: its title, body UI, and the socket widgets
 * around it. Positioned absolutely in graph space (see `setCSS`, which projects
 * the node's `graph_ui_pos` through the editor's VelPan).
 */
export class NodeUI extends Container<ViewContext> {
  pos = new Vector2()
  size = new Vector2()
  /** node position before VelPan projection (used to detect when it moved) */
  rawpos = new Vector2()

  inputs: NodeSocketElem[] = []
  outputs: NodeSocketElem[] = []
  allsockets: NodeSocketElem[] = []

  _isHighlight = false
  _node: Node | undefined = undefined

  graph_id: number | undefined = undefined
  ned: NodeEditorBase | undefined = undefined // owning node editor

  get isHighlight(): boolean {
    return this._isHighlight
  }

  set isHighlight(val: boolean) {
    this._isHighlight = val
    this.updateColor()
  }

  updateColor() {
    let mask = 0
    if (this.isHighlight) {
      mask |= 1
    }
    if (this.getNode().graph_flag & NodeFlags.SELECT) {
      mask |= 2
    }

    switch (mask) {
      case 0: // normal
        this.background = this.getDefault('background-color') as string
        break
      case 1: // highlight
        this.background = this.getDefault('highlight-color') as string
        break
      case 2: // select
        this.background = this.getDefault('select-color') as string
        break
      case 3: // highlight + select
        this.background = this.getDefault('highlight-select-color') as string
        break
    }
  }

  static define() {
    return {
      tagname: 'nodeui-x',
      style  : 'NodeEditorNode',
    }
  }

  remove(): void {
    super.remove()

    for (const s of this.allsockets) {
      s.remove()
    }
  }

  init(): void {
    super.init()

    const path = this.getAttribute('datapath')!

    let node: Node
    try {
      node = this.ctx.api.getValue<Node>(this.ctx, path)!
    } catch (error) {
      if (error instanceof DataPathError) {
        console.warn('Invalid node path ' + path)
        return
      } else {
        throw error
      }
    }

    const uinode = node as UINode
    let uiname = uinode.uiname
    if (uiname === undefined) {
      uiname = node.constructor!.nodedef().uiname
    }
    if (uiname === undefined) {
      uiname = node.constructor!.name
    }

    const title = this.label(uiname)
    title.font = 'TitleText'

    let y = 35

    const layout = layoutNode(node, {
      // socket spacing
      socksize: 40,
    }) as NodeLayout

    this.size.load(layout.size)

    for (let i = 0; i < 2; i++) {
      const socks = (i ? node.outputs : node.inputs) as {[k: string]: SocketType}
      const lsocks = i ? layout.outputs : layout.inputs
      const key = i ? 'outputs' : 'inputs'

      for (const k in socks) {
        const sock = socks[k]

        const uisock = document.createElement('node-socket-elem-x') as unknown as NodeSocketElem

        uisock.parentWidget = this
        uisock.type = i ? 'output' : 'input'

        const lsock = lsocks[k]

        uisock.pos[0] = lsock[0]
        uisock.pos[1] = lsock[1]

        if (!i) {
          uisock.pos[0] -= layout.socksize
        } else {
          uisock.pos[0] += layout.socksize
        }

        uisock.ctx = this.ctx
        uisock.ned = this.ned
        uisock.socket = sock
        uisock.uinode = this
        uisock.setAttribute('datapath', this.getAttribute('datapath') + '.' + key + "['" + k + "']")

        this.ned!.nodeContainer.appendChild(uisock)

        uisock.update()
        uisock.setCSS()

        uisock.doOnce(uisock.updatePos)

        if (i) {
          this.outputs.push(uisock)
        } else {
          this.inputs.push(uisock)
        }

        this.allsockets.push(uisock)
        this.ned!.sockets.push(uisock)

        y += ~~(uisock.size * 1.45) + 8
      }
    }

    const ui = document.createElement('container-x') as unknown as Container<ViewContext>
    ui.ctx = this.ctx
    ui.dataPrefix = this.getAttribute('datapath') + '.'
    this.add(ui)

    if (uinode.buildUI) {
      uinode.buildUI(ui)
    }

    ui.style['position'] = 'absolute'
    ui.style['top'] = ~~((y + 30) * this.ned!.velpan.scale[1]) + 'px'

    this.setCSS()
  }

  getNode(): Node {
    //let's cache this
    if (!this._node) {
      this._node = this.ctx.api.getValue<Node>(this.ctx, this.getAttribute('datapath')!)
    }

    return this._node!
  }

  setCSS(): void {
    super.setCSS()

    let node = this.getNode()
    if (!node) {
      return
    }

    this.pos.load(node.graph_ui_pos)

    let co = this.pos
    let scale = this.size

    this.rawpos = new Vector2(co)

    if (this.hasAttribute('datapath')) {
      const path = this.getAttribute('datapath')!
      try {
        node = this.ctx.api.getValue<Node>(this.ctx, path)!
      } catch (error) {
        if (error instanceof DataPathError) {
          console.warn('error in ui wrapper node; path to real node was:', path)
          return
        } else {
          throw error
        }
      }

      co.load(node.graph_ui_pos)
      scale.load(node.graph_ui_size) //.mul(ned.velpan.scale);
    }

    this.updateColor()

    const ned = this.ned

    if (ned === undefined && this.parentNode !== undefined) {
      this.doOnce(this.setCSS)
      return
    }

    for (const sock of this.allsockets) {
      sock.uinode = this
      sock.setCSS()

      scale[1] += sock.size
    }

    co = new Vector2(co)
    scale = new Vector2(scale)

    ned!.project(co, false)
    scale.mul(ned!.velpan.scale)

    this.style['position'] = 'absolute'
    this.style['width'] = ~~scale[0] + 'px'
    this.style['height'] = ~~scale[1] + 'px'

    let color
    if (node.graph_flag & NodeFlags.SELECT) {
      color = this.getDefault('borderSelect')
    } else {
      color = this.getDefault('border-color')
    }

    const r = this.getDefault('border-width')
    const s = this.getDefault('border-style')

    this.style['border'] = `${r}px ${s} ${color}`
    this.saneStyle['border-radius'] = this.getDefault('border-radius') + 'px'

    this.noMarginsOrPadding()

    this.float(co[0], co[1], undefined, 'absolute')
  }

  update(): void {
    super.update()

    const node = this.getNode()
    if (!node) {
      //this.remove();
      return
    }

    if (this.rawpos.vectorDistance(node.graph_ui_pos)) {
      this.setCSS()
    }
  }
}

UIBase.register(NodeUI)

/**
 * Scroll/clip container that holds the NodeUI widgets and owns the SVG
 * `overdraw` layer the connection lines are drawn into.
 */
export class NodeContainer extends Container<ViewContext> {
  overdraw: Overdraw<ViewContext> | undefined = undefined

  static define() {
    return {
      ...super.define(),
      tagname: 'shadergraph-node-container-x',
    }
  }

  removeOverdraw(): void {
    if (this.overdraw) {
      this.overdraw.clear()
      this.overdraw.remove()
      this.overdraw = undefined
    }
  }

  createOverdraw(screen: Screen<ViewContext>): void {
    if (this.overdraw !== undefined) {
      this.overdraw.remove()
    }

    try {
      this.overdraw = document.createElement('overdraw-x') as unknown as Overdraw<ViewContext>
      this.overdraw.startNode(this, screen)
    } catch (error) {
      console.error((error as Error).stack)
      console.error((error as Error).message)
      this.overdraw = undefined
    }
  }
}
UIBase.register(NodeContainer)

const NodeRecalcFlags = {
  UI     : 1,
  REBUILD: 2,
}

/**
 * Pan/zoom 2D graph editor. Mirrors the graph at `graphPath` as a tree of
 * NodeUI/NodeSocketElem widgets inside `nodeContainer`, draws the connections
 * into its SVG overdraw, and dispatches edits through the `node.*` ToolOps
 * (node_ops.ts / node_selectops.ts). Per-frame work is deferred via the
 * `recalcFlags` bitmask and drained in `update()`.
 */
export class NodeEditorBase extends Editor {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
NodeEditor {
  velpan     : VelPan;
  graphPath  : string;
}
  `
  )

  // 0 = no inertial panning in the node editor (velocity is zeroed each tick).
  #velPanDecay = 0.0

  /** >0 while a transform is suppressing reactions to graph update signals */
  ignoreGraphUpdates = 0
  _lastVelPanScale = ''
  _last_zoom = new Vector2()
  _last_script: string | undefined = undefined
  _last_compile_test = util.time_ms()
  _last_dpi: number | undefined = undefined
  _last_update_gen: number | undefined = undefined

  velpan: VelPan
  nodeContainer: NodeContainer
  /** pending work bitmask (NodeRecalcFlags.UI | REBUILD), drained in update() */
  recalcFlags = 0

  graphPath = 'material.graph'
  graphClass = 'shader'
  _last_graphpath = this.graphPath

  /** the NodeUI widgets, one per graph node (+ `.highlight` = hovered node) */
  nodes: HighlightArray<NodeUI>
  /** every socket widget across all nodes (+ `.highlight` = hovered socket) */
  sockets: HighlightArray<NodeSocketElem>
  node_idmap: {[graph_id: number]: NodeUI} = {}

  last_mpos = new Vector2()
  sidebar?: EditorSideBar

  constructor() {
    super()

    this.velpan = new VelPan()
    this.velpan.decay = this.#velPanDecay
    this.velpan.scale[0] = this.velpan.scale[1] = 0.8
    this.velpan.onchange = this._on_velpan_change.bind(this)

    // of NodeContainer type
    this.nodeContainer = document.createElement('shadergraph-node-container-x') as unknown as NodeContainer
    this.nodeContainer.style['overflow'] = 'hidden'
    this.nodeContainer.inherit_packflag |= PackFlags.NO_NUMSLIDER_TEXTBOX
    this.nodeContainer.overdraw?.setCSS()

    this.loadThemeOverrides()

    // make the container report the editor's DPI, not its own
    this.nodeContainer.getDPI = () => this.getDPI()

    this.defineKeyMap()

    this._last_graphpath = this.graphPath

    this.nodes = [] as unknown as HighlightArray<NodeUI>
    this.nodes.highlight = undefined
    this.sockets = [] as unknown as HighlightArray<NodeSocketElem>
    this.sockets.highlight = undefined
    this.node_idmap = {}
  }

  get graph(): AnyGraph | undefined {
    return this.ctx.api.getValue<AnyGraph>(this.ctx, this.graphPath)
    //return this.material.graph;
  }

  get material(): undefined {
    //return this.ctx.datalib.get(this.matref);
    return undefined
  }

  static defineAPI(api: DataAPI): DataStruct {
    const nedstruct = super.defineAPI(api)

    nedstruct.string('graphPath', 'graphPath', "data path to graph that's being edited")
    nedstruct.struct('velpan', 'velpan', 'Pan / Zoom', api.getStruct(VelPan))

    return nedstruct
  }

  static define(): IAreaDef {
    return {
      tagname            : 'node-editor-x',
      areaname           : 'NodeEditor',
      apiname            : 'nodeEditor',
      uiname             : 'Node Editor',
      icon               : Icons.EDITOR_NODE,
      flag               : 0,
      style              : 'NodeEditor',
      subclassChecksTheme: true,
    } as IAreaDef
  }

  loadThemeOverrides(): void {
    const overrides = this.getDefault('NodeOverrides') as unknown as Record<string, Record<string, unknown>> | undefined

    for (const k in overrides) {
      const v = overrides[k]

      for (const k2 in v) {
        const v2 = v[k2]
        this.overrideClassDefault(k, k2, v2)
      }
    }
  }

  // Override the base Area push/pop to key the "active editor" bin on NodeEditor
  // (not this.constructor), so MaterialEditor and the base node editor share one
  // bin and the context system treats them as the same active-editor slot.
  push_ctx_active(dontSetLastRef = false): void {
    contextWrangler.push(this.constructor, this as unknown as Area, !dontSetLastRef)
  }

  pop_ctx_active(_dontSetLastRef = false): void {
    contextWrangler.pop(this.constructor, this as unknown as Area)
  }

  _on_velpan_change(): void {
    if (this.ctx === undefined) {
      return
    }

    this.flagUIUpdate()
    let key = this.velpan.scale[0] + ':' + this.velpan.scale[1]
    if (key !== this._lastVelPanScale) {
      this._lastVelPanScale = key
      this.flagRebuild()
    }
    this.update()
  }

  /** Remove all node/socket widgets and reset the overdraw layer. */
  clearGraph(): void {
    for (const c of this.nodeContainer.children) {
      if (c instanceof NodeSocketElem) {
        c.remove()
      }
    }

    for (const node of this.nodes) {
      node.remove()
    }
    for (const sock of this.sockets) {
      sock.remove()
    }

    this.nodes.length = 0
    this.node_idmap = {}
    this.sockets.length = 0

    this.nodeContainer.clear()
    if (this.ctx?.screen) {
      this.nodeContainer.createOverdraw(this.ctx.screen)
    }
  }

  switchGraph(graphpath = this.graphPath): void {
    this.graphPath = graphpath
    this.recalcFlags |= NodeRecalcFlags.REBUILD
  }

  /** Tear down and recreate a NodeUI for every node in the current graph. */
  rebuildAll(): void {
    console.warn('rebuildAll')
    if (this.ctx === undefined) return

    this.recalcFlags &= ~NodeRecalcFlags.REBUILD

    this._last_graphpath = this.graphPath

    this.clearGraph()

    const graph = this.fetchGraph()

    if (!graph) {
      return
    }

    console.warn('regenerating node editor')

    const api = this.ctx.api

    for (const node of graph.nodes) {
      const cls = node.constructor!

      if (!api.hasStruct(cls)) {
        console.warn('Auto-making data api for ' + cls.name)
        // Chain Node.defineAPI onto the new node class's struct, declaring Node's
        // members directly on it.
        Node.defineAPI(api, api.mapStruct(cls, true))
      }

      const path = this.graphPath + '.nodes[' + node.graph_id + ']'

      const node2 = document.createElement('nodeui-x') as unknown as NodeUI

      node2.ned = this
      node2.ctx = this.ctx
      node2.setAttribute('datapath', path)

      this.nodes.push(node2)
      this.nodeContainer.shadow.appendChild(node2 as unknown as HTMLElement)
      node2.parentWidget = this.nodeContainer
      // check that node2 initialized
      if (this.ctx !== undefined) {
        node2.flushUpdate()
      }
    }

    this.flagUIUpdate()
    this.flushUpdate()
  }

  init(): void {
    super.init()

    const mwheel = (e: WheelEvent) => {
      const y = e.deltaY
      let fac = y / 500.0

      if (fac < 0.0) {
        fac = 1.0 + Math.abs(fac)
      } else {
        fac = 1.0 - fac
      }

      if (isNaN(fac) || fac === 0.0) {
        console.log('Bad scroll factor', fac)
        return
      }

      this.velpan.scale.mulScalar(fac)
      this.velpan.update()
      this.flushUpdate()
    }

    if (!this.header) {
      throw new Error('no header')
    }

    this.shadow.prepend(this.nodeContainer as unknown as HTMLElement)
    this.nodeContainer.ctx = this.ctx
    this.nodeContainer.parentWidget = this

    //create svg overdraw element
    if (this.ctx?.screen) {
      this.nodeContainer.createOverdraw(this.ctx.screen)
    }

    this.last_mpos = new Vector2()

    const mmove = (e: PointerEvent) => {
      this.on_mousemove(e)

      this.last_mpos[0] = e.x
      this.last_mpos[1] = e.y
    }

    const makehandler = <E>(handler: (e: E) => void) => {
      return (e: E) => {
        this.push_ctx_active()
        try {
          return handler(e)
        } catch (error) {
          util.print_stack(error as Error)
        } finally {
          this.pop_ctx_active()
        }
      }
    }

    this.on_mousedown = makehandler(this.on_mousedown.bind(this))

    this.nodeContainer.addEventListener('mousewheel', makehandler((e: WheelEvent) => mwheel(e)) as EventListener)
    this.nodeContainer.addEventListener('pointermove', makehandler((e: PointerEvent) => mmove(e)) as EventListener)
    this.nodeContainer.addEventListener(
      'pointerdown',
      makehandler((e: PointerEvent) => this.on_mousedown(e)) as EventListener
    )

    this.setCSS()

    const bgcolor = this.getDefault('editorBG') as string
    this.background = bgcolor
    this.saneStyle['background-color'] = bgcolor

    this.flagRebuild()
    this.buildSidebar()
  }

  buildSidebar(): void {
    if (!this.ctx) {
      if (!this.isDead()) {
        this.doOnce(this.buildHeader)
      }
      return
    }

    if (!this.sidebar) {
      this.sidebar = this.makeSideBar()
      this.sidebar._init()
      this.sidebar.position = 'right'
      this.sidebar.collapse(false)
    }
    this.onSidebarBuild(this.sidebar)
    this.sidebar.flushUpdate()
    this.sidebar.style.zIndex = '10'
  }

  buildHeader(): void {}

  onSidebarBuild(sidebar: EditorSideBar): void {
    sidebar.tabpanel.tab('Node')
  }

  rebuildSidebar(): void {
    if (this.sidebar === undefined) {
      return
    }

    const uidata = saveUIData(this.sidebar, 'node editor sidebar')

    this.sidebar.clear()
    this.onSidebarBuild(this.sidebar)

    loadUIData(this.sidebar, uidata)
  }

  makeHeader(container: Container<ViewContext>, addNoteArea = true, makeDraggable = true): Container<ViewContext> {
    const header = super.makeHeader(container, addNoteArea, makeDraggable).row()
    const menustrip = (this.menuStrip = header.row())

    header.style.zIndex = '10'
    menustrip.saneStyle['margin-left'] = '35px' //go past mouse threshold for screen border

    const button = menustrip.menu('Add', []) as unknown as {_build_menu: () => void}

    const this2 = this

    button._build_menu = function (this: {_menu: Menu<ViewContext>}) {
      this._menu = this2.makeAddNodeMenu()
      console.warn('Create Menu ' + this._menu._id)
    }

    return header
  }

  menuStrip?: RowFrame<ViewContext>

  /** Find the socket widget caching a given graph socket (linear scan, by identity). */
  getUISocket(sock: SocketType): NodeSocketElem | undefined {
    for (const node of this.nodes) {
      for (const sock2 of node.allsockets) {
        //remember that we cache direct references to sockets
        //for performance reason
        if (sock2.socket === sock) return sock2
      }
    }

    return undefined
  }

  on_mousedown(e: PointerEvent): void {
    this.last_mpos[0] = e.pageX
    this.last_mpos[1] = e.pageY

    const p = new Vector2(this.last_mpos)
    this.unproject(p, true)

    const sock = this.findSocket(p[0], p[1])

    if (sock !== undefined) {
      sock.click()
      return
    }

    let elem = this.ctx.screen.pickElement<UIBase<ViewContext>>(e.pageX, e.pageY)

    if (!elem) {
      console.log('elem', elem, e.pageX, e.pageY)
      return
    }

    let n1: UIBase<ViewContext> | undefined = elem
    while (n1 && n1.parentWidget) {
      if (n1 instanceof NodeUI) {
        elem = n1
        break
      }
      n1 = n1.parentWidget
    }

    if (elem === (this.nodeContainer as unknown as UIBase<ViewContext>)) {
      const tool = new VelPanPanOp()

      const id = this.getID()
      tool.inputs.velpanPath.setValue(`screen.editors[${id}].velpan`)

      this.ctx.toolstack.execTool(this.ctx, tool)
    } else if (elem instanceof NodeUI) {
      let mode = SelOneToolModes.UNIQUE
      const node = elem.getNode()

      if (e.shiftKey) {
        mode = node.graph_flag & NodeFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD
      }

      const gp = this.graphPath
      const gc = this.graphClass

      let cmd = `node.selectone(graphPath='${gp}' graphClass='${gc}' mode=${mode}`
      cmd += ` nodeId=${node.graph_id})`

      console.log(cmd)

      this.ctx.api.execTool(this.ctx, cmd)

      if (mode === SelOneToolModes.UNIQUE) {
        for (const elem2 of this.nodes) {
          elem2.setCSS()
        }
      } else {
        elem.setCSS()
      }

      console.log('translate')
      this.ctx.api.execTool(this.ctx, 'node.translate(useNodeEditorGraph=1)')
    }
  }

  on_resize(newsize: Vector2): void {
    super.on_resize(newsize)

    if (!this.header || !this.ctx) {
      this.flagRebuild()
      return
    }

    this._setNodeContainerRect()
  }

  get overdraw(): Overdraw<ViewContext> | undefined {
    return this.nodeContainer.overdraw
  }

  on_area_inactive(): void {
    if (this.overdraw) {
      this.nodeContainer.removeOverdraw()
    }

    this.clearGraph()
  }

  on_area_active(): void {
    super.on_area_active()
    this.nodeContainer.createOverdraw(this.ctx.screen)

    this.setCSS()
    this.flagRebuild()
    this.flagUIUpdate()
  }

  onFileLoad(is_active: boolean): void {
    if (!is_active) {
      return
    }

    this.overdraw?.clear()
    this.flagRebuild()
    this.flagUIUpdate()
  }

  /** Nearest socket widget to a graph-space point, within `limit` px, or undefined. */
  findSocket(localX: number, localY: number, limit = 25): NodeSocketElem | undefined {
    limit *= this.getDPI()

    let pos = new Vector2()
    const mpos = new Vector2([localX, localY])
    let mindis = 1e17,
      minsock: NodeSocketElem | undefined = undefined

    for (const n of this.nodes) {
      for (const sock of n.allsockets) {
        const r = sock.getClientRects()[0]

        if (r === undefined) {
          continue
        }
        pos[0] = r.x
        pos[1] = r.y

        if (sock.type === 'output') {
          pos[0] += r.width
        }

        this.unproject(pos, true)

        pos = sock.getAbsPos()
        const dis = mpos.vectorDistance(pos)

        if (dis < mindis && dis < limit) {
          mindis = dis
          minsock = sock
        }
      }
    }

    return minsock
  }

  on_mousemove(e: PointerEvent): void {
    const mpos = new Vector2([e.x, e.y])

    this.unproject(mpos, true)

    let actnode: NodeUI | undefined = undefined

    const elem = this.pickElement(e.pageX, e.pageY)
    if (elem instanceof NodeUI) {
      actnode = elem
    } else {
      let n = elem as UIBase | undefined
      while (n) {
        if (n instanceof NodeUI) {
          actnode = n
          break
        } else if (n instanceof NodeSocketElem) {
          actnode = n.uinode
          break
        }
        n = n.parentWidget
      }
    }

    const sock = this.findSocket(mpos[0], mpos[1])

    if (sock !== this.sockets.highlight) {
      if (this.sockets.highlight !== undefined) {
        this.sockets.highlight.isHighlight = false
        this.sockets.highlight._redraw()
      }

      this.sockets.highlight = sock
      if (sock !== undefined) {
        actnode = sock.uinode

        sock.isHighlight = true
        sock._redraw()
      }
    }

    if (this.nodes.highlight !== actnode) {
      if (this.nodes.highlight !== undefined) {
        this.nodes.highlight.isHighlight = false
      }

      this.nodes.highlight = actnode

      if (actnode !== undefined) {
        actnode.isHighlight = true
      }
    }
  }

  updateDPI(): void {
    const dpi = this.getDPI()

    if (dpi !== this._last_dpi) {
      this._last_dpi = dpi

      console.log('dpi update')
      this.flagRebuild()
      this.flagUIUpdate()
    }
  }

  updateZoom(): void {
    if (this._last_zoom.vectorDistance(this.velpan.scale) > 0.0001) {
      this._last_zoom.load(this.velpan.scale)
    }
  }

  /** Throttled (500 ms) recompile of the material shader; redraws the viewport when it changed. */
  checkCompile(): void {
    if (util.time_ms() - this._last_compile_test < 500) {
      return
    }

    const graph = this.fetchGraph()
    if (graph === undefined) {
      this._last_compile_test = util.time_ms()
      return
    }

    let key
    if (this.graphClass === 'shader') {
      key = 'material'
    }

    if (key === undefined) {
      this._last_compile_test = util.time_ms()
      return
    }

    const mat = this.ctx.api.getValue<Material>(this.ctx, key)
    if (mat === undefined) return

    // Recompile-detection only: regenerate the WGSL and compare the source
    // string. rlights doesn't affect the change-detection here, so pass {}.
    const script = mat.generateWgsl(this.ctx.scene, {}).wgsl

    if (script !== this._last_script) {
      console.log('Shader compile update!')
      this._last_script = script
      mat._regen = true
      window.redraw_viewport()
    }

    this._last_compile_test = util.time_ms()
  }

  _setNodeContainerRect(): void {
    this.nodeContainer.saneStyle['background-color'] = this.getDefault('background-color') as string

    this.setCSS()
    for (const node of this.nodes) {
      node.setCSS()
    }
  }

  update(): void {
    if (!this.ctx || window.FILE_LOADING) {
      return
    }

    super.update()

    if (this.checkThemeUpdate()) {
      this.loadThemeOverrides()

      this.flushSetCSS()
      this.flushUpdate()
      this.flushUpdate()
    }

    this.checkCompile()
    this.updateZoom()
    this.updateDPI()

    if (this.ctx === undefined) return

    const graph = this.fetchGraph()
    if (graph === undefined) {
      this.clearGraph()
      return
    }

    let regen = graph && graph.nodes.length !== this.nodes.length
    regen = regen || this._last_graphpath !== this.graphPath
    regen = regen || !!(this.recalcFlags & NodeRecalcFlags.REBUILD)

    if (regen) {
      this.rebuildAll()
    } else if (this._last_update_gen !== graph.updateGen) {
      this._last_update_gen = graph.updateGen

      let ok = !this.ignoreGraphUpdates
      ok = ok && !(this.ctx.modalFlag & ModalFlags.TRANSFORMING)

      if (ok) {
        this.flagUIUpdate()
      }
    }

    if (this.recalcFlags & NodeRecalcFlags.UI) {
      try {
        this._recalcUI()
      } catch (error) {
        util.print_stack(error as Error)
      }
    }
  }

  /** Suppress reactions to graph update signals (balance with popIgnore). */
  pushIgnore(): void {
    this.ignoreGraphUpdates++
  }

  popIgnore(): void {
    this.ignoreGraphUpdates = Math.max(this.ignoreGraphUpdates - 1, 0)
  }

  /** Resolve the graph at `graphPath`; undefined (not throwing) on a bad/empty path. */
  fetchGraph(): AnyGraph | undefined {
    let graph

    if (this.graphPath.trim() === '') {
      return undefined
    }

    try {
      graph = this.ctx.api.getValue<AnyGraph>(this.ctx, this.graphPath)
    } catch (error) {
      if (error instanceof DataPathError) {
        if (DEBUG.verboseDataPath) console.warn('bad graph path for node editor:' + this.graphPath)
        return undefined
      } else {
        throw error
      }
    }

    return graph
  }

  setCSS(): void {
    super.setCSS()

    this.style['overflow'] = 'hidden'
    this.nodeContainer.style['overflow'] = 'hidden'

    if (this.nodeContainer) {
      this.nodeContainer.saneStyle['background-color'] = 'rgba(0,0,0,0)'
    }

    if (!this.size || !this.pos) return

    if (this.overdraw) {
      this.overdraw.style['width'] = this.size[0] + 'px'
      this.overdraw.style['height'] = this.size[1] + 'px'
    }

    const dom = this.nodeContainer
    dom.style['position'] = 'absolute'
    dom.style['left'] = '0px'
    dom.style['top'] = '0px'
    dom.style['width'] = this.size[0] + 'px'
    dom.style['height'] = this.size[1] + 'px'
    dom.style['overflow'] = 'hidden'
  }

  startAddNodeMenu(): void {
    const menu = this.makeAddNodeMenu()
    startMenu(menu, this.last_mpos[0] - 10, this.last_mpos[1] - 20, false)
  }

  makeAddNodeMenu(): Menu<ViewContext> {
    const menu = document.createElement('menu-x') as unknown as Menu<ViewContext>
    menu.ctx = this.ctx

    const cats: {[category: string]: (typeof ShaderNodeTypes)[number][]} = {}
    for (const cls of ShaderNodeTypes) {
      const def = cls.nodedef() as {category?: string}

      const cat = def.category !== undefined ? def.category : 'Misc'
      if (!(cat in cats)) {
        cats[cat] = []
      }

      cats[cat].push(cls)
    }

    for (const k in cats) {
      const menu2 = document.createElement('menu-x') as unknown as Menu<ViewContext>
      menu2.title = k
      menu2.ctx = this.ctx

      for (const cls of cats[k]) {
        menu2.addItem(cls.nodedef().uiname ?? cls.name, cls.name)
      }

      menu.addItem(menu2)
    }

    // Use the public `on_select` hook (the old TS port cast to a non-existent
    // `onselect`, so the callback never fired). Wrap the tool call in
    // push/pop_ctx_active so node.add_node runs against this editor's graph.
    menu.on_select = (id: string | number) => {
      this.push_ctx_active()
      try {
        console.log('node add menu select', id)

        let cmd = `node.add_node(useNodeEditorGraph=1 nodeClass='${id}'`
        const p = new Vector2(this.last_mpos)

        this.unproject(p, true)
        cmd += ` x=${~~p[0]} y=${~~p[1]})`

        console.log(cmd)
        this.ctx.api.execTool(this.ctx, cmd)
      } finally {
        this.pop_ctx_active()
      }
    }

    return menu
  }

  defineKeyMap(): KeyMap {
    this.keymap = new KeyMap([
      new HotKey('A', ['shift'], () => {
        console.log('Add Node!')
        this.startAddNodeMenu()
      }),
      new HotKey('G', [], 'node.translate(useNodeEditorGraph=1)'),
      new HotKey('Delete', [], 'node.delete_selected(useNodeEditorGraph=1)'),
      new HotKey('X', [], 'node.delete_selected(useNodeEditorGraph=1)'),
      new HotKey('=', [], () => {
        this.velpan.scale.mulScalar(1.1)
        this.rebuildAll()
      }),
      new HotKey('-', [], () => {
        this.velpan.scale.mulScalar(0.9)
        this.rebuildAll()
      }),
      new HotKey('A', [], `node.toggle_select_all(useNodeEditorGraph=1 mode='AUTO')`),
    ])

    return this.keymap
  }

  getKeyMaps(): KeyMap[] {
    return [this.keymap!]
  }

  getLocalMouse(x: number, y: number): Vector2 | number[] {
    const rect = this.getClientRects()[0]
    if (rect === undefined) {
      return [0, 0]
    }

    return new Vector2([x - rect.x, y - rect.y])
  }

  /** Graph space → screen space (in place); `useScreenSpace` also adds the editor offset. */
  project(co: Vector2, useScreenSpace = false): void {
    const p = projcos.next().load(co)

    p.multVecMatrix(this.velpan.mat)

    if (useScreenSpace) {
      p[0] += this.pos![0]
      p[1] += this.pos![1]
    }

    co[0] = p[0]
    co[1] = p[1]
  }

  /** Screen space → graph space (in place); inverse of `project`. */
  unproject(co: Vector2, useScreenSpace = false): void {
    const p = projcos.next().load(co)

    if (useScreenSpace) {
      p[0] -= this.pos![0]
      p[1] -= this.pos![1]
    }

    p.multVecMatrix(this.velpan.imat)

    co[0] = p[0]
    co[1] = p[1]
  }

  copy(): NodeEditorBase {
    const ret = document.createElement('node-editor-x') as unknown as NodeEditorBase

    ret.velpan.load(this.velpan)
    ret.graphPath = this.graphPath

    return ret
  }

  /** Redraw the socket-to-socket connection lines into the overdraw layer. */
  _recalcLines(): void {
    if (!this.nodeContainer.overdraw) {
      return
    }

    this.nodeContainer.overdraw.clear()

    for (const node of this.nodes) {
      for (const uisock of node.inputs) {
        const sock = uisock.socket
        // A UI socket whose data-socket ref hasn't resolved yet (e.g. mid-
        // rebuild after a graph edit) has no edges to draw — skip it rather
        // than dereferencing undefined (matches the uisock2 guard below).
        if (sock === undefined) {
          continue
        }
        const p = uisock.getAbsPos(true)
        this.project(p)

        for (const sock2 of sock.edges) {
          const uisock2 = this.getUISocket(sock2)

          if (uisock2 === undefined) {
            console.warn('could not find uisocket for ', sock2)
            continue
          }

          const p2 = new Vector2(uisock2.getAbsPos(true))
          this.project(p2)

          this.overdraw!.line(p, p2, 'orange')
        }
      }
    }
  }

  flagUIUpdate() {
    this.recalcFlags |= NodeRecalcFlags.UI
    return this
  }

  flagRebuild() {
    this.recalcFlags |= NodeRecalcFlags.REBUILD
    return this
  }

  /** Re-sync every socket's cached ref + node CSS, then redraw lines; rebuilds if sockets drifted. */
  _recalcUI(): void {
    let totsock = 0

    for (const node of this.nodes) {
      for (const sock of node.allsockets) {
        sock.updateSocketRef()
        totsock++
      }

      node.setCSS()
    }

    this._recalcLines()

    //why does this happen? sometimes sockets get duplicated
    //in weird ways
    if (totsock !== this.sockets.length) {
      console.log('Socket length mismatch!')
      this.recalcFlags |= NodeRecalcFlags.REBUILD
      return
    }

    this.recalcFlags &= ~NodeRecalcFlags.UI
  }

  loadSTRUCT(reader: StructReader<this>): void {
    this.clearGraph()
    reader(this)

    this.velpan.onchange = this._on_velpan_change.bind(this)
    this.velpan.decay = this.#velPanDecay
  }
}
//Editor.register(NodeEditor)
