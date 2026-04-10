import * as ui_noteframe from '../path.ux/scripts/widgets/ui_noteframe'
import '../path.ux/scripts/util/struct.js'
import {NodeEditor} from '../editors/node/NodeEditor.js'
import {NodeViewer} from '../editors/node/NodeEditor_debug.js'
import {Editor, editorAccessor, getContextArea} from '../editors/editor_base'
import {ResourceBrowser} from '../editors/resbrowser/resbrowser.js'
import * as util from '../util/util.js'
import {Mesh} from '../mesh/mesh.js'
import {Light} from '../light/light.js'
import {Scene} from '../scene/scene'
import {BlockSet, DataBlock, DataRef, Library} from './lib_api'
import {DebugEditor} from '../editors/debug/DebugEditor.js'
import {MenuBarEditor} from '../editors/menu/MainMenu.js'
import {Context, ILockableCtx, toLockedImpl} from '../path.ux/scripts/pathux.js'
import {SavedToolDefaults, Screen, UIBase} from '../path.ux/scripts/pathux.js'
import {PropsEditor} from '../editors/properties/PropsEditor.js'
import {MaterialEditor} from '../editors/node/MaterialEditor.js'
import {TetMesh} from '../tet/tetgen.js'
import {StrandSet} from '../hair/strand.js'
import {SMesh} from '../smesh/smesh.js'

const passthrus = new Set<string | number | symbol>(['datalib', 'gl', 'graph', 'last_tool', 'toolstack', 'api'])

import bus from './bus'
import type {AppState} from './appstate.js'
import {Material} from './material'
import {View3D} from '../editors/all.js'
import {SceneObject} from '../sceneobject/sceneobject'

type AppLibrary = Library & {material: BlockSet<Material>; scene: BlockSet<Scene>}

function saveProperty(ctx: any, key: string | symbol | number) {
  const val = ctx[key]

  if (passthrus.has(key) || val instanceof UIBase || val instanceof Screen) {
    return new KeyPassThruProp(key)
  }

  //console.log("saveProperty called", key);
  return saveProperty_intern(ctx, ctx[key], key)
}

function saveProperty_intern(ctx: any, val: any, owning_key: string | symbol | number): any {
  if (typeof val !== 'object') return val

  if (typeof val === 'function' && !val[Symbol.iterator]) {
    return val
  }
  if (val instanceof DataBlock) {
    return DataRef.fromBlock(val)
  }

  // handle iterator methods
  let isiter = typeof val === 'function' || typeof val === 'object'
  isiter = isiter && val[Symbol.iterator]

  if (isiter) {
    const ret = []
    for (const item of val) {
      ret.push(saveProperty_intern(ctx, item, owning_key))
    }
    return ret
  }

  console.warn('Warning, unknown data in ToolContext.prototype.savePropertyIntern()', owning_key)
  return val
}

function loadProperty(ctx: any, key: symbol | string | number, data: any) {
  if (typeof data !== 'object') {
    return data
  }

  if (data instanceof KeyPassThruProp) {
    return ctx[data.key]
  } else if (data instanceof DataRef) {
    return ctx.state.datalib.get(data)
  } else if (data.constructor === Array) {
    // stupid TS won't let us manipulate any[] arrays
    const ret = [] as unknown as Record<number, any>
    ;(ret as any).length = data.length

    for (let i = 0; i < data.length; i++) {
      ret[i] = loadProperty(ctx, i, (data as unknown as Record<number, any>)[i])
    }

    return ret
  } else {
    return data
  }
}

class ContextExtraAPI implements ILockableCtx {
  state: AppState

  constructor(state: AppState) {
    this.state = state
  }

  toLocked = toLockedImpl
  saveProperty = saveProperty
  loadProperty = loadProperty

  play() {
    this.state.playing = true
  }

  stop() {
    this.state.playing = false
  }

  message(msg: string, timeout = 2500) {
    return ui_noteframe.message(this.state.screen, msg, timeout)
  }

  error(msg: string, timeout = 2500) {
    return ui_noteframe.error(this.state.screen, msg, timeout)
  }

  warning(msg: string, timeout = 2500) {
    return ui_noteframe.warning(this.state.screen, msg, timeout)
  }

  progressBar(msg: string, percent: number, color: string, timeout = 1000) {
    return ui_noteframe.progbarNote(this.state.screen, msg, percent, color, timeout)
  }
}

export class ToolContext extends ContextExtraAPI {
  constructor(appstate: AppState) {
    super(appstate)
  }

  reset() {
    // do nothing
    console.warn('ctx.reset called')
  }

  get messagebus() {
    return bus
  }

  messagebus_save() {
    return undefined
  }

  messagebus_load() {
    return bus
  }

  get settings() {
    return this.state.settings
  }

  settings_save() {
    return undefined //do nothing
  }

  settings_load(ctx: this, data: any) {
    return ctx.state.settings
  }

  get timeStart() {
    return this.scene ? this.scene.timeStart : 0
  }

  get timeEnd() {
    return this.scene ? this.scene.timeEnd : 0
  }

  get gl() {
    return window._gl
  }

  gl_save() {
    return undefined
  }

  gl_load(ctx: this, data: any) {
    //do nothing
  }

  validate() {
    return true
  }

  get toolDefaults() {
    return SavedToolDefaults.accessors
  }

  toolDefaults_save() {
    return SavedToolDefaults.accessors
  }

  toolDefaults_load() {
    return SavedToolDefaults.accessors
  }

  get propCache() {
    //used by datapath api
    return SavedToolDefaults
  }

  propCache_save() {
    return SavedToolDefaults
  }

  propCache_load(ctx: this, data: any) {
    return SavedToolDefaults
  }

  //used by UI code
  //refers to last executed *ToolOp*, don't confused with tool *modes*
  get last_tool() {
    return this.state.toolstack.head
  }

  copy() {
    return new ToolContext(this.state)
  }

  get material() {
    const ob = this.object

    if (ob) {
      if (ob.data instanceof Mesh && ob.data.materials.length > 0) {
        return ob.data.materials[0]
      }
    }
  }

  get playing() {
    return this.state.playing
  }

  get graph() {
    /** execution graph */
    return this.state.datalib.graph
  }

  get toolmode() {
    const scene = this.scene

    return scene !== undefined ? scene.toolmode : undefined
  }

  get screen() {
    return this.state.screen
  }
  get toolstack() {
    return this.state.toolstack
  }

  get api() {
    return this.state.api
  }

  get datalib() {
    return this.state.datalib
  }

  toolmode_save() {
    if (this.scene === undefined) return 0
    return this.scene.toolmode_i
  }
  toolmode_load(ctx: this, data: any) {
    return ctx.scene?.toolmode_map[data]
  }

  get scene(): Scene {
    const ret = this.datalib.scene.active

    if (ret === undefined && this.datalib.scene.length > 0) {
      console.warn('Something happened to active scene; fixing...')
      this.datalib.scene.active = this.datalib.scene[0]
    }

    return this.datalib.scene.active!
  }

  // get strandset object, for UX purposes
  // we don't just check active object
  get strandset_object() {
    const ob = this.object

    if (this.scene === undefined) {
      return undefined
    }

    if (ob && ob.data instanceof StrandSet) {
      return ob
    }

    for (const ob of this.scene.objects.selected.editable) {
      if (ob.data instanceof StrandSet) {
        return ob
      }
    }
  }

  get strandset() {
    const ob = this.strandset_object

    return ob ? ob.data : undefined
  }

  get object() {
    return this.scene ? this.scene.objects.active : undefined
  }

  get tetmesh() {
    const ob = this.object
    if (ob !== undefined && ob.data instanceof TetMesh) {
      return ob.data
    }
  }

  get smesh() {
    const ob = this.object
    if (ob !== undefined && ob.data instanceof SMesh) {
      return ob.data
    }
  }

  get mesh() {
    const ob = this.object
    if (ob !== undefined && ob.data instanceof Mesh) {
      return ob.data
    }
  }

  get light() {
    const ob = this.object

    if (ob !== undefined) {
      return ob.data instanceof Light ? ob.data : undefined
    }
  }

  get selectedObjects() {
    if (this.scene === undefined) return []

    return this.scene.objects.selected.editable
  }

  /* unlike selectedMeshObjects, this returns all light objects
   * even if they share .data Light instances*/
  get selectedLightObjects() {
    const this2 = this

    if (this.scene === undefined) {
      return []
    }

    return (function* () {
      for (const ob of this2.scene?.objects ?? []) {
        if (ob.data.type instanceof Light) {
          yield ob.data
        }
      }
    })()
  }

  /**returns selected mesh objects,
   ignoring objects that use the same mesh
   instance (only one will get yielded in that case)
   */
  get selectedMeshObjects(): Iterable<SceneObject> {
    const this2 = this
    return (function* () {
      const visit = new Set<unknown>()

      for (const ob of this2.selectedObjects) {
        let bad = ob.data === undefined
        bad = bad || !(ob.data instanceof Mesh)
        bad = bad || visit.has(ob.data)

        if (bad) {
          continue
        }

        yield ob
      }
    })()
  }

  get selectMask() {
    const scene = (this.state.datalib as AppLibrary).scene.active
    if (!scene) {
      return 0
    }
    return scene.selectMask
  }

  set selectMask(val) {
    const scene = (this.state.datalib as AppLibrary).scene.active
    if (!scene) {
      return
    }
    scene.selectMask = val
  }
}

export class ViewContext extends ToolContext {
  constructor(state: AppState) {
    super(state)
  }

  validate() {
    return true
  }

  get camera() {
    return this.view3d.camera
  }

  get activeTexture() {
    const editor = this.editors.imageEditor

    if (!editor) {
      return undefined
    }

    const uve = editor.uvEditor
    if (!uve.imageUser.image || !uve.imageUser.image.ready) {
      if (uve.imageUser.image) {
        uve.imageUser.image.update()
      }

      return undefined
    }

    return uve.imageUser.image
  }

  activeTexture_save() {
    const block = this.activeTexture

    return block ? block.lib_id : -1
  }

  activeTexture_load(ctx: this, data: number) {
    return ctx.state.datalib.get(data)
  }

  get modalFlag() {
    return this.state.modalFlag
  }

  setModalFlag(f: number) {
    this.state.modalFlag |= f
  }

  clearModalFlag(f: number) {
    this.state.modalFlag &= ~f
  }

  copy() {
    return new ViewContext(this.state)
  }

  get view3d(): View3D {
    // TODO: remove casting after TS-ification
    return getContextArea<View3D>(View3D)
  }

  get propsbar() {
    // TODO: remove casting after TS-ification
    return getContextArea<PropsEditor>(PropsEditor)
  }

  get menubar() {
    // TODO: remove casting after TS-ification
    return getContextArea<MenuBarEditor>(MenuBarEditor)
  }

  get resbrowser() {
    // TODO: remove casting after TS-ification
    return getContextArea<ResourceBrowser>(ResourceBrowser)
  }

  get debugEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea<DebugEditor>(DebugEditor)
  }

  get gl() {
    return this.view3d.gl
  }

  get nodeEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea<NodeEditor>(NodeEditor)
  }

  get shaderEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea<MaterialEditor>(MaterialEditor)
  }

  get nodeViewer() {
    // TODO: remove casting after TS-ification
    return getContextArea<NodeViewer>(NodeViewer)
  }

  get editors() {
    return editorAccessor
  }

  editors_save() {
    const editors = this.editors as unknown as Record<string, this>
    const ret = {} as Record<string, this>

    for (const k in editors._namemap) {
      ret[k] = editors[k]
    }

    return ret
  }
  editors_load(ctx: this, data: any) {
    return data
  }

  get area() {
    return this.editor
  }

  get editor() {
    return Editor.getActiveArea()
  }
}

Context.register(ViewContext)

class KeyPassThruProp<K extends string | number | symbol> {
  key: K

  constructor(key: K) {
    this.key = key
  }
}
