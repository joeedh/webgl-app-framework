import type {DataBlock, BlockLoader, BlockLoaderAddUser} from '../core/lib_api.js'
import type {StructReader} from '../path.ux/scripts/util/nstructjs.js'
import {Node, NodeSocketType, SocketFlags, INodeSocketSet} from '../core/graph.js'
import {nstructjs, DataAPI, DataStruct} from '../path.ux/scripts/pathux.js'

import {Vec2Socket, Vec3Socket, RGBASocket, FloatSocket} from '../core/graphsockets.js'
import {UIBase} from '../path.ux/scripts/core/ui_base.js'
import {Container} from '../path.ux/scripts/core/ui.js'
import {Vector3} from '../util/vectormath.js'
import {AbstractGraphClass} from '../core/graph_class.js'
import {ImageUser} from '../image/image.js'
import type {ImageUserWidget} from '../editors/editor_base.js'
import type {RenderLight} from '../renderengine/renderengine_realtime.js'
import type {WgslShaderGenerator} from './shader_nodes_wgsl.js'
import {LightGenWgsl, DiffuseBRDFWgsl} from './shader_lib_wgsl.js'

export {ClosureGLSL, PointLightCode} from './shader_lib.js'

export type IRenderLights = Record<string, RenderLight>

export let ShaderNodeTypes: Array<typeof ShaderNode> = []

export class ShaderNetworkClass extends AbstractGraphClass {
  declare static NodeTypes: Array<typeof ShaderNode>

  static graphdef() {
    return {
      typeName  : 'shader',
      uiName    : 'Shader Network',
      graph_flag: 0,
    }
  }
}

ShaderNetworkClass.NodeTypes = ShaderNodeTypes

AbstractGraphClass.registerClass(ShaderNetworkClass)

export class Closure {
  static STRUCT: string
  emission: Vector3
  light: Vector3
  scatter: Vector3
  normal: Vector3
  roughness: number
  alpha: number

  constructor() {
    this.emission = new Vector3()
    this.light = new Vector3([1, 0.75, 0.5])
    this.scatter = new Vector3()
    this.normal = new Vector3()
    this.roughness = 0.1
    this.alpha = 1.0
  }

  load(b: Closure): this {
    this.emission.load(b.emission)
    this.light.load(b.light)
    this.scatter.load(b.scatter)
    this.normal = new Vector3()
    this.roughness = b.roughness
    this.alpha = b.alpha

    return this
  }

  copy() {
    return new Closure().load(this)
  }
}

Closure.STRUCT = `
shader.Closure {
  emission   : vec3;
  light      : vec3;
  scatter    : vec3;
  normal     : vec3;
  roughness  : float;
  alpha      : float;
}
`
nstructjs.register(Closure)

export class ClosureSocket extends NodeSocketType<Closure> {
  data: Closure

  constructor() {
    super()

    this.data = new Closure()
  }

  static nodedef() {
    return {
      name  : 'closure',
      uiname: 'Surface',
      color : [0.59, 0.78, 1.0, 1.0],
      flag  : 0,
    }
  }

  copyValue(): Closure {
    return this.data.copy()
  }

  getValue(): Closure {
    return this.data
  }

  copyTo(b: this): void {
    super.copyTo(b)
  }

  copy(): this {
    let ret = new ClosureSocket()
    this.copyTo(ret as this)

    ret.data.load(this.data)
    return ret as this
  }

  setValue(b: Closure): void {
    this.data.load(b)
  }
}

ClosureSocket.STRUCT =
  nstructjs.inherit(ClosureSocket, NodeSocketType, 'shader.ClosureSocket') +
  `
  data : shader.Closure;
}
`
nstructjs.register(ClosureSocket)
NodeSocketType.register(ClosureSocket)

/**
 * Always-present coordinate-space varyings a node can fall back to when an
 * input socket is unconnected. WebGL-era attribute slots (NORMAL/UV/TANGENT/ID)
 * are gone — geometry attributes are now requested by name through the
 * `AttributeNode` and supplied as dynamic vertex buffers by the renderer.
 */
export const ShaderContext = {
  GLOBALCO: 1,
  LOCALCO : 2,
  SCREENCO: 4,
  COLOR   : 32,
}

const _warnedNoEmitter = new Set<string>()

export class ShaderNode<
  InputSet extends INodeSocketSet = INodeSocketSet,
  OutputSet extends INodeSocketSet = INodeSocketSet,
> extends Node<InputSet, OutputSet, unknown> {
  constructor() {
    super()
  }

  static graphDefineAPI(api: DataAPI, nodeStruct: DataStruct) {
    super.graphDefineAPI(api, nodeStruct)
  }

  /**
   * Emit this node's WGSL into `gen.buf`. The base implementation writes
   * type-appropriate zero/default values for every output socket (used by
   * nodes that have no bespoke emission yet), warning once per class.
   * Subclasses override with their real codegen.
   */
  genWgsl(gen: WgslShaderGenerator): void {
    const name = this.constructor?.name ?? '<unknown>'
    if (!_warnedNoEmitter.has(name)) {
      _warnedNoEmitter.add(name)
      console.warn(`ShaderNode: no genWgsl override for ${name} — emitting defaults`)
    }
    for (const k in this.outputs) {
      const sock = this.outputs[k]
      const t = gen.getType(sock)
      const n = gen.getSocketName(sock)
      if (t === 'f32') gen.out(`${n} = 0.0;\n`)
      else if (t === 'vec2f') gen.out(`${n} = vec2f(0.0, 0.0);\n`)
      else if (t === 'vec3f') gen.out(`${n} = vec3f(0.0, 0.0, 0.0);\n`)
      else if (t === 'vec4f') gen.out(`${n} = vec4f(0.0, 0.0, 0.0, 1.0);\n`)
      else if (t === 'Closure') {
        gen.out(`${n}.diffuse = vec3f(0.0); ${n}.light = vec3f(0.0); `)
        gen.out(`${n}.emission = vec3f(0.0); ${n}.scatter = vec3f(0.0); ${n}.alpha = 1.0;\n`)
      }
    }
  }

  buildUI(_container: Container): void {}
}

ShaderNode.STRUCT =
  nstructjs.inherit(ShaderNode, Node, 'shader.ShaderNode') +
  `
}
`
nstructjs.register(ShaderNode)

export class OutputNode<InputSet extends INodeSocketSet = {}, OutputSet extends INodeSocketSet = {}> //
  extends ShaderNode<InputSet & {surface: ClosureSocket}, OutputSet>
{
  constructor() {
    super()
  }

  static nodedef() {
    return {
      category: 'Outputs',
      uiname  : 'Output',
      name    : 'output',
      inputs: {
        surface: new ClosureSocket(),
      },
      outputs : {},
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    gen.out(`_mainSurface = ${gen.getSocketValue(this.inputs.surface)};\n`)
  }
}
OutputNode.STRUCT =
  nstructjs.inherit(OutputNode, ShaderNode, 'shader.OutputNode') +
  `
}
`
nstructjs.register(OutputNode)
ShaderNetworkClass.register(OutputNode)

export const MixModes = {
  MIX     : 0,
  MULTIPLY: 1,
  DIVIDE  : 2,
  ADD     : 3,
  SUBTRACT: 4,
}

export class MixNode<InputSet extends INodeSocketSet = {}, OutputSet extends INodeSocketSet = {}> //
  extends ShaderNode<
    InputSet & {factor: FloatSocket; color1: RGBASocket; color2: RGBASocket},
    OutputSet & {color: RGBASocket}
  >
{
  mode: number

  constructor() {
    super()

    this.mode = MixModes.MIX
    this.graph_ui_size[1] = 350
  }

  static graphDefineAPI(api: DataAPI, nodeStruct: DataStruct) {
    super.graphDefineAPI(api, nodeStruct)

    nodeStruct.enum('mode', 'mode', MixModes, 'Mode')
  }

  static nodedef() {
    return {
      category: 'Color',
      uiname  : 'Mix',
      name    : 'mix',
      inputs: {
        factor: new FloatSocket(undefined, undefined, 0.5),
        color1: new RGBASocket(),
        color2: new RGBASocket(),
      },

      outputs: {
        color: new RGBASocket(undefined, SocketFlags.NO_UI_EDITING),
      },
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    let expr = 'a + (b - a)*fac'

    switch (this.mode) {
      case MixModes.MIX:
        expr = 'a + (b - a)*fac'
        break
      case MixModes.MULTIPLY:
        expr = 'a + (a*b - a)*fac'
        break
      case MixModes.DIVIDE:
        expr = 'a + (a/b - a)*fac'
        break
      case MixModes.ADD:
        expr = 'a + ((a+b) - a)*fac'
        break
      case MixModes.SUBTRACT:
        expr = 'a + ((a-b) - a)*fac'
        break
    }

    gen.out(`
      let a : vec4f = ${gen.getSocketValue(this.inputs.color1)};
      let b : vec4f = ${gen.getSocketValue(this.inputs.color2)};
      let fac : f32 = ${gen.getSocketValue(this.inputs.factor)};
      ${gen.getSocketName(this.outputs.color)} = ${expr};
    `)
  }

  buildUI(container: Container): void {
    super.buildUI(container)

    container.prop('mode')
  }

  loadSTRUCT(reader: StructReader): void {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

MixNode.STRUCT =
  nstructjs.inherit(MixNode, ShaderNode) +
  `
  mode : int;
}`
nstructjs.register(MixNode)
ShaderNetworkClass.register(MixNode)

export class ImageNode<InputSet extends INodeSocketSet = {}, OutputSet extends INodeSocketSet = {}> //
  extends ShaderNode<InputSet & {uv: Vec2Socket}, OutputSet & {color: RGBASocket}>
{
  imageUser: ImageUser

  constructor() {
    super()

    this.imageUser = new ImageUser()
    this.graph_ui_size[1] = 512
  }

  static graphDefineAPI(api: DataAPI, nodeStruct: DataStruct) {
    super.graphDefineAPI(api, nodeStruct)

    nodeStruct.struct('imageUser', 'imageUser', 'Image', api.mapStruct(ImageUser))
  }

  static nodedef() {
    return {
      category: 'Input',
      uiname  : 'Image',
      name    : 'image',
      inputs: {
        uv: new Vec2Socket(undefined, SocketFlags.NO_UI_EDITING),
      },

      outputs: {
        color: new RGBASocket(undefined, SocketFlags.NO_UI_EDITING),
      },
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    const out = gen.getSocketName(this.outputs.color)

    if (this.imageUser.image) {
      const tex = gen.getTexture(this.imageUser.image)
      gen.out(`
        let uv : vec2f = ${gen.getSocketValue(this.inputs.uv, 'input.vLocalCo.xy')};
        let _c : vec4f = textureSample(${tex}_tex, ${tex}_smp, uv);
        ${out} = vec4f(_c.rgb, 1.0);
      `)
    } else {
      gen.out(`${out} = vec4f(1.0, 1.0, 1.0, 1.0);\n`)
    }
  }

  buildUI(container: Container): void {
    super.buildUI(container)

    container.label('Image')
    let iuser = UIBase.createElement('image-user-x') as ImageUserWidget
    let path = container._joinPrefix('imageUser') ?? ''

    iuser.setAttribute('datapath', path)
    iuser.vertical = true

    container.add(iuser)
  }

  graphDataLink(ownerBlock: DataBlock, getblock: BlockLoader, getblock_addUser: BlockLoaderAddUser): void {
    super.graphDataLink(ownerBlock, getblock, getblock_addUser)

    this.imageUser.dataLink(ownerBlock, getblock, getblock_addUser)
  }

  loadSTRUCT(reader: StructReader): void {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

ImageNode.STRUCT =
  nstructjs.inherit(ImageNode, ShaderNode) +
  `
  imageUser : ImageUser;
}`
nstructjs.register(ImageNode)
ShaderNetworkClass.register(ImageNode)

export class DiffuseNode<InputSet extends INodeSocketSet = {}, OutputSet extends INodeSocketSet = {}> //
  extends ShaderNode<
    InputSet & {color: RGBASocket; roughness: FloatSocket; normal: Vec3Socket},
    OutputSet & {surface: ClosureSocket}
  >
{
  constructor() {
    super()
  }

  static nodedef() {
    return {
      category: 'Shaders',
      uiname  : 'Diffuse',
      name    : 'diffuse',
      inputs: {
        color    : new RGBASocket(undefined, undefined, [0.8, 0.8, 0.8, 1.0]),
        roughness: new FloatSocket(),
        normal   : new Vec3Socket(),
      },
      outputs: {
        surface: new ClosureSocket(),
      },
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    const brdf = DiffuseBRDFWgsl.gen('cl', 'co', 'normal', 'color')
    const lights = LightGenWgsl.generate('cl', 'co', 'normal', 'color', brdf)
    const surfName = gen.getSocketName(this.outputs.surface)

    gen.out(`
      var cl : Closure;
      cl.diffuse  = vec3f(0.0);
      cl.light    = vec3f(0.0);
      cl.emission = vec3f(0.0);
      cl.scatter  = vec3f(0.0);
      cl.alpha    = 1.0;

      let co : vec3f = input.vGlobalCo;
      let roughness : f32 = ${gen.getSocketValue(this.inputs.roughness)};
      let normal : vec3f = ${gen.getSocketValue(this.inputs.normal, 'input.vNormal')};
      let color : vec4f = ${gen.getSocketValue(this.inputs.color)};

      cl.alpha   = color.a;
      cl.diffuse = color.rgb;

      ${lights}
      ${surfName} = cl;
    `)
  }

  loadSTRUCT(reader: StructReader): void {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

DiffuseNode.STRUCT =
  nstructjs.inherit(DiffuseNode, ShaderNode, 'shader.DiffuseNode') +
  `
}
`
nstructjs.register(DiffuseNode)
ShaderNetworkClass.register(DiffuseNode)

export class GeometryNode<
  InputSet extends INodeSocketSet = {},
  OutputSet extends INodeSocketSet = {},
> extends ShaderNode<
  InputSet,
  OutputSet & {
    position: Vec3Socket
    normal: Vec3Socket
    screen: Vec3Socket
    local: Vec3Socket
  }
> {
  constructor() {
    super()
  }

  static nodedef() {
    return {
      category: 'Inputs',
      uiname  : 'Geometry',
      name    : 'geometry',
      inputs  : {},
      outputs: {
        position: new Vec3Socket(),
        normal  : new Vec3Socket(),
        screen  : new Vec3Socket(),
        local   : new Vec3Socket(),
      },
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    gen.out(`
      ${gen.getSocketName(this.outputs.position)} = input.vGlobalCo;
      ${gen.getSocketName(this.outputs.local)}    = input.vLocalCo;
      ${gen.getSocketName(this.outputs.normal)}   = input.vNormal;
      ${gen.getSocketName(this.outputs.screen)}   = vec3f(input.clipPos.xy, input.clipPos.z);
    `)
  }

  loadSTRUCT(reader: StructReader): void {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

GeometryNode.STRUCT =
  nstructjs.inherit(GeometryNode, ShaderNode, 'shader.GeometryNode') +
  `
}
`
nstructjs.register(GeometryNode)
ShaderNetworkClass.register(GeometryNode)

/**
 * Attribute categories an `AttributeNode` can request. Values match the
 * sculptcore `AttrUse` bitflags (COLOR=2, UV=4) so they pass straight through
 * to the renderer / C++ attribute resolution; `GENERIC` (0) requests by name
 * regardless of role and is read as a vec3.
 */
export const AttributeCategory = {
  GENERIC: 0,
  COLOR  : 2,
  UV     : 4,
}

/** One attribute row offered in the AttributeNode dropdown. Duck-typed against
 * `LiteMesh.attrItems` so shadernodes need not import the lite-mesh layer. */
interface IAttrItem {
  attrName: string
  use: number
  name: string
}

/**
 * Reads a single named mesh attribute and exposes it Blender-style through
 * three fixed outputs (`color`/vec4, `vector`/vec3, `fac`/float), all driven
 * from the one selected attribute by swizzle/broadcast. The attribute is
 * requested by name + category from the renderer, which supplies it as a
 * dynamic vertex buffer (default-filled when absent — never an error).
 */
export class AttributeNode<
  InputSet extends INodeSocketSet = {},
  OutputSet extends INodeSocketSet = {},
> extends ShaderNode<InputSet, OutputSet & {color: RGBASocket; vector: Vec3Socket; fac: FloatSocket}> {
  attrName: string
  category: number

  constructor() {
    super()

    this.attrName = ''
    this.category = AttributeCategory.COLOR
  }

  static graphDefineAPI(api: DataAPI, nodeStruct: DataStruct) {
    super.graphDefineAPI(api, nodeStruct)

    nodeStruct.enum('category', 'category', AttributeCategory, 'Category', 'Attribute category to list')
  }

  static nodedef() {
    return {
      category: 'Inputs',
      uiname  : 'Attribute',
      name    : 'attribute',
      inputs  : {},
      outputs: {
        color : new RGBASocket(undefined, SocketFlags.NO_UI_EDITING),
        vector: new Vec3Socket(undefined, SocketFlags.NO_UI_EDITING),
        fac   : new FloatSocket(undefined, SocketFlags.NO_UI_EDITING),
      },
    }
  }

  genWgsl(gen: WgslShaderGenerator): void {
    const colorOut = gen.getSocketName(this.outputs.color)
    const vecOut = gen.getSocketName(this.outputs.vector)
    const facOut = gen.getSocketName(this.outputs.fac)

    if (!this.attrName) {
      gen.out(`
        ${colorOut} = vec4f(0.0, 0.0, 0.0, 1.0);
        ${vecOut}   = vec3f(0.0, 0.0, 0.0);
        ${facOut}   = 0.0;
      `)
      return
    }

    const {field, wgslType} = gen.requestAttribute(this.attrName, this.category)
    const lum = 'vec3f(0.2126, 0.7152, 0.0722)'

    let asVec4: string
    let asVec3: string
    let asFac: string

    switch (wgslType) {
      case 'vec4f':
        asVec4 = field
        asVec3 = `${field}.xyz`
        asFac = `dot(${field}.rgb, ${lum})`
        break
      case 'vec2f':
        asVec4 = `vec4f(${field}, 0.0, 1.0)`
        asVec3 = `vec3f(${field}, 0.0)`
        asFac = `${field}.x`
        break
      default: // vec3f
        asVec4 = `vec4f(${field}, 1.0)`
        asVec3 = field
        asFac = `dot(${field}, ${lum})`
        break
    }

    gen.out(`
      ${colorOut} = ${asVec4};
      ${vecOut}   = ${asVec3};
      ${facOut}   = ${asFac};
    `)
  }

  buildUI(container: Container): void {
    super.buildUI(container)

    container.prop('category')

    const ctx = container.ctx as {mesh?: {attrItems?: IAttrItem[]}} | undefined
    const mesh = ctx?.mesh
    const enumDef: Record<string, string> = {}

    if (mesh && Array.isArray(mesh.attrItems)) {
      for (const item of mesh.attrItems) {
        if (this.category === AttributeCategory.GENERIC || item.use & this.category) {
          enumDef[item.name] = item.attrName
        }
      }
    }

    if (Object.keys(enumDef).length === 0) {
      enumDef['(no attributes)'] = ''
    }

    container.listenum(undefined, {
      name: 'Attribute',
      enumDef,
      defaultval: this.attrName,
      callback: (val: string | number) => {
        this.attrName = String(val)
        this.graphUpdate()
      },
    })
  }

  loadSTRUCT(reader: StructReader): void {
    reader(this)
    super.loadSTRUCT(reader)
  }
}

AttributeNode.STRUCT =
  nstructjs.inherit(AttributeNode, ShaderNode, 'shader.AttributeNode') +
  `
  attrName : string;
  category : int;
}
`
nstructjs.register(AttributeNode)
ShaderNetworkClass.register(AttributeNode)
