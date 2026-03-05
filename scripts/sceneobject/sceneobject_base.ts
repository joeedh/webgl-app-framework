import {BlockLoader, BlockLoaderAddUser, DataBlock, IDataBlockConstructor} from '../core/lib_api'
import {Vector3, Matrix4, nstructjs} from '../path.ux/scripts/pathux.js'

import {StandardTools} from './stdtools.js'
import {INodeDef, Node, NodeFlags} from '../core/graph'
import {DependSocket} from '../core/graphsockets'
import {Material} from '../core/material'
import type {ToolContext} from '../core/context'
import type {SceneObject} from './sceneobject'
import type {View3D} from '../editors/view3d/view3d'
import {ShaderProgram} from '../core/webgl'

export interface IDataDefine {
  name: string
  selectMask?: number
  tools: any
}

export interface IObjectDataConstructor {
  dataDefine(): IDataDefine
}

export const ObjectDataTypes = [] as IObjectDataConstructor[]

/** TODO: make SceneObjectData a composition pattern instead of a superclass. */
export class SceneObjectData<InputSet = {}, OutputSet = {}> extends DataBlock<
  InputSet & {depend: DependSocket},
  OutputSet & {depend: DependSocket}
> {
  material?: Material = undefined
  materials: Array<Material | undefined> = []
  usesMaterial = false

  constructor() {
    super()
  }

  applyMatrix(matrix = new Matrix4()) {
    console.error('applyMatrix: Implement me!')
    return this
  }

  static dataDefine(): IDataDefine {
    return {
      name      : '',
      selectMask: 0, //valid selection modes for StandardTools, see SelMask
      tools     : StandardTools,
    }
  }

  static nodedef(): INodeDef {
    return {
      name   : '',
      inputs: Node.inherit({
        depend: new DependSocket(),
      }),
      outputs: Node.inherit({
        depend: new DependSocket(),
      }),
      flag   : Node.inherit(NodeFlags.SAVE_PROXY),
    }
  }

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
SceneObjectData {
  materials : array(e, DataRef) | DataRef.fromBlock(e); 
}`
  )

  exec(ctx: ToolContext) {
    this.outputs.depend.graphUpdate()
  }

  static getTools() {
    let def = this.dataDefine()

    if (def.tools) return def.tools

    return StandardTools
  }

  getOwningObject() {
    for (let sock of this.inputs.depend.edges) {
      if (sock.node.constructor.name === 'SceneObject' && (sock.node as unknown as any).data === this) {
        return sock.node
      }
    }

    console.warn('orphaned sceneobjectdata?')
  }

  copyAddUsers() {
    return this.copy()
  }

  getBoundingBox(): [Vector3, Vector3] {
    let d = 5

    console.warn('getBoundingBox: implement me!')

    return [new Vector3([d, d, d]), new Vector3([d, d, d])]
  }

  /**draws IDs.  no need for packing,
   they're drawn into a float framebuffer

   red should be sceneobject id + 1.
   green should be any sub-id (also + 1) provided by
   sceneobjectdata, e.g. vertices in a mesh.
   */
  drawIds(view3d: View3D, gl: WebGL2RenderingContext, selectMask: number, uniforms: any, object: SceneObject) {}

  draw(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any, program: ShaderProgram, object: SceneObject) {
    throw new Error('implement me')
  }

  drawWireframe(
    view3d: View3D,
    gl: WebGL2RenderingContext,
    uniforms: any,
    program: ShaderProgram,
    object: SceneObject
  ) {}

  drawOutline(view3d: View3D, gl: WebGL2RenderingContext, uniforms: any, program: ShaderProgram, object: SceneObject) {
    this.drawWireframe(view3d, gl, uniforms, program, object)
  }

  onContextLost(e: Event) {}

  dataLink(getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser) {
    super.dataLink(getblock, getblock_addUser)

    let mats = []

    //non-datablock materials are allowed

    for (let i = 0; i < this.materials.length; i++) {
      let mat = getblock_addUser<Material>(this.materials[i] as unknown as number, this)
      if (mat) {
        mats.push(mat)
      }
    }

    this.materials = mats
  }

  // TS doesn't like us overriding static properties from
  // parent classes with unrelated behavior
  // XXX: temporary hack, TODO: rename this to objectDataRegister
  static unregister(cls: IDataBlockConstructor<any, {}, {}>) {
    ObjectDataTypes.remove(cls)
  }

  static register(cls: IDataBlockConstructor<any, {}, {}>) {
    if (!cls.hasOwnProperty('dataDefine')) {
      throw new Error('missing .dataDefine static method')
    }

    let def = (cls as unknown as IObjectDataConstructor).dataDefine()

    if (!def.hasOwnProperty('selectMask')) {
      throw new Error('dataDefine() is missing selectMask field')
    }

    ObjectDataTypes.push(cls as unknown as IObjectDataConstructor)
  }
}
