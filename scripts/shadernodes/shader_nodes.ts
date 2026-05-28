import type {DataBlock, DataRef, BlockLoader, BlockLoaderAddUser} from '../core/lib_api.js'
import type {StructReader} from '../path.ux/scripts/util/nstructjs.js'
import {Graph, Node, NodeSocketType, NodeFlags, SocketFlags, SocketTypes, INodeSocketSet} from '../core/graph.js'
import type {GenericNode} from '../core/graph.js'
import {nstructjs, DataAPI, DataStruct} from '../path.ux/scripts/pathux.js'

import {
  DependSocket,
  Vec2Socket,
  Vec3Socket,
  RGBASocket,
  Vec4Socket,
  Matrix4Socket,
  FloatSocket,
} from '../core/graphsockets.js'
import {UIBase} from '../path.ux/scripts/core/ui_base.js'
import {Container} from '../path.ux/scripts/core/ui.js'
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js'
import * as util from '../util/util.js'
import {AbstractGraphClass} from '../core/graph_class.js'
import {ShaderFragments, LightGen, DiffuseBRDF} from './shader_lib.js'
import {Light, LightTypes} from '../light/light.js'
import {initShader, loadShader} from '../shaders/shaders.js'
import {ShaderProgram, IUniformsBlock} from '../webgl/webgl.js'
import {ImageUser, ImageBlock} from '../image/image.js'
import type {ImageUserWidget} from '../editors/editor_base.js'
import {RenderLight, ShaderProgramCompilable} from '../renderengine/renderengine_realtime.js'

export {ClosureGLSL, PointLightCode} from './shader_lib.js'

export type IRenderLights = Record<string, RenderLight>

export interface IShaderDefCompilable {
  vertex: string
  fragment: string
  uniforms: IUniformsBlock
  attributes: string[]
  setUniforms(gl: WebGL2RenderingContext, graph: Graph<unknown>, uniforms: IUniformsBlock): void
  compile(gl: WebGL2RenderingContext): ShaderProgramCompilable
}

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

export const ShaderContext = {
  GLOBALCO: 1,
  LOCALCO : 2,
  SCREENCO: 4,
  NORMAL  : 8,
  UV      : 16,
  COLOR   : 32,
  TANGENT : 64,
  ID      : 128,
}

export class ShaderGenerator {
  _regen: boolean
  scene: unknown
  paramnames: {[key: number]: string}
  uniforms: {[key: string]: NodeSocketType}
  textures: Map<ImageBlock, number>
  buf: string
  vertex: string | undefined
  fragment: string | undefined
  graph: Graph<unknown> | undefined
  glshader: ShaderProgram | undefined

  constructor(scene: unknown) {
    this._regen = true
    this.scene = scene
    this.paramnames = {}
    this.uniforms = {}
    this.textures = new Map()

    this.buf = ''
    this.vertex = undefined

    let p = this.paramnames

    p[ShaderContext.LOCALCO] = 'vLocalCo'
    p[ShaderContext.GLOBALCO] = 'vGlobalCo'
    p[ShaderContext.NORMAL] = 'vNormal'
    p[ShaderContext.UV] = 'vuv'
    p[ShaderContext.COLOR] = 'vColor'
    p[ShaderContext.TANGENT] = 'vTangent'
    p[ShaderContext.ID] = 'vId'
  }

  update(gl: WebGL2RenderingContext, scene: unknown, graph: Graph<unknown>, engine: unknown): void {
    if (this._regen) {
      this._regen = false

      this.scene = scene
      this.graph = graph

      this.generate(graph, engine as IRenderLights)
      this.glshader = this.genShader().compile(gl)
    }
  }

  bind(gl: WebGL2RenderingContext, uniforms: IUniformsBlock): void {
    this.glshader!.bind(gl, uniforms)
  }

  getType(sock: NodeSocketType): string | undefined {
    if (sock instanceof ClosureSocket) {
      return 'Closure'
    } else if (sock instanceof FloatSocket) return 'float'
    else if (sock instanceof Vec3Socket) return 'vec3'
    else if (sock instanceof Vec4Socket) return 'vec4'
    else if (sock instanceof Vec2Socket) return 'vec2'
    else if (sock instanceof Matrix4Socket) return 'mat4'
  }

  coerce(socka: NodeSocketType, sockb: NodeSocketType): string {
    let n1 = this.getSocketName(socka),
      n2 = this.getSocketName(sockb)

    const ctorA = socka.constructor as new () => NodeSocketType
    const ctorB = sockb.constructor as new () => NodeSocketType
    if (socka instanceof ctorB || sockb instanceof ctorA) {
      return `${n1}`
    }

    // Re-cast to reset TypeScript's type narrowing after instanceof variable checks
    const sa = socka as NodeSocketType
    const sb = sockb as NodeSocketType

    if (sb instanceof FloatSocket) {
      if (sa instanceof Vec2Socket) {
        return `(length(${n1})/sqrt(2.0))`
      } else if (sa instanceof Vec3Socket) {
        return `(length(${n1})/sqrt(3.0))`
      } else if (sa instanceof Vec4Socket) {
        //should include RGBASocket
        return `(length(${n1})/sqrt(4.0))`
      } else if (sa instanceof ClosureSocket) {
        return `closure2${this.getType(sb)}(${n1})`
      }
    } else if (sb instanceof Vec2Socket) {
      if (sa instanceof FloatSocket) {
        return `vec2(${n1}, ${n1})`
      } else if (sa instanceof Vec3Socket || sa instanceof Vec4Socket) {
        return `(${n1}).xy`
      } else if (sa instanceof ClosureSocket) {
        return `closure2${this.getType(sb)}(${n1})`
      }
    } else if (sb instanceof Vec3Socket) {
      if (sa instanceof FloatSocket) {
        return `vec3(${n1}, ${n1}, ${n1})`
      } else if (sa instanceof Vec4Socket) {
        return `(${n1}).xyz`
      } else if (sa instanceof Vec2Socket) {
        return `vec3(${n1}, 0.0)`
      } else if (sa instanceof ClosureSocket) {
        return `closure2${this.getType(sb)}(${n1})`
      }
    } else if (sb instanceof Vec4Socket) {
      if (sa instanceof FloatSocket) {
        return `vec4(${n1}, ${n1}, ${n1}, 1.0)`
      } else if (sa instanceof Vec3Socket) {
        return `vec4(${n1}, 1.0)`
      } else if (sa instanceof Vec2Socket) {
        return `vec4(${n1}, 0.0, 1.0)`
      } else if (sa instanceof ClosureSocket) {
        return `closureto${this.getType(sb)}(${n1})`
      }
    } else if (sb instanceof ClosureSocket) {
      return `${this.getType(sa)}toclosure(${n1})`
    }

    console.warn('failed coercion for', sa, sb)
    return '0.0'
  }

  getParameter(_param: unknown): void {}

  getSocketName(sock: NodeSocketType): string {
    let name = sock.socketName

    name = '_' + name.trim().replace(/[ \t\n\r]/g, '_')
    name += '_' + sock.graph_id

    return name
  }

  getSocketValue(sock: NodeSocketType, default_param?: number): string {
    let name = this.getSocketName(sock)

    if (sock.edges.length > 0 && sock.socketType === SocketTypes.INPUT) {
      if (!(sock.edges[0] instanceof (sock.constructor as Function as new () => NodeSocketType))) {
        return this.coerce(sock.edges[0], sock)
      } else {
        return this.getSocketValue(sock.edges[0])
      }
    } else if (default_param !== undefined) {
      return this.paramnames[default_param]
    } else if (sock.socketType === SocketTypes.INPUT) {
      return this.getUniform(sock)
    } else {
      return this.getSocketName(sock)
    }
  }

  //returns a unique name for a uniform
  //for an interactively-editable shader parameter
  getUniform(sock: NodeSocketType, _type?: string): string {
    let name = this.getSocketName(sock)
    this.uniforms[name] = sock
    return name
  }

  out(s: string): void {
    this.buf += s
  }

  getTexture(imageblock: ImageBlock): string {
    if (!this.textures.has(imageblock)) {
      this.textures.set(imageblock, 0)
    }

    return 'sampler_' + imageblock.lib_id
  }

  generate(graph: Graph<unknown>, rlights: IRenderLights, defines = ''): this {
    this.graph = graph
    graph.sort()

    let glsl300 = true //XXX

    this.textures = new Map()

    this.vertex = `#version 300 es
#define attribute in
#define varying out
precision highp float;
precision highp samplerCubeShadow;
precision highp sampler2DShadow;
    
    ${defines}
    
    ${ShaderFragments.CLOSUREDEF}
    ${ShaderFragments.UNIFORMS}
    ${ShaderFragments.ATTRIBUTES}
    ${ShaderFragments.VARYINGS}
    
    void main() {
      vec4 p = vec4(position, 1.0);
      
      p = objectMatrix * vec4(p.xyz, 1.0);
      p = projectionMatrix * vec4(p.xyz, 1.0);
      
      gl_Position = p;

      vColor = color;
      vNormal = normal;
      ${ShaderProgram.multilayerVertexCode('uv')}
      vId = object_id;        
      
      vGlobalCo = (objectMatrix * vec4(position, 1.0)).xyz;
      vLocalCo = position;
    }
    `

    this.buf = ''

    let uvdecl = ShaderProgram.multilayerAttrDeclare('uv', 'vec2', false, glsl300)
    this.vertex = this.vertex.replace(/MULTILAYER_UV_DECLARE/, uvdecl)

    //find output node
    let output = undefined
    for (let node of graph.nodes) {
      if (node instanceof OutputNode) {
        output = node
        break
      }
    }

    if (output === undefined) {
      console.warn('no output node')

      this.fragment = `
      out vec4 fragColor;
      
      void main() {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);  
      }
      `
      return this
    }

    const visit: {[id: number]: number} = {}

    const rec = (n: GenericNode<unknown>): void => {
      if (n.graph_id in visit) {
        return
      }

      visit[n.graph_id] = 1

      for (let k in n.inputs) {
        let sock = n.inputs[k]
        for (let sock2 of sock.edges) {
          rec(sock2.node)
        }
      }
    }

    rec(output)

    //console.log(visit);

    for (let node of graph.sortlist) {
      if (!(node.graph_id in visit)) {
        continue
      }

      let buf = this.buf

      this.out('//' + (node.constructor?.name ?? 'unknown') + '\n')

      for (let k in node.outputs) {
        let sock = node.outputs[k]
        if (sock.edges.length === 0) {
          //continue;
        }

        let type = this.getType(sock)
        let name = this.getSocketName(sock)

        this.out(`${type} ${name};\n`)
      }

      this.out('{\n')
      ;(node as ShaderNode).genCode(this)
      this.out('\n}\n')
    }

    let uniforms = ShaderFragments.UNIFORMS

    for (let k in this.uniforms) {
      let sock = this.uniforms[k]
      let type = this.getType(sock)

      uniforms += `uniform ${type} ${k};\n`
    }

    uniforms += LightGen.pre()
    defines += LightGen.genDefines(rlights)

    let varyings = ShaderFragments.VARYINGS

    let texdecl = ''
    for (let image of this.textures.keys()) {
      let key = 'sampler_' + image.lib_id
      texdecl += `uniform sampler2D ${key};`
    }

    let script = `#version 300 es
precision highp float;
precision highp samplerCubeShadow;
#define varying in
#define texture2D texture

    ${defines}
    ${ShaderFragments.CLOSUREDEF}
    ${uniforms}
    ${texdecl}
    ${varyings}
    MULTILAYER_UV_DECLARE
    ${ShaderFragments.SHADERLIB}    
    
    out vec4 fragColor;
    
    void main() {
      Closure _mainSurface;
      
      _mainSurface.alpha = 1.0;
      
      ${this.buf.replace(/SHADER_SURFACE/g, '_mainSurface')}
      
      {
        vec4 color = vec4(_mainSurface.light+_mainSurface.emission, _mainSurface.alpha);  
        //gl_FragColor = color;
        //gl_FragColor = vec4(color.rgb, 1.0);
        fragColor = vec4(color.rgb, 1.0);
      }
      
      ${ShaderFragments.ALPHA_HASH.replace(/SHADER_SURFACE/g, '_mainSurface')}
      
      //gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
    `

    this.fragment = script

    uvdecl = ShaderProgram.multilayerAttrDeclare('uv', 'vec2', true, glsl300)
    this.fragment = this.fragment.replace(/MULTILAYER_UV_DECLARE/, uvdecl)

    return this
  }

  genShader(): IShaderDefCompilable {
    if (this.fragment === undefined) {
      throw new Error('must called .generate() before .genShader')
    }

    const gen = this
    const ret: IShaderDefCompilable = {
      fragment  : this.fragment,
      vertex    : this.vertex!,
      uniforms  : {},
      attributes: ['position', 'normal', 'uv', 'color', 'id'],

      setUniforms(gl: WebGL2RenderingContext, graph: Graph<unknown>, uniforms: IUniformsBlock) {
        for (let image of gen.textures.keys()) {
          image.update()

          if (!image.ready) {
            continue
          }

          let gltex = image.getGlTex(gl)
          uniforms['sampler_' + image.lib_id] = gltex
        }

        for (let node of graph.sortlist) {
          for (let k in node.inputs) {
            let sock = node.inputs[k]

            if (sock.edges.length === 0) {
              let name = gen.getSocketName(sock)
              uniforms[name] = sock.getValue()
            }
          }
        }
      },

      compile(gl: WebGL2RenderingContext): ShaderProgramCompilable {
        const program = new ShaderProgramCompilable(gl, this.vertex, this.fragment, this.attributes)
        initShader(gl, program, this)
        program.shaderdef = this
        ret.setUniforms(gl, gen.graph!, ret.uniforms)
        return program
      },
    }

    return ret
  }
}

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

  genCode(_gen: ShaderGenerator): void {}

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

  genCode(gen: ShaderGenerator): void {
    gen.out(`
      //SHADER_SURFACE.emission = vec3(hash3f(gl_FragCoord.xyz));
      SHADER_SURFACE = ${gen.getSocketValue(this.inputs.surface)};
    `)
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

  genCode(gen: ShaderGenerator): void {
    let code = ''

    switch (this.mode) {
      case MixModes.MIX:
        code = 'a + (b - a)*fac'
        break
      case MixModes.MULTIPLY:
        code = 'a + (a*b - a)*fac'
        break
      case MixModes.DIVIDE:
        code = 'a + (a/b - a)*fac'
        break
      case MixModes.ADD:
        code = 'a + ((a+b) - a)*fac'
        break
      case MixModes.SUBTRACT:
        code = 'a + ((a-b) - a)*fac'
        break
    }

    gen.out(`
      vec4 a = ${gen.getSocketValue(this.inputs.color1)};
      vec4 b = ${gen.getSocketValue(this.inputs.color2)};
      float fac = ${gen.getSocketValue(this.inputs.factor)};
      
      ${gen.getSocketName(this.outputs.color)} = ${code};        
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

  genCode(gen: ShaderGenerator): void {
    if (this.imageUser.image) {
      gen.out(`
        vec2 uv = ${gen.getSocketValue(this.inputs.uv, ShaderContext.UV)};
        vec4 c;
        
        c = texture2D(${gen.getTexture(this.imageUser.image)}, uv);
        ${gen.getSocketName(this.outputs.color)} = vec4(c.rgb, 1.0);
        
        //${gen.getSocketName(this.outputs.color)} = vec4(uv[0], uv[1], 0.0, 1.0);
        
      `)
    } else {
      gen.out(`
        ${gen.getSocketName(this.outputs.color)} = vec4(1.0, 1.0, 1.0, 1.0);
      `)
    }
  }

  buildUI(container: Container): void {
    super.buildUI(container)

    container.label('Image')
    let iuser = UIBase.createElement('image-user-x') as ImageUserWidget
    let path = container._joinPrefix('imageUser') ?? ''

    //iuser.ownerPath = path;

    console.log('PATH', path)

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

  genCode(gen: ShaderGenerator): void {
    let brdf = DiffuseBRDF.gen('cl', 'co', 'normal', 'color')
    let lights = LightGen.generate('cl', 'co', 'normal', 'color', brdf)

    gen.out(`
Closure cl;
vec3 co = vGlobalCo;
float roughness = ${gen.getSocketValue(this.inputs.roughness)};
vec3 normal = ${gen.getSocketValue(this.inputs.normal, ShaderContext.NORMAL)};
vec4 color = ${gen.getSocketValue(this.inputs.color)};

cl.alpha = color[3];
cl.diffuse = color.rgb;

${lights}
${gen.getSocketName(this.outputs.surface)} = cl;
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
    uv: Vec2Socket
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
        uv      : new Vec2Socket(),
        //tangent  : new Vec3Socket()
      },
    }
  }

  genCode(gen: ShaderGenerator): void {
    gen.out(`
      ${gen.getSocketName(this.outputs.position)} = vGlobalCo;
      ${gen.getSocketName(this.outputs.local)} = vLocalCo;
      ${gen.getSocketName(this.outputs.normal)} = vNormal;
      ${gen.getSocketName(this.outputs.uv)} = vuv;
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
