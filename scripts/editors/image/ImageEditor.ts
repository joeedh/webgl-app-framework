/*
 * Minimal image editor.
 *
 * This is the "clean" image editor that supports a single responsibility:
 * loading images into `ImageBlock`s and displaying the active image with
 * pan/zoom. All of the legacy UV-editing machinery (the `UVEditor`
 * component, find-nearest UV picking, the UV select/transform/flag ToolOps,
 * and the UV tools sidebar) lived in the old editor and now sits, unwired,
 * under `./pending-port/`. A new UV-editing abstraction layer will be
 * designed in a future plan and will replace it.
 *
 * See ./pending-port/TODO.md for the port checklist.
 */
import {DataBlockBrowser, Editor, EditorSideBar, HotKey, VelPan} from '../editor_base'
import {Icons} from '../icon_enum.js'
import {Vector2, Vector3, Vector4, Matrix4} from '../../util/vectormath.js'
import {nstructjs, KeyMap, UIBase, eventWasTouch, haveModal, Menu, DataAPI} from '../../path.ux/scripts/pathux.js'
import {VelPanPanOp} from '../velpan.js'
import {ImageBlock, ImageUser} from '../../image/image.js'
import {PrimitiveTypes, LayerTypes, SimpleMesh} from '../../webgl/simplemesh'
import {Shaders} from '../../shaders/shaders.js'
import {type BlockLoader, BlockLoaderAddUser, DataBlock} from '../../core/lib_api'
import type {Texture} from '../../webgl/webgl'
import {StructReader} from '../../path.ux/scripts/util/nstructjs'

export class ImageEditor extends Editor {
  imageUser: ImageUser
  velpan: VelPan

  sidebar: EditorSideBar

  matrix: Matrix4
  imatrix: Matrix4

  glPos: Vector2
  glSize: Vector2

  smesh: SimpleMesh | undefined
  _redraw_req?: number
  _last_image_key: string

  constructor() {
    super()

    this.matrix = new Matrix4()
    this.imatrix = new Matrix4()

    this.glPos = new Vector2()
    this.glSize = new Vector2([256, 256])

    this.smesh = undefined
    this._redraw_req = 1
    this._last_image_key = ''

    this.imageUser = new ImageUser()

    this.velpan = new VelPan()
    this.velpan.onchange = this.onVelPanChange.bind(this)

    this.container.noMarginsOrPadding()

    this.sidebar = this.makeSideBar()
  }

  onVelPanChange() {
    this.flagRedraw()
  }

  flagRedraw() {
    window.redraw_viewport(false)
    this._redraw_req = 1
  }

  static define() {
    return {
      areaname: 'ImageEditor',
      tagname : 'uv-image-editor-x',
      uiname  : 'Image Editor',
      apiname : 'imageEditor',
      flag    : 0,
      icon    : Icons.IMAGE_EDITOR,
      has3D   : true,
    }
  }

  copy(): this {
    const ret = document.createElement('uv-image-editor-x') as unknown as this

    ret.velpan.load(this.velpan)
    ret.imageUser.load(this.imageUser)
    ret.ctx = this.ctx

    return ret
  }

  static defineAPI(api: DataAPI) {
    const st = super.defineAPI(api)

    st.struct('imageUser', 'imageUser', 'Image', api.mapStruct(ImageUser))
    st.struct('velpan', 'velpan', 'VelPan', api.mapStruct(VelPan))

    return st
  }

  init() {
    super.init()

    const header = this.header!
    let row = header.row().strip()

    row.menu('Image', ['image.open()|Open', Menu.SEP])
    row.menu('View', [])

    const col = header.col()
    row = col.row()

    row.iconbutton(Icons.HOME, 'Reset Pan/Zoom', () => {
      this.velpan.reset()
      this.flagRedraw()
    })

    const browser = document.createElement('data-block-browser-x') as DataBlockBrowser<ImageBlock>
    browser.setAttribute('datapath', 'imageEditor.imageUser.image')
    browser.blockClass = ImageBlock

    row.add(browser)

    this.addEventListener('pointerdown', this.on_mousedown.bind(this))
    // XXX pathux's WheelEvent typing isn't inferred for this overload
    this.addEventListener('mousewheel', this.on_mousewheel.bind(this) as EventListenerOrEventListenerObject)
  }

  defineKeyMap() {
    this.keymap = new KeyMap([new HotKey('O', ['ctrl'], 'image.open()')])
    return this.keymap
  }

  on_mousewheel(e: WheelEvent) {
    const dt = 1.0 - e.deltaY * 0.001
    const scale = this.velpan.scale[0] * dt

    this.velpan.scale[0] = this.velpan.scale[1] = scale
    this.velpan.update()

    e.preventDefault()
    e.stopPropagation()
  }

  on_mousedown(e: PointerEvent) {
    if (haveModal() || !this.ctx) {
      return
    }

    const wasTouch = eventWasTouch(e)
    let ok = wasTouch && e.altKey
    ok = ok || (e.button !== 0 && !wasTouch)
    ok = ok || (e.button === 0 && e.altKey)

    if (ok) {
      const op = new VelPanPanOp()
      op.inputs.velpanPath.setValue('imageEditor.velpan')
      this.ctx.api.execTool(this.ctx, op)
    }
  }

  updateMatrix() {
    this.matrix.makeIdentity()

    const amat = new Matrix4()
    const aspect = this.glSize[1] / this.glSize[0]
    amat.scale(aspect, 1.0, 1.0)

    const pan = this.velpan.pos
    const zoom = this.velpan.scale[0]

    const pmat = new Matrix4()
    pmat.translate((2.0 * pan[0]) / this.glSize[1], (2.0 * pan[1]) / this.glSize[1], 0.0)

    const smat = new Matrix4()
    smat.scale(zoom, -zoom, 1.0)

    const tmat = new Matrix4()
    tmat.translate(-0.5, 0.5, 0.0)

    this.matrix.multiply(amat)
    this.matrix.multiply(smat)
    this.matrix.multiply(pmat)
    this.matrix.multiply(tmat)

    const image = this.imageUser.image
    const imgAspect = image?.ready ? image.width / image.height : 1.0

    const imat = new Matrix4()
    imat.scale(imgAspect, 1.0, 1.0)
    this.matrix.multiply(imat)

    this.imatrix.load(this.matrix).invert()
  }

  genMeshes(gl: WebGL2RenderingContext) {
    this._redraw_req = undefined

    if (this.smesh) {
      this.smesh.reset(gl)
    } else {
      this.smesh = new SimpleMesh(LayerTypes.UV | LayerTypes.COLOR | LayerTypes.ID | LayerTypes.LOC)
      this.smesh.add_island()
      this.smesh.add_island()
    }

    const checker = this.smesh.islands[0]
    const quadIsland = this.smesh.islands[1]

    checker.primflag = PrimitiveTypes.TRIS
    quadIsland.primflag = PrimitiveTypes.TRIS

    checker.program = Shaders.MeshEditShader
    quadIsland.program = Shaders.FlatMeshTexture

    const bg = new Vector4([0.7, 0.7, 0.7, 1.0])
    const bg2 = new Vector4([0.8, 0.8, 0.8, 1.0])

    const steps = 32
    for (let i = 0; i < steps * steps; i++) {
      const ix = i % steps
      const iy = ~~(i / steps)
      const ds = 1.0 / steps

      const x = ix / steps
      const y = iy / steps

      const quad = checker.quad(
        new Vector3([x, y, 0]),
        new Vector3([x, y + ds, 0]),
        new Vector3([x + ds, y + ds, 0]),
        new Vector3([x + ds, y, 0])
      )

      const c = (ix + iy) & 1 ? bg : bg2
      quad.colors(c, c, c, c)
      quad.ids(1, 1, 1, 1)
    }

    const white = new Vector4([1, 1, 1, 1])
    const quad = quadIsland.quad(
      new Vector3([0, 0, 0]),
      new Vector3([0, 1, 0]),
      new Vector3([1, 1, 0]),
      new Vector3([1, 0, 0])
    )

    quad.ids(1, 1, 1, 1)
    quad.uvs(new Vector2([0, 0]), new Vector2([0, 1]), new Vector2([1, 1]), new Vector2([1, 0]))
    quad.colors(white, white, white, white)
  }

  update() {
    if (!this.ctx) {
      return
    }

    this.push_ctx_active(false)
    super.update()

    const image = this.imageUser.image
    if (image) {
      image.update()
    }

    const key = image ? `${image.lib_id}:${image.updateGen}:${image.ready}` : ''
    if (key !== this._last_image_key) {
      this._last_image_key = key
      this.flagRedraw()
    }

    this.velpan.update(true, false)

    this.push_ctx_active(false)
  }

  viewportDraw(gl: WebGL2RenderingContext) {
    if (!gl || !this.ctx?.screen) {
      return
    }

    const dpi = UIBase.getDPI()

    this.glPos.load(this.pos!)
    this.glPos[1] = this.ctx.screen.size[1] - (this.pos![1] + this.size![1])
    this.glPos.mulScalar(dpi).floor()

    this.glSize.load(this.size!).mulScalar(dpi).ceil()

    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1])
    gl.viewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1])

    this.style['backgroundColor'] = 'rgba(0,0,0,0)'
    this.container.style['backgroundColor'] = 'rgba(0,0,0,0)'

    this.updateMatrix()

    if (this._redraw_req || !this.smesh) {
      this.genMeshes(gl)
    }

    const image = this.imageUser.image
    let gltex: Texture | undefined

    if (image?.ready) {
      gltex = image.getGlTex(gl)
    } else if (image) {
      image.update()
    }

    const uniforms = {
      size            : this.glSize,
      aspect          : this.glSize[0] / this.glSize[1],
      near            : 0.0001,
      far             : 1.0,
      polygonOffset   : 0.0,
      projectionMatrix: this.matrix,
      objectMatrix    : new Matrix4(),
      pointSize       : 5 * dpi,
      active_id       : -1,
      highlight_id    : -1,
      texture         : gltex,
      opacity         : 1.0,
      alpha           : 1.0,
    }

    gl.clearColor(0.3, 0.3, 0.3, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.disable(gl.DEPTH_TEST)
    gl.depthMask(false)
    gl.disable(gl.CULL_FACE)

    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    this.smesh!.islands[0].draw(gl, uniforms)

    if (gltex) {
      this.smesh!.islands[1].draw(gl, uniforms)
    }
  }

  setCSS() {
    super.setCSS()
    this.background = 'rgba(0,0,0,0)'
  }

  dataLink(owner: DataBlock, getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser) {
    super.dataLink(owner, getblock, getblock_addUser)
    this.imageUser.dataLink(owner, getblock, getblock_addUser)
  }

  loadSTRUCT(reader: StructReader<this>) {
    reader(this)
    super.loadSTRUCT(reader)

    this.velpan.onchange = this.onVelPanChange.bind(this)
  }
}

ImageEditor.STRUCT =
  nstructjs.inherit(ImageEditor, Editor) +
  `
  imageUser : ImageUser;
  velpan    : VelPan;
}`

nstructjs.register(ImageEditor)
Editor.register(ImageEditor)

declare global {
  interface Window {
    redraw_uveditors(): void
  }
}

/* Back-compat global still called by mesh UV ops and image_ops.js.
   Redraws any open image editors. */
window.redraw_uveditors = function () {
  if (!_appstate?.screen) {
    return
  }

  for (const sarea of _appstate.screen.sareas) {
    const editor = sarea.area

    if (editor instanceof ImageEditor) {
      editor.flagRedraw()
    }
  }
}
