export interface WebGLUniforms {
  [k: string]: any
}

export function initDebugGL(gl: any): any

export function addFastParameterGet(gl: any): void

export function onContextLost(e: any): void

export function init_webgl(canvas: any, params?: {}): any

export function hashShader(sdef: any): string

export function getShader(gl: any, shaderdef: any): any

export const constmap: {}

export class VBO {
  constructor(gl: any, vbo: any, size?: number, bufferType?: number)

  gl: any
  vbo: any
  size: number
  bufferType: number
  ready: boolean
  lastData: any
  dead: boolean
  drawhint: any

  get(gl: any): any

  checkContextLoss(gl: any): void

  reset(gl: any): this

  destroy(gl: any): void

  uploadData(gl: any, dataF32: any, target?: number, drawhint?: any): void
}

export class RenderBuffer {
  _layers: {}

  get buffers(): Generator<any, void, unknown>

  get(gl: any, name: any, bufferType?: any): any

  reset(gl: any): void

  destroy(gl: any, name: any): void
}

export class Texture {
  static unbindAllTextures(gl: any): void

  static load(gl: any, width: any, height: any, data: any, target?: any, ...args: any[]): Texture

  static defaultParams(gl: any, tex: any, target?: any): void

  constructor(texture_slot: any, texture: any, target?: number)

  texture: any
  texture_slot: any
  target: number
  createParams: {
    target: number
  }
  createParamsList: number[]
  _params: {}

  texParameteri(gl: any, target: any, param: any, value: any): this

  getParameter(gl: any, param: any): any

  _texImage2D1(gl: any, target: any, level: any, internalformat: any, format: any, type: any, source: any): this

  _texImage2D2(
    gl: any,
    target: any,
    level: any,
    internalformat: any,
    width: any,
    height: any,
    border: any,
    format: any,
    type: any,
    source: any
  ): this

  texImage2D(...args: any[]): this

  copy(gl: any, copy_data?: boolean): Texture

  copyTexTo(gl: any, b: any): this

  destroy(gl: any): void

  load(gl: any, width: any, height: any, data: any, target?: any): this

  initEmpty(gl: any, target: any, width: any, height: any, format?: any, type?: any): this

  bind(gl: any, uniformloc: any, slot?: any): void
}

export class CubeTexture extends Texture {
  constructor(texture_slot: any, texture: any)
}

export class DrawMats {
  static STRUCT: string
  isPerspective: boolean
  cameramat: Matrix4
  persmat: Matrix4
  rendermat: Matrix4
  normalmat: Matrix4
  icameramat: Matrix4
  ipersmat: Matrix4
  irendermat: Matrix4
  inormalmat: Matrix4

  /** aspect should be sizex / sizey */
  regen_mats(aspect?: any): this

  aspect: any

  toJSON(): {
    cameramat: number[]
    persmat: number[]
    rendermat: number[]
    normalmat: number[]
    isPerspective: boolean
    icameramat: number[]
    ipersmat: number[]
    irendermat: number[]
    inormalmat: number[]
  }

  loadJSON(obj: any): this

  loadSTRUCT(reader: any): void
}

export class Camera extends DrawMats {
  fovy: number
  aspect: number
  pos: Vector3
  target: Vector3
  orbitTarget: Vector3
  up: Vector3
  near: number
  far: number

  generateUpdateHash(objectMatrix?: any): number

  load(b: any): this

  copy(): Camera

  reset(): this

  loadJSON(obj: any): this

  /** aspect should be sizex / sizey*/
  regen_mats(aspect?: number): void
}

import {Matrix4} from '../util/vectormath.js'
import {Vector3} from '../util/vectormath.js'
