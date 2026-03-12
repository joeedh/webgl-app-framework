//import {ContextOverlay, Context} from "./context2.js";
import '../path.ux/scripts/util/struct.js'
import {View3D} from '../editors/view3d/view3d'
import {NodeEditor} from '../editors/node/NodeEditor.js'
import {NodeViewer} from '../editors/node/NodeEditor_debug.js'
import {Editor, editorAccessor, getContextArea} from '../editors/editor_base'
import {ResourceBrowser} from '../editors/resbrowser/resbrowser.js'
import * as util from '../util/util.js'
import {Mesh} from '../mesh/mesh.js'
import {Light} from '../light/light.js'
import {SceneObject} from '../sceneobject/sceneobject.js'
import {Scene} from '../scene/scene'
import {BlockSet, DataBlock, DataRef, Library} from './lib_api'
import {DebugEditor} from '../editors/debug/DebugEditor.js'
import * as ui_noteframe from '../path.ux/scripts/widgets/ui_noteframe.js'
import {Matrix4} from '../util/vectormath.js'
import {MenuBarEditor} from '../editors/menu/MainMenu.js'
import {Context, ContextFlags, ContextOverlay, IAreaConstructor, MakeContextType} from '../path.ux/scripts/pathux.js'
import {SavedToolDefaults, Screen, UIBase} from '../path.ux/scripts/pathux.js'
import {PropsEditor} from '../editors/properties/PropsEditor.js'
import {MaterialEditor} from '../editors/node/MaterialEditor.js'
import {AppSettings} from './settings'
import {TetMesh} from '../tet/tetgen.js'
import {StrandSet} from '../hair/strand.js'
import {SMesh} from '../smesh/smesh.js'

const passthrus = new Set<string | number | symbol>(['datalib', 'gl', 'graph', 'last_tool', 'toolstack', 'api'])

import bus from './bus'
import type {AppState} from './appstate.js'
import {Material} from './material'

type AppLibrary = Library & {material: BlockSet<Material>; scene: BlockSet<Scene>}

export class BaseOverlay extends ContextOverlay<AppState> {
  constructor(appstate: AppState) {
    super(appstate)
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
    return new BaseOverlay(this.state)
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

  get toolstack() {
    return this.state.toolstack
  }

  get api() {
    return this.state.api
  }

  get datalib(): AppLibrary {
    return this.state.datalib
  }

  toolmode_save() {
    if (this.scene === undefined) return 0
    return this.scene.toolmode_i
  }
  toolmode_load(ctx: this, data: any) {
    return ctx.scene.toolmode_map[data]
  }

  get scene(): Scene {
    const ret = this.datalib.scene.active

    if (ret === undefined && this.datalib.scene.length > 0) {
      console.warn('Something happened to active scene; fixing...')
      this.datalib.scene.active = this.datalib.scene[0]
    }

    return this.datalib.scene.active!
  }

  //get strandset object, for UX purposes
  //we don't just check active object
  get strandset_object() {
    const ob = this.object

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
      for (const ob of this2.scene.objects) {
        if (ob.data.type instanceof Light) {
          yield ob.data
        }
      }
    })()
  }

  static contextDefine() {
    return {
      name: 'base',
    }
  }

  /**returns selected mesh objects,
   ignoring objects that use the same mesh
   instance (only one will get yielded in that case)
   */
  get selectedMeshObjects() {
    const this2 = this
    return (function* () {
      const visit = new util.set()

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
Context.register(BaseOverlay)

export class ViewOverlay extends ContextOverlay<AppState> {
  constructor(state: AppState) {
    super(state)
  }

  validate() {
    return true
  }

  static contextDefine() {
    return {
      name: 'base',
      flag: ContextFlags.IS_VIEW,
    }
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

  activeTexture_load(ctx: this, data: any) {
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
    return new ViewOverlay(this.state)
  }

  get view3d(): View3D {
    // TODO: remove casting after TS-ification
    return getContextArea(View3D as unknown as IAreaConstructor)
  }

  get propsbar() {
    // TODO: remove casting after TS-ification
    return getContextArea(PropsEditor as unknown as IAreaConstructor)
  }

  get menubar() {
    // TODO: remove casting after TS-ification
    return getContextArea(MenuBarEditor as unknown as IAreaConstructor)
  }

  get resbrowser() {
    // TODO: remove casting after TS-ification
    return getContextArea(ResourceBrowser as unknown as IAreaConstructor)
  }

  get debugEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea(DebugEditor as unknown as IAreaConstructor)
  }

  get gl() {
    return this.view3d.gl
  }

  get nodeEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea(NodeEditor as unknown as IAreaConstructor)
  }

  get shaderEditor() {
    // TODO: remove casting after TS-ification
    return getContextArea(MaterialEditor as unknown as IAreaConstructor)
  }

  get nodeViewer() {
    // TODO: remove casting after TS-ification
    return getContextArea(NodeViewer as unknown as IAreaConstructor)
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editors_load(ctx: this, data: any) {
    return data
  }

  get area() {
    return this.editor
  }

  get editor() {
    return Editor.getActiveArea()
  }

  get screen() {
    return this.state.screen
  }
}

Context.register(ViewOverlay)

class KeyPassThruProp<K extends string | number | symbol> {
  key: K

  constructor(key: K) {
    this.key = key
  }
}

class _ToolContext<
  ExtraOverlay extends ContextOverlay<AppState> = ContextOverlay<AppState>, //
> extends Context<AppState> {
  private _state: AppState

  constructor(state: AppState) {
    super(state)
    this._state = state
    this.reset()
  }

  play() {
    this.state.playing = true
  }

  stop() {
    this.state.playing = false
  }

  set state(val: AppState) {
    console.warn('context.state was set')
    this._state = val
  }

  get state() {
    return this._state
  }

  saveProperty(key: keyof this) {
    const val = this[key]

    if (passthrus.has(key) || val instanceof UIBase || val instanceof Screen) {
      return new KeyPassThruProp<keyof this>(key)
    }

    //console.log("saveProperty called", key);
    return this.saveProperty_intern(this[key], key)
  }

  saveProperty_intern(val: any, owning_key: string | symbol | number): any {
    if (owning_key === 'editors') {
      //let editors = val;
      //return val;
    }

    if (typeof val !== 'object') return val

    if (typeof val === 'function' && !val[Symbol.iterator]) {
      return val
    }

    if (val instanceof DataBlock) {
      return DataRef.fromBlock(val)
    }

    let isiter = typeof val === 'function' || typeof val === 'object'
    isiter = isiter && val[Symbol.iterator]

    if (isiter) {
      const ret = []

      for (const item of val) {
        ret.push(this.saveProperty_intern(item, owning_key))
      }

      return ret
    }

    console.warn('Warning, unknown data in ToolContext.prototype.savePropertyIntern()', owning_key)
    return val
  }

  loadProperty(ctx: this, key: symbol | string | number, data: any) {
    return this.loadProperty_intern(ctx, data)
  }

  loadProperty_intern(ctx: this, data: KeyPassThruProp<keyof this> | DataRef | Array<any>) {
    if (typeof data !== 'object') {
      return data
    }

    if (data instanceof KeyPassThruProp) {
      return ctx[data.key]
    } else if (data instanceof DataRef) {
      return ctx.state.datalib.get(data)
    } else if (data.constructor === Array) {
      const ret = new Array(data.length)

      for (let i = 0; i < data.length; i++) {
        ret[i] = this.loadProperty_intern(ctx, data[i])
      }

      return ret
    } else {
      return data
    }
  }

  reset(have_new_file = false) {
    super.reset(have_new_file)

    this.pushOverlay(new BaseOverlay(this.state))
  }
}

export const ToolContext = _ToolContext
export type ToolContext = MakeContextType<_ToolContext, BaseOverlay>

class _ViewContext extends _ToolContext<ViewOverlay> {
  constructor(state: AppState) {
    super(state) //ToolContext constructor will call .reset() for us
  }

  reset(have_new_file = false) {
    super.reset(have_new_file)

    this.pushOverlay(new ViewOverlay(this.state))
  }
}

export const ViewContext = _ViewContext
export type ViewContext = MakeContextType<_ViewContext, ViewOverlay & BaseOverlay>
