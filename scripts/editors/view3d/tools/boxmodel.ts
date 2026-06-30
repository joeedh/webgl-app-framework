/**
 * Box-modeling tool mode (Milestone 0 of documentation/plans/boxModelingTools.md).
 *
 * A thin ToolMode sibling of SculptCorePaintMode: it owns the box-modeling UI
 * (Blender-style vertex/edge/face selection-mode chips, an xray toggle, and the
 * selection-overlay toggle) and dispatches the selection tools. All geometry,
 * selection state and overlay batches live in C++ (sculptcore); this mode only
 * holds the small amount of view/tool state the C++ side and the LiteMesh draw
 * path read (`boxModelSelMode`, `drawSelectionOverlay`, `xray`, `selectRadius`).
 */
import {Container, DataAPI, DataStruct, HotKey, KeyMap} from '../../../path.ux/pathux'
import {ToolMode, type IToolModeDefine} from '../view3d_toolmode'
import {Icons} from '../../icon_enum.js'
import {SelMask} from '../selectmode.js'
import type {ViewContext} from '../../../core/context'

export class BoxModelToolMode extends ToolMode {
  /** Active element-selection domains (SelMask.VERTEX|EDGE|FACE bitmask). The
   * selection ops read this to decide which `select` layers to write. */
  boxModelSelMode = SelMask.VERTEX
  /** Draw the selection overlay (selected verts/edges/faces + active). */
  drawSelectionOverlay = true
  /** When set, the overlay ignores depth (see-through). Wired in M5. */
  xray = false
  /** Circle/brush-select radius (screen px). */
  selectRadius = 25

  static toolModeDefine(): IToolModeDefine {
    return {
      name        : 'boxmodel',
      uiname      : 'Box Model',
      icon        : Icons.EXTRUDE,
      flag        : 0,
      description : 'Traditional box modeling (select / extrude / inset / loop cut)',
      selectMode  : SelMask.OBJECT,
      transWidgets: [],
    }
  }

  static defineAPI(api: DataAPI, struct?: DataStruct): DataStruct {
    const st = super.defineAPI(api, struct)

    st.flags('boxModelSelMode', 'boxModelSelMode', {
      VERTEX: SelMask.VERTEX,
      EDGE  : SelMask.EDGE,
      FACE  : SelMask.FACE,
    })
      .icons({
        VERTEX: Icons.VERT_MODE,
        EDGE  : Icons.EDGE_MODE,
        FACE  : Icons.FACE_MODE,
      })
      .description('Selection mode (shift-click to add domains)')

    st.bool('drawSelectionOverlay', 'drawSelectionOverlay', 'Selection Overlay')
      .description('Highlight selected / active elements')
    st.bool('xray', 'xray', 'X-Ray').description('Draw the overlay through the mesh')
    st.float('selectRadius', 'selectRadius', 'Select Radius').noUnits().range(1, 500).step(1.0)

    return st
  }

  static buildHeader(header: Container<ViewContext>, addHeaderRow: () => Container<ViewContext>): void {
    super.buildHeader(header, addHeaderRow)

    const name = this.toolModeDefine().name

    let strip = header.strip()
    strip.useIcons(true)
    // Vertex / edge / face selection-mode chips (multi-select via the flag prop).
    strip.prop(`scene.tools.${name}.boxModelSelMode`)
    strip.prop(`scene.tools.${name}.drawSelectionOverlay`)
    strip.prop(`scene.tools.${name}.xray`)

    let row = addHeaderRow()
    strip = row.strip()
    strip.useIcons(true)
    strip.tool('litemesh.select_all(mode=AUTO)')
    strip.tool('litemesh.select_box()')
    strip.tool('litemesh.select_circle()')
    strip.tool('litemesh.select_path()')

    // Modeling tools (the "T" tools auto-chain a transform via transform=true).
    row = addHeaderRow()
    strip = row.strip()
    strip.useIcons(true)
    strip.tool('litemesh.extrude_region(transform=true)')
    strip.tool('litemesh.extrude_individual(transform=true)')
    strip.tool('litemesh.extrude_wire(transform=true)')
    strip.tool('litemesh.split_off(transform=true)')
    strip.tool('litemesh.inset_region()')

    header.flushUpdate()
  }

  defineKeyMap(): void {
    this.keymap = new KeyMap([
      new HotKey('A', [], 'litemesh.select_all(mode=AUTO)'),
      new HotKey('A', ['alt'], 'litemesh.select_all(mode=NONE)'),
      new HotKey('B', [], 'litemesh.select_box()'),
      new HotKey('C', [], 'litemesh.select_circle()'),
      // Transform the current selection via the shared transform modal — the
      // LiteMeshTransType bridge (litemesh_transtype.ts) supplies the movable
      // verts, so constraints / numeric entry / snapping all come for free.
      new HotKey('G', [], 'view3d.translate()'),
      new HotKey('R', [], 'view3d.rotate()'),
      new HotKey('S', [], 'view3d.scale()'),
      new HotKey('E', [], 'litemesh.extrude_region(transform=true)'),
      new HotKey('I', [], 'litemesh.inset_region()'),
    ])
  }
}

ToolMode.register(BoxModelToolMode)
