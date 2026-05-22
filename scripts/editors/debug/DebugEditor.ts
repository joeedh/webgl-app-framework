import {PackFlags} from '../../path.ux/scripts/core/ui_base.js'
import {Editor} from '../editor_base.js'
import {nstructjs} from '../../path.ux/scripts/pathux.js'
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js'
import {Vector2} from '../../util/vectormath.js'
import {DisplayModes} from './DebugEditor_base.js'
import {Icons} from '../icon_enum.js'
import {getWebGL} from '../view3d/view3d.js'
import {getActiveWebGpuViewport} from '../view3d/view3d_draw_webgpu.js'
import {
  peekWebGpuDebug,
  createDebugEditorResources,
  drawDebugEditorBlit,
  type WebGpuDebug,
  type DebugEditorWebGpuResources,
} from './webgpu_debug.js'

interface CanvasWithDpi extends HTMLCanvasElement {
  dpi: number
}

export class DebugEditor extends Editor {
  needsRebuildHeader = true
  displayMode: number = DisplayModes.RAW
  activeFBOHistory: string = 'render_final'

  glPos = new Vector2([0, 0])
  glSize = new Vector2([512, 512])

  canvas: CanvasWithDpi | undefined
  webgpuResources: DebugEditorWebGpuResources | undefined
  webgpuDebug: WebGpuDebug | undefined
  private _last_update_key: string | undefined

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
DebugEditor {
  displayMode      : int;
  activeFBOHistory : string;
}
`
  )

  static define() {
    return {
      has3D   : true,
      tagname : 'debug-editor-x',
      areaname: 'DebugEditor',
      apiname : 'debugEditor',
      uiname  : 'Debug',
      icon    : -1,
    }
  }

  static defineAPI(api: any) {
    const dedstruct = super.defineAPI(api)

    const redrawDebug = function (this: any) {
      const editor = this.dataref as DebugEditor
      editor._redraw()
    }

    const edef = dedstruct.enum('displayMode', 'displayMode', DisplayModes)

    edef.icons({
      RAW   : Icons.VIEW_RAW,
      IDS   : Icons.VIEW_RAW,
      NORMAL: Icons.VIEW_NORMALS,
      DEPTH : Icons.VIEW_DEPTH,
      ALPHA : Icons.VIEW_ALPHA,
    })

    edef.on('change', redrawDebug)

    return dedstruct
  }

  init(): void {
    super.init()

    this.canvas = getWebGL()?.canvas as CanvasWithDpi | undefined

    // Resources are device-bound and allocated lazily on the first draw,
    // since the GPUDevice isn't ready until view3d_draw_webgpu has
    // finished its async init.
    this.webgpuResources = undefined
    this.webgpuDebug = undefined

    this.header = this.header!.row()

    this.defineKeyMap()
  }

  flagRebuildHeader() {
    this.needsRebuildHeader = true
  }

  rebuildHeader(): void {
    const header = (this as any).header
    if (!header) return

    this.needsRebuildHeader = false
    header.clear()

    const fbos = this.webgpuDebug?.fbos
    if (!fbos) return

    const enumdef: Record<string, number> = {}
    const idmap: Record<number, string> = {}
    let i = 0

    for (const k in fbos) {
      enumdef[k] = i
      idmap[i] = k
      i++
    }

    header.listenum(undefined, {
      enumDef   : enumdef,
      name      : 'Active History',
      defaultval: this.activeFBOHistory,
    }).on_select = (val: number) => {
      this.activeFBOHistory = idmap[val]
      window.redraw_viewport()
    }

    header.prop('debugEditor.displayMode', PackFlags.USE_ICONS)
  }

  _redraw(): void {
    window.redraw_viewport()
  }

  defineKeyMap() {
    const keymap = new KeyMap([
      new HotKey('Right', [], () => this._redraw()),
      new HotKey('Left', [], () => this._redraw()),
    ])
    ;(this as any).keymap = keymap
    return keymap
  }

  viewportDraw(_gl: unknown): void {
    // Refresh the WebGPU debug singleton and history dropdown before
    // testing for an active capture, so the editor populates its list
    // on first frame after init.
    this.updateBackendDebug()

    const dbg = this.webgpuDebug
    if (!dbg) return

    let history = dbg.fbos[this.activeFBOHistory]
    if (!history) {
      // No history under this name yet — auto-pick the first available
      // capture so the editor starts displaying something.
      for (const k in dbg.fbos) {
        this.activeFBOHistory = k
        ;(this as any).doOnce(this.rebuildHeader)
        history = dbg.fbos[k]
        break
      }
      if (!history) return
    }
    if (history.length === 0) return

    const source = history.head
    if (!source) return

    if (!this.canvas) return
    const viewport = getActiveWebGpuViewport(this.canvas)
    if (!viewport) return

    if (!this.webgpuResources) {
      this.webgpuResources = createDebugEditorResources(viewport.gpu.device)
    }

    // Compute region in WebGL conventions (origin bottom-left). The blit
    // helper flips Y to WebGPU's origin-top-left internally.
    const sarea = (this as any).owning_sarea
    const dpi = this.canvas.dpi
    const x = sarea.pos[0] * dpi
    let y = (sarea.pos[1] + sarea.size[1]) * dpi
    const w = sarea.size[0] * dpi
    const h = sarea.size[1] * dpi
    const screen = this.ctx.screen as any
    y = screen.pos[1] + screen.size[1] - y

    this.glPos[0] = ~~x
    this.glPos[1] = ~~y
    this.glSize[0] = ~~w
    this.glSize[1] = ~~h

    drawDebugEditorBlit(
      viewport,
      this.webgpuResources,
      source,
      {x: ~~x, y: ~~y, w: ~~w, h: ~~h},
      this.displayMode | 0,
      1.0
    )
  }

  updateBackendDebug(): void {
    const dbg = peekWebGpuDebug()
    let rebuild = false
    if (this.webgpuDebug !== dbg) {
      this.webgpuDebug = dbg
      rebuild = true
    }

    let key = ''
    if (dbg) {
      for (const k in dbg.fbos) key += k + ':'
    }

    rebuild = rebuild || key !== this._last_update_key
    this._last_update_key = key

    if (rebuild) {
      this.flagRebuildHeader()
    }
  }

  update(): void {
    this.updateBackendDebug()
    if (this.needsRebuildHeader) {
      this.rebuildHeader()
    }
    super.update()
  }

  copy(): HTMLElement {
    const ret = document.createElement('debug-editor-x') as unknown as DebugEditor
    ret.ctx = this.ctx
    return ret as unknown as HTMLElement
  }
}

Editor.register(DebugEditor as any)
