import {Container, PanelContents} from '../../../path.ux/scripts/pathux.js'
import {DataBlockBrowser} from '../../editor_base'
import {DynTopoSettings, SculptBrush} from '../../../brush'
import type {ViewContext} from '../../../core/context'
import type {TextureSelectPanel} from '../../properties/PropsEditor'
import type {BVHToolMode} from './pbvh'

export function buildBVHSettings(container: Container<ViewContext>, name: string): void {
  const path = `scene.tools.${name}`

  const browser = document.createElement('data-block-browser-x') as DataBlockBrowser<SculptBrush>
  browser.blockClass = SculptBrush
  browser.setAttribute('datapath', path + '.brush')
  browser.filterFunc = function (brush: SculptBrush): boolean {
    if (!browser.ctx) {
      return false
    }

    const toolmode = browser.ctx.toolmode! as BVHToolMode
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

  function doChannel(chName: string, panelCh: PanelContents<ViewContext> = settings): any {
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

    return col2
  }

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

  let p

  doChannel('radius')
  doChannel('strength')

  p = doChannel('autosmooth')
  p.prop(path + '.brush.flag[MULTIGRID_SMOOTH]')
  p.prop(path + '.brush.flag[PLANAR_SMOOTH]')
  p.prop(path + '.brush.smoothRadiusMul')

  doChannel('smoothProj', p)
  doChannel('autosmoothInflate', p)

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

  function dfield(con: any, key: string): any {
    const dfRow = con.row()
    const dfStrip = dfRow.strip(undefined, 4, 0)

    dfStrip.overrideDefault('labelOnTop', false)
    dfStrip.overrideDefault('BoxMargin', 0)
    dfStrip.overrideDefault('margin', 0)
    dfStrip.overrideDefault('BoxRadius', 5)

    const opath = `${path}.dynTopo.overrides[NONE]`

    const okey = DynTopoSettings.apiKeyToOverride(key)
    const icon = dfStrip.iconcheck(`${path}.dynTopo.overrides[${okey}]`)
    const ret = dfStrip.prop(`${path}.dynTopo.${key}`)

    icon.iconsheet = 0 //use small icons
    icon.drawCheck = false

    icon.update.after(() => {
      if (!icon.ctx) {
        return
      }

      const val = icon.ctx.api.getValue(icon.ctx, opath)

      if (!!val !== !!icon.disabled) {
        icon.disabled = val
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

  panel = col.panel('Multi Resolution')
  panel.useIcons(false)

  strip = panel.row()
  strip.useIcons()
  strip.tool('mesh.add_or_subdivide_grids()')
  strip.tool('mesh.reset_grids()')
  strip.tool('mesh.delete_grids()')

  strip = panel.row().strip()
  strip.useIcons(false)
  strip.tool('mesh.smooth_grids()')
  strip.tool('mesh.grids_test()')

  strip = panel.strip()
  strip.prop(path + '.enableMaxEditDepth')
  strip.prop(path + '.gridEditDepth')

  panel.tool('mesh.subdivide_grids()')

  container.flushUpdate()
}
