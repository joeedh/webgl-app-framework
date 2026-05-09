import {Matrix4, Vector2, Vector3} from '../../../path.ux/scripts/pathux.js'
import {BVH} from '../../../util/bvh.js'
import {FBO} from '../../../webgl'
import {ShaderProgram} from '../../../webgl/webgl'
import {getFBODebug} from '../../debug/gldebug.js'
import type {SceneObject} from '../../../sceneobject/sceneobject'
import type {View3D} from '../view3d'

export const BrushBlurShader: {vertex: string; fragment: string; attributes: string[]; uniforms: object} = {
  vertex: `precision mediump float;

uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;
uniform vec2 size;
uniform vec2 vboxMin;
uniform vec2 vboxMax;
uniform float aspect;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute float id;

varying vec3 vNormal;
varying vec2 vUv;
varying float vId;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  vec4 n = normalMatrix * vec4(normal, 0.0);

#if 1
  vec2 scale = 1.0 / (vboxMax - vboxMin);

  p.xy /= p.w;

  p.xy = p.xy*0.5 + 0.5;

  p.xy -= vboxMin;
  p.xy *= scale;
  p.xy += vboxMin/scale;

  p.xy = p.xy*2.0 - 1.0;
  //p.x *= aspect;
  //p.y /= aspect;
  p.xy *= p.w;
#endif

  gl_Position = p;

  vUv = uv;
  vNormal = n.xyz;
}

  `,
  fragment: `
precision highp float;

uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;

uniform float aspect, near, far;
uniform vec2 size;

varying vec3 vNormal;
varying vec2 vUv;
varying float vId;

void main() {
  gl_FragColor = vec4(vUv, vId, 1.0);
  //gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
}
  `.trim(),
  attributes: ['position', 'normal', 'uv', 'id'],
  uniforms  : {},
}

export class BrushBlurFBO {
  fbo: FBO
  shader: ShaderProgram | undefined
  vboxMin: Vector2 | undefined
  vboxMax: Vector2 | undefined

  constructor(gl?: WebGL2RenderingContext) {
    this.fbo = new FBO(gl)
    this.shader = undefined
  }

  update(gl: WebGL2RenderingContext, size: number): void {
    this.fbo.update(gl, size, size)

    if (!this.shader) {
      this.compileShader(gl)
    }
  }

  compileShader(gl: WebGL2RenderingContext): void {
    this.shader = ShaderProgram.fromDef(gl, BrushBlurShader)
  }

  draw(
    gl: WebGL2RenderingContext,
    mpos: Vector3 | Vector2,
    ob: SceneObject,
    view3d: View3D,
    bvh: BVH,
    co: Vector3,
    radius: number,
    worldRadius: number
  ): void {
    const fbo = this.fbo
    const camera = view3d.activeCamera

    camera.regen_mats(view3d.glSize[0] / view3d.glSize[1])

    radius *= 1.0

    const size: number = ~~(radius * 2.0)
    this.update(gl, size)

    const dpi = window.devicePixelRatio

    mpos = new Vector2(mpos).mulScalar(dpi)
    mpos[1] = view3d.glSize[1] - mpos[1]

    const vmin: Vector2 = new Vector2(mpos)
    vmin.subScalar(radius).floor().div(view3d.glSize)

    const vmax: Vector2 = new Vector2(mpos)
    vmax.addScalar(radius).ceil().div(view3d.glSize)

    this.vboxMin = vmin
    this.vboxMax = vmax

    const uniforms = {
      projectionMatrix: camera.rendermat,
      aspect          : camera.aspect,
      near            : camera.near,
      far             : camera.far,
      objectMatrix    : ob.outputs.matrix.getValue(),
      normalMatrix    : new Matrix4(),
      size            : view3d.glSize,
      vboxMin         : vmin,
      vboxMax         : vmax,
      alpha           : 1.0,
    }

    gl.disable(gl.DITHER)
    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)

    fbo.bind(gl)

    //gl.viewport(~~vmin[0], ~~vmin[1], ~~(vmax[0]-vmin[0]), ~~(vmax[1]-vmin[1]));

    gl.depthMask(true)

    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clearDepth(1000000.0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    //gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE)
    //gl.disable(gl.DEPTH_TEST);

    let ok: boolean = false

    for (const node of bvh.nodes) {
      if (!node.drawData) {
        continue
      }

      ok = true
      //if (aabb_sphere_isect(co, worldRadius*2.0, node.min, node.max)) {
      node.drawData.draw(gl, uniforms, this.shader)
      //}
    }

    if (!ok) {
      console.error('NO DRAW DATA!')
    }

    gl.finish()
    fbo.unbind(gl)

    getFBODebug(gl).pushFBO('brush temp', fbo)
  }
}
