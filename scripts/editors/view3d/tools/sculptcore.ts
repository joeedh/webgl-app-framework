import {
  Container,
  DataAPI,
  DataStruct,
  haveModal,
  HotKey,
  KeyMap,
  Matrix4,
  nstructjs,
  PackFlags,
  PanelContents,
  UIBase,
  util,
  Vector3,
} from '../../../path.ux/pathux'
import {ToolMode, type IToolModeDefine} from '../view3d_toolmode'
import {PaintToolModeBase} from './pbvh_base'
import {Icons} from '../../icon_enum.js'
import type {View3D} from '../view3d'
import {BrushFlags, DynTopoFlags, DynTopoOverrides, SculptIcons, SculptTools} from '../../../brush/brush_base.js'
import {SelMask} from '../selectmode.js'
import type {Mesh} from '../../../../addons/builtin/mesh/src/mesh'
import {BVHFlags} from '../../../../addons/builtin/mesh/src/bvh'
import type {ISurfaceSampler} from '../../../util/spatial'
import type {LiteMesh} from '../../../lite-mesh/index'
import {DynTopoSettings, SculptBrush} from '../../../brush/index'
import type {ViewContext} from '../../../core/context'
import {DataBlockBrowser} from '../../editor_base'
import {SculptPaintOp} from './sculptcore_ops'
import {builSculptcoreBrush} from './sculptcore_bindings'

export class SculptCorePaintMode extends PaintToolModeBase {
  _apiDynTopo: any

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
        SculptCorePaintMode {
        }
    `
  )

  static toolModeDefine(): IToolModeDefine {
    return {
      name        : 'sculptcore',
      uiname      : 'Sculptcore',
      icon        : Icons.SCULPT_DRAW,
      flag        : 0,
      description : 'Sculptcore mode',
      selectMode  : SelMask.OBJECT,
      transWidgets: [],
    }
  }

  static buildSettings(container: Container<ViewContext>): void {
    const name = this.toolModeDefine().name
    const path = `scene.tools.${name}`

    const browser = document.createElement('data-block-browser-x') as DataBlockBrowser<SculptBrush>
    browser.blockClass = SculptBrush
    browser.setAttribute('datapath', path + '.brush')
    browser.filterFunc = function (brush: SculptBrush): boolean {
      if (!browser.ctx) {
        return false
      }

      const toolmode = browser.ctx.toolmode! as SculptCorePaintMode
      return brush.tool === toolmode.tool
    }

    const row = container.row()
    row.add(browser)
    row.useIcons(true)
    row.tool("brush.load_default(dataPath='scene.tools.sculpt.brush')")

    const col = container.col()
    let strip
    let panel
    let panel2

    const settings = col.panel('Brush Settings')
    strip = settings.row().strip()
    strip.useIcons(false)
    strip.label('Spacing')
    strip.prop(path + '.brush.spacingMode')

    function doChannel(chName: string, panelCh: PanelContents<ViewContext> = settings): Container<ViewContext> {
      const col2 = panelCh.col().strip()

      if (chName === 'radius') {
        col2.prop(path + `.brushRadius`)
      } else {
        col2.prop(path + `.brush.${chName}`)
      }

      panelCh = col2.panel('Dynamics')
      panelCh.panelFrame.openCloseIcon.overrideClassDefault('panel.header', 'iconSize', 12)

      panelCh.panelFrame.overrideDefault('padding-top', 0)
      panelCh.panelFrame.overrideDefault('padding-bottom', 0)
      panelCh.prop(path + `.brush.dynamics.${chName}.useDynamics`)
      panelCh.prop(path + `.brush.dynamics.${chName}.curve`)
      panelCh.closed = true
      panelCh.setCSS()

      panelCh.useIcons(false)
      return col2
    }

    /*
    panel = col.panel('Texture')
    panel.closed = true
    const tex = document.createElement('texture-select-panel-x') as TextureSelectPanel

    tex.setAttribute('datapath', path + '.brush.texUser.texture')

    strip = panel.row().strip()
    strip.useIcons(false)

    strip.prop(path + '.brush.texUser.mode')
    strip.prop(path + '.brush.texUser.flag[RAKE]')
    strip.prop(path + '.brush.texUser.flag[FANCY_RAKE]')

    strip = panel.row().strip()
    strip.useIcons(false)
    strip.prop(path + '.brush.texUser.flag[ORIGINAL_CO]')
    strip.prop(path + '.brush.texUser.flag[CONSTANT_SIZE]')
    strip.prop(path + '.brush.texUser.flag[CURVED]')

    strip = panel.row().strip()
    strip.useIcons(false)
    strip.prop(path + '.brush.texUser.pinch')

    panel.add(tex)
    */

    panel = col.panel('Falloff')
    panel.prop(path + '.brush.falloff')

    panel2 = panel.panel('Square Settings')
    panel2.prop(path + '.brush.flag[SQUARE]')
    strip = panel2.row().strip()
    strip.useIcons(false)
    strip.prop(path + '.brush.flag[LINE_FALLOFF]')
    strip.prop(path + '.brush.flag[USE_LINE_CURVE]')
    panel2.prop(path + '.brush.falloff2')
    panel2.closed = true

    panel.closed = true

    let p: Container<ViewContext> | PanelContents<ViewContext>

    doChannel('radius')
    doChannel('strength')

    p = doChannel('autosmooth')
    //p.prop(path + '.brush.flag[MULTIGRID_SMOOTH]')
    //p.prop(path + '.brush.flag[PLANAR_SMOOTH]')
    p.prop(path + '.brush.smoothRadiusMul')

    doChannel('smoothProj', p as PanelContents<ViewContext>)
    doChannel('autosmoothInflate', p as PanelContents<ViewContext>)

    p = doChannel('rake')
    p.prop(path + '.brush.rakeCurvatureFactor')
    p.prop(path + '.brush.flag[CURVE_RAKE_ONLY_POS_X]')

    doChannel('pinch')

    p = doChannel('concaveFilter')
    p.prop(path + '.brush.flag[INVERT_CONCAVE_FILTER]')

    doChannel('sharp')

    col.prop(path + '.brush.flag[INVERT]')
    col.prop(path + '.brush.spacing')
    col.prop(path + '.brush.color')
    col.prop(path + '.brush.bgcolor')

    col.prop(path + '.brush.planeoff')
    col.prop(path + '.brush.normalfac')

    function dfield(con: Container<ViewContext>, key: string): UIBase<ViewContext> {
      const row = con.row()
      const strip = row.strip(undefined, 4, 0)

      strip.overrideDefault('labelOnTop', 0)
      strip.overrideDefault('BoxMargin', 0)
      strip.overrideDefault('margin', 0)
      strip.overrideDefault('BoxRadius', 5)

      const opath = `${path}.dynTopo.overrides[NONE]`

      const okey = DynTopoSettings.apiKeyToOverride(key)
      //let icon = row.iconcheck(`${path}.dynTopo.overrides[${okey}]`);
      const icon = strip.iconcheck(`${path}.dynTopo.overrides[${okey}]`, -1)
      const ret = strip.prop(`${path}.dynTopo.${key}`)

      icon.iconsheet = 0 //use small icons
      icon.drawCheck = false

      icon.updateAfter(() => {
        if (!icon.ctx) {
          return
        }

        const val = icon.ctx.api.getValue(icon.ctx, opath)

        if (!!val !== !!icon.disabled) {
          icon.disabled = !!val
        }
      })

      return ret
    }

    panel = col.panel('DynTopo')
    panel.useIcons(false)
    panel.noMarginsOrPadding()

    panel.prop(path + '.inheritDynTopo')
    dfield(panel, 'edgeSize')
    dfield(panel, 'flag[ENABLED]')
    dfield(panel, 'flag[SUBDIVIDE]')
    dfield(panel, 'flag[COLLAPSE]')
    dfield(panel, 'flag[ADAPTIVE]')

    dfield(panel, 'edgeMode')
    dfield(panel, 'spacing')
    dfield(panel, 'spacingMode')

    panel2 = panel.panel('Advanced')
    dfield(panel2, 'flag[FANCY_EDGE_WEIGHTS]')
    dfield(panel2, 'subdivideFactor')
    dfield(panel2, 'decimateFactor')
    dfield(panel2, 'edgeCount')
    dfield(panel2, 'repeat')
    dfield(panel2, 'valenceGoal')
    dfield(panel2, 'maxDepth')

    dfield(panel2, 'subdivMode')

    dfield(panel2, 'flag[QUAD_COLLAPSE]')
    dfield(panel2, 'flag[ALLOW_VALENCE4]')
    dfield(panel2, 'flag[DRAW_TRIS_AS_QUADS]')

    //panel
    container.flushUpdate()
  }

  static buildHeader(header: Container<ViewContext>, addHeaderRow: () => Container<ViewContext>): void {
    super.buildHeader(header, addHeaderRow)

    const name = this.toolModeDefine().name

    // see SculptCorePaintMode.defineAPI for how these properties are defined
    
    let strip = header.strip()
    strip.prop(`scene.tools.${name}.drawBVH`)
    strip.prop(`scene.tools.${name}.drawFlat`)
    strip.prop(`scene.tools.${name}.drawWireframe`)
    //strip.prop(`scene.tools.${name}.drawNodeIds`);
    //strip.prop(`scene.tools.${name}.drawColPatches`);
    strip.prop(`scene.tools.${name}.drawMask`)

    let row = addHeaderRow()
    const path = `scene.tools.${name}.brush`

    strip = row.strip()
    //strip.listenum(path + ".tool");
    strip.prop(`scene.tools.${name}.tool`)
    strip.tool('mesh.symmetrize()')
    strip.tool('litemesh.mark_seam_interactive()')
    strip.prop(`scene.tools.${name}.symmetryAxes`)

    row = addHeaderRow()
    strip = row.strip()
    strip.prop(path + '.dynamics.radius.useDynamics')
    strip.prop(`scene.tools.${name}.brushRadius`)

    strip.prop(path + '.dynamics.strength.useDynamics')
    strip.prop(path + '.strength')
    strip.prop(path + '.flag[SHARED_SIZE]', PackFlags.HIDE_CHECK_MARKS)

    strip = row.strip()
    strip.pathlabel('mesh.triCount', 'Triangles')

    strip.prop(path + '.spacing')

    row = addHeaderRow()
    strip = row.strip()
    strip.prop(`scene.tools.${name}.reprojectCustomData`)

    header.flushUpdate()
  }

  static defineAPI(api: DataAPI): DataStruct {
    const st = super.defineAPI(api)

    st.flags('symmetryAxes', 'symmetryAxes', {
      X: 1,
      Y: 2,
      Z: 4,
    }).icons({
      X: Icons.SYM_X,
      Y: Icons.SYM_Y,
      Z: Icons.SYM_Z,
    })

    st.float('sharedBrushRadius', 'sharedBrushRadius', 'Shared Radius').noUnits().range(0, 450)
    st.float('_brushSizeHelper', 'brushRadius', 'Radius').noUnits().range(0, 450).step(1.0)

    function onchange(this: any): void {
      const pbvh = this.dataref
      const mesh = pbvh.ctx.mesh

      if (mesh?.bvh && !mesh.bvh.dead) {
        const bvh = mesh.bvh

        for (const node of bvh.nodes) {
          if (node.leaf) {
            node.flag |= BVHFlags.UPDATE_DRAW
            bvh.updateNodes.add(node)
          }
        }

        bvh.update()
        window.redraw_viewport(true)
      }
    }

    st.bool('drawWireframe', 'drawWireframe', 'Draw Wireframe').on('change', onchange).icon(Icons.DRAW_SCULPT_WIREFRAME)
    st.bool('drawBVH', 'drawBVH', 'Draw BVH').on('change', onchange)
    st.bool('drawMask', 'drawMask', 'Draw Mask').on('change', onchange)

    st.bool('drawColPatches', 'drawColPatches', 'Draw Color Patches').on('change', onchange)

    st.bool('drawNodeIds', 'drawNodeIds', 'Draw BVH Vertex IDs').on('change', onchange)
    st.bool('drawFlat', 'drawFlat', 'Draw Flat').on('change', onchange).icon(Icons.DRAW_SCULPT_FLAT)
    st.enum('tool', 'tool', deleteTsEnumIntegers(SculptTools)).icons(SculptIcons)

    st.struct('_apiBrushHelper', 'brush', 'Brush', api.mapStruct(SculptBrush))

    st.struct('_apiDynTopo', 'dynTopo', 'DynTopo', api.mapStruct(DynTopoSettings))
    st.bool('_apiInheritDynTopo', 'inheritDynTopo', 'Inherit Everything')

    st.bool('reprojectCustomData', 'reprojectCustomData', 'Reproject UVs & colors')

    return st
  }

  defineKeyMap(): void {
    this.keymap = new KeyMap([
      new HotKey('F', [], 'brush.set_radius()'),
      new HotKey('.', [], 'view3d.view_selected()'),
      new HotKey('M', ['alt'], 'paint.clear_mask()'),
      new HotKey('K', [], 'litemesh.mark_seam_interactive()'),
    ])
  }

  constructor(manager: any) {
    super(manager)

    this._apiDynTopo = new Proxy(this.dynTopo, {
      get: (target: any, key: string | symbol): any => {
        const brush = this.getBrush()

        if (brush && key === 'overrideMask') {
          return brush.dynTopo.overrideMask
        }

        const all = !brush || brush.dynTopo.overrideMask & DynTopoOverrides.NONE

        if (all) {
          return (this.dynTopo as any)[key]
        }

        if (key !== 'flag') {
          const key2 = DynTopoSettings.apiKeyToOverride(key as string)

          if (!key2) {
            return (brush.dynTopo as any)[key]
          }

          let override = DynTopoOverrides[key2 as keyof typeof DynTopoOverrides] as unknown as number
          override = brush.dynTopo.overrideMask & override

          if (override) {
            return (brush.dynTopo as any)[key]
          } else {
            return (this.dynTopo as any)[key]
          }
        } else {
          //create merged flags
          let flag = 0

          const f1 = this.dynTopo.flag
          const f2 = brush.dynTopo.flag
          const oflag = brush.dynTopo.overrideMask

          for (const k in DynTopoFlags) {
            const f = DynTopoFlags[k] as unknown as number

            if (oflag & f) {
              flag |= f2 & f ? f : 0
            } else {
              flag |= f1 & f ? f : 0
            }
          }

          return flag
        }
      },
      set: (target: any, key: string | symbol, val: any): boolean => {
        const brush = this.getBrush()

        const all = !brush || brush.dynTopo.overrideMask & DynTopoOverrides.NONE

        if (brush && key === 'overrideMask') {
          brush.dynTopo.overrideMask = val
          return true
        } else if (all) {
          ;(this.dynTopo as any)[key] = val
          return true
        }

        if (key !== 'flag') {
          const key2 = DynTopoSettings.apiKeyToOverride(key as string)

          if (
            key2 &&
            brush.dynTopo.overrideMask & (DynTopoOverrides[key2 as keyof typeof DynTopoOverrides] as unknown as number)
          ) {
            ;(brush.dynTopo as any)[key] = val
          } else {
            ;(this.dynTopo as any)[key] = val
          }
        } else {
          const flag = 0
          const oflag = brush.dynTopo.overrideMask

          for (const k in DynTopoFlags) {
            const f = DynTopoFlags[k] as unknown as number
            const dynTopo = oflag & f ? brush.dynTopo : this.dynTopo

            if (val & f) {
              dynTopo.flag |= f
            } else {
              dynTopo.flag &= ~f
            }
          }
        }

        return true
      },
    })
  }

  onInactive() {
    this.clearBrushLines()
  }

  get _brushSizeHelper(): number {
    const brush = this.getBrush()

    if (!brush) {
      return 55.0
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      return this.sharedBrushRadius
    } else {
      return brush.radius
    }
  }

  set _brushSizeHelper(val: number) {
    const brush = this.getBrush()

    if (!brush) {
      return
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      this.sharedBrushRadius = val
    } else {
      brush.radius = val
    }
  }

  get _apiBrushHelper(): SculptBrush | undefined {
    return this.getBrush()
  }

  set _apiBrushHelper(brush: SculptBrush | undefined) {
    if (brush === undefined) {
      return
    }

    const oldbrush = this.getBrush()
    if (oldbrush === brush) {
      return
    }

    const scene = this.ctx ? this.ctx.scene : undefined
    this.slots[this.tool].setBrush(brush, scene)
  }

  get _apiInheritDynTopo(): boolean {
    const brush = this.getBrush()
    if (!brush) {
      return false
    }

    return !!(brush.dynTopo.overrideMask & DynTopoOverrides.NONE)
  }

  set _apiInheritDynTopo(v: boolean) {
    const brush = this.getBrush()
    if (!brush) {
      return
    }

    if (v) {
      brush.dynTopo.overrideMask |= DynTopoOverrides.NONE
    } else {
      brush.dynTopo.overrideMask &= ~DynTopoOverrides.NONE
    }
  }

  on_mousedown(e: PointerEvent, x: number, y: number): boolean {
    this.mpos[0] = e.x
    this.mpos[1] = e.y

    if (e.button === 0 && !e.altKey) {
      let brush = this.getBrush()

      const isColor = brush.tool === SculptTools.PAINT || brush.tool === SculptTools.PAINT_SMOOTH
      const smoothtool = isColor ? SculptTools.PAINT_SMOOTH : SculptTools.SMOOTH

      if (e.shiftKey) {
        brush = this.getBrush(smoothtool)
      }

      const radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius

      brush = brush.copy()
      brush.dynTopo.loadDefaults(this.dynTopo)

      if (e.ctrlKey) {
        const t = brush.color
        brush.color = brush.bgcolor
        brush.bgcolor = t
      }
      brush.radius = radius

      this.ctx.api.execTool(this.ctx, 'sculptcore.paint()', {
        brush       : brush,
        //drawFaceSet        : drawFaceSet,
        symmetryAxes: this.symmetryAxes,
        //dynTopoDepth       : brush.dynTopo.maxDepth,
        //useMultiResDepth   : this.enableMaxEditDepth,
        //reprojectCustomData: this.reprojectCustomData,
      })

      return true
    }

    window.redraw_viewport()

    return false
  }

  on_mousemove(e: PointerEvent, x: number, y: number, was_touch: boolean): any {
    const ret = super.on_mousemove(e, x, y, was_touch)

    this.mpos[0] = e.x
    this.mpos[1] = e.y

    if (this.ctx?.view3d) {
      this.drawBrush(this.ctx.view3d)
    }

    return ret
  }

  on_mouseup(e: PointerEvent, x: number, y: number, wasTouch: boolean): boolean {
    super.on_mouseup(e, x, y, wasTouch)

    this.mdown = false
    return false
  }

  on_drawend(view3d: View3D): void {
    this.ctx = view3d.ctx
    this.drawBrush(view3d)
  }

  drawBrush(view3d: View3D, force = false, x = this.mpos[0], y = this.mpos[1]): void {
    this.clearBrushLines()

    if (haveModal() && !force && !(this.ctx?.toolstack?.head instanceof SculptPaintOp)) {
      return
    }

    const drawCircle = (x: number, y: number, r: number, mat: Matrix4 = new Matrix4(), z: number = 0.0): void => {
      const p = new Vector3()
      p[0] = x
      p[1] = y
      p[2] = z
      this._brush_lines.push(view3d.overdraw!.circle(Array.from(p), r, 'rgb(255,175,75)'))
    }

    const brush = this.getBrush()
    if (!brush) {
      return
    }

    const radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius

    const r = this._radius !== undefined ? this._radius : radius
    drawCircle(x, y, r)
  }

  getSurfaceSampler(mesh: Mesh): ISurfaceSampler {
    return this.ctx.object!.data! as LiteMesh
  }
}
ToolMode.register(SculptCorePaintMode)
