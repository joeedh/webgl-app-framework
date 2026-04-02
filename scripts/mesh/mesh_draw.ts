import {Number3, Number4, Vector3, Vector4} from '../util/vectormath.js'
import * as util from '../util/util.js'

import {MeshDrawFlags, MeshFeatures, MeshFlags, MeshTypes, RecalcFlags} from './mesh_base'
import {Colors, SceneObject} from '../sceneobject/sceneobject'
import {ChunkedSimpleMesh, LayerTypes, PrimitiveTypes, SimpleMesh} from '../core/simplemesh'
import {NormalLayerElem, UVLayerElem} from './mesh_customdata'
import {SelMask} from '../editors/view3d/selectmode'
import {GridBase} from './mesh_grids'
import {getFaceSetColor, getFaceSetsAttr} from './mesh_facesets'
import type {IUniformsBlock, ShaderProgram} from '../core/webgl'
import type {AttrRef, ColorLayerElem, ElementList, FaceSetElem, Mesh} from './mesh'
import {ViewContext} from '../core/context.js'
import type {View3D} from '../editors/all.js'

export function genRenderMesh(
  gl: WebGL2RenderingContext | undefined,
  mesh: Mesh,
  /** @unused */
  uniforms: IUniformsBlock,
  combinedWireframe = false
) {
  let recalc = 0

  const times = [] as string[]
  let start = util.time_ms()

  function pushtime(tag: string) {
    const t = util.time_ms() - start
    let s = (t / 1000.0).toFixed(3) + 's'
    s = tag + ':' + s

    start = util.time_ms()
    times.push(s)
  }

  pushtime('start')

  if (mesh.recalc & RecalcFlags.ELEMENTS) {
    recalc = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE
  } else {
    recalc = MeshTypes.FACE
  }

  const lineuv1 = [0, 0]
  const lineuv2 = [1, 1]

  mesh.recalc &= ~RecalcFlags.ELEMENTS

  //let selcolor = uniforms.select_color || Colors[1];
  const selcolor = Colors[1]
  const unselcolor = new Vector4(Colors[0]).mulScalar(0.5)

  function facecolor(c: Vector4 | number[]) {
    c = new Vector4(c)

    //desaturate a bit
    for (let i = 0; i < c.length; i++) {
      c[i as Number4] = Math.pow(c[i], 0.5)
    }

    return c
  }

  const face_selcolor = facecolor(selcolor)
  const face_unselcolor = facecolor(unselcolor)

  const getmesh = (key: string) => {
    let layerflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.ID

    //LayerTypes.NORMAL | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR;

    if (key === 'faces') {
      layerflag |= LayerTypes.UV | LayerTypes.NORMAL
    } else if (key === 'edges') {
      layerflag |= LayerTypes.UV
    }

    if (!(key in mesh._fancyMeshes)) {
      mesh._fancyMeshes[key] = new ChunkedSimpleMesh(layerflag)
    }

    return mesh._fancyMeshes[key]
  }

  const trilen = mesh._ltris === undefined ? mesh.faces.length : mesh._ltris.length
  const updatekey = '' + trilen + ':' + mesh.verts.length + ':' + mesh.edges.length

  if (updatekey !== mesh._last_elem_update_key) {
    //console.log("full element draw regen", updatekey);

    recalc = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE

    for (const v of mesh.verts) {
      v.flag |= MeshFlags.UPDATE
    }
    for (const e of mesh.edges) {
      e.flag |= MeshFlags.UPDATE
    }
    for (const f of mesh.faces) {
      f.flag |= MeshFlags.UPDATE
    }

    mesh._last_elem_update_key = updatekey
    for (const k in mesh._fancyMeshes) {
      mesh._fancyMeshes[k].destroy(gl)
    }

    mesh._fancyMeshes = {}
  }

  const cd_fset = getFaceSetsAttr(mesh, false) as AttrRef<FaceSetElem>
  const ecolors = {} as {[k: number]: Vector4}

  ecolors[0] = new Vector4([0, 0, 0, 1])
  ecolors[MeshFlags.SELECT] = selcolor
  ecolors[MeshFlags.SEAM] = new Vector4([0, 1.0, 1.0, 1.0])

  const clr = new Vector4(selcolor).interp(ecolors[MeshFlags.SEAM], 0.5)
  ecolors[MeshFlags.SELECT | MeshFlags.SEAM] = clr

  for (let k in ecolors) {
    let clr = ecolors[k as unknown as keyof typeof ecolors]
    const n = parseInt('' + k)

    clr = new Vector4(clr)
    if (!n) {
      clr[2] = 0.5
    } else {
      clr.mulScalar(0.75)
      clr[3] = 1.0
    }

    ecolors[n | MeshFlags.DRAW_DEBUG] = clr
    ecolors[n | MeshFlags.SINGULARITY] = clr
  }

  for (let k of Object.keys(ecolors)) {
    let clr = ecolors[k as unknown as keyof typeof ecolors]
    const n = parseInt(k)

    clr = new Vector4(clr)
    if (!n) {
      clr[0] = 0.75
    } else {
      clr[1] *= 0.5
      clr[2] *= 0.5
      clr[0] += (1.0 - clr[0]) * 0.5
    }

    ecolors[n | MeshFlags.DRAW_DEBUG2] = clr
    ecolors[n | MeshFlags.SINGULARITY] = clr
  }

  pushtime('start2')

  const tempcolor = new Vector4()
  const tempcolor2 = new Vector4()
  const tempcolor3 = new Vector4()

  const axes = [-1]
  for (let i = 0; i < 3; i++) {
    if (mesh.symFlag & (1 << i)) {
      axes.push(i)
    }
  }

  let sm: ChunkedSimpleMesh | SimpleMesh
  const meshes = mesh._fancyMeshes
  const white = [1, 1, 1, 1]
  const black = [0, 0, 0, 1]

  if (recalc & MeshTypes.VERTEX) {
    mesh.updateMirrorTags()

    let tot = 0

    let sm2 = getmesh('verts') as ChunkedSimpleMesh
    sm = sm2
    sm2.primflag = PrimitiveTypes.POINTS

    for (const v of mesh.verts) {
      if (v.flag & MeshFlags.HIDE || !(v.flag & MeshFlags.UPDATE)) {
        continue
      }

      const p = sm2.point(v.eid, v.co)

      const colormask =
        v.flag & (MeshFlags.SELECT | MeshFlags.SINGULARITY | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2)
      const color = ecolors[colormask]

      for (let i = 0; i < v.edges.length; i++) {
        const e = v.edges[i]
        e.flag |= MeshFlags.UPDATE
      }

      tot++
      p.ids(v.eid)
      p.colors(color)
    }

    pushtime('vertex')

    sm2 = getmesh('handles') as ChunkedSimpleMesh
    sm2.primflag = PrimitiveTypes.POINTS

    for (const h of mesh.handles) {
      if (!h.visible || !(h.flag & MeshFlags.UPDATE)) {
        continue
      }
      const p = sm2.point(h.eid, h.co)

      //let color = h.flag & MeshFlags.SELECT ? selcolor : black;
      const colormask =
        h.flag & (MeshFlags.SELECT | MeshFlags.SINGULARITY | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2)
      const color = ecolors[colormask]

      p.ids(h.eid)
      p.colors(color)
    }

    pushtime('handles')
  }

  if (recalc & MeshTypes.EDGE) {
    if (mesh.features & MeshFeatures.EDGE_CURVES_ONLY) {
      if (meshes.edges) {
        meshes.edges.destroy(gl)
      }

      //XXX
      const view3d = (_appstate.ctx as unknown as ViewContext).view3d

      for (const e of mesh.edges) {
        if (e.flag & MeshFlags.UPDATE) {
          e.updateLength()
        }
      }

      meshes.edges = mesh.genRender_curves(
        gl,
        false,
        view3d,
        LayerTypes.LOC | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR
      )
      meshes.edges.primflag = PrimitiveTypes.LINES

      pushtime('curves')
    } else {
      sm = getmesh('edges')
      sm.primflag = PrimitiveTypes.LINES

      const smoothline = mesh.edges.length < 100000

      if (smoothline) {
        sm.primflag |= PrimitiveTypes.ADVANCED_LINES
      }

      for (const e of mesh.edges) {
        let update = !!(e.v1.flag & MeshFlags.UPDATE)
        update = update || !!(e.v2.flag & MeshFlags.UPDATE)
        update = update || !!(e.flag & MeshFlags.UPDATE)
        update = update && !(e.flag & MeshFlags.HIDE)

        if (!update) {
          continue
        }

        e.updateLength()

        let l = e.l
        if (l) {
          let _i = 0

          do {
            l.f.flag |= MeshFlags.UPDATE
            l = l.radial_next
          } while (l !== e.l && _i++ < 10)
        }

        const line = smoothline
          ? (sm as ChunkedSimpleMesh).smoothline(e.eid, e.v1.co, e.v2.co)
          : (sm as ChunkedSimpleMesh).line(e.eid, e.v1.co, e.v2.co)

        const mask = e.flag & (MeshFlags.SELECT | MeshFlags.SEAM | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2)

        const color = ecolors[mask]

        line.colors(color, color)

        line.ids(e.eid, e.eid)
        line.uvs(lineuv1, lineuv2)
      }
    }

    pushtime('edges')
  }

  const cd_grid = GridBase.meshGridRef(mesh)
  const have_grids = cd_grid.i >= 0

  if (have_grids && recalc & MeshTypes.FACE) {
    sm = getmesh('faces')
    sm.primflag = PrimitiveTypes.TRIS

    for (const l of mesh.loops) {
      const grid = l.customData.get(cd_grid)

      grid.makeDrawTris(mesh, sm as SimpleMesh, l, cd_grid)
    }

    pushtime('grids')
  } else if (!have_grids && recalc & MeshTypes.FACE) {
    let useLoopNormals = !!(mesh.drawflag & MeshDrawFlags.USE_LOOP_NORMALS)
    useLoopNormals = useLoopNormals && mesh.loops.customData.hasLayer(NormalLayerElem)

    //const cd_nor = useLoopNormals ? mesh.loops.customData.getLayerIndex(NormalLayerElem) : -1
    const cd_nor = useLoopNormals ? mesh.loops.customData.getLayerRef(NormalLayerElem) : undefined

    const haveUVs = mesh.loops.customData.hasLayer(UVLayerElem)
    const cd_uvs = haveUVs ? mesh.loops.customData.getLayerRef(UVLayerElem) : undefined

    const cd_color = mesh.verts.customData.getLayerRef('color') as AttrRef<ColorLayerElem>
    const haveColors = cd_color.i >= 0

    const sm2 = getmesh('faces') as ChunkedSimpleMesh
    sm = sm2
    sm2.primflag = PrimitiveTypes.TRIS

    let ltris = mesh._ltris
    ltris = ltris === undefined ? [] : ltris

    const p1 = new Vector3()
    const p2 = new Vector3()
    const p3 = new Vector3()

    for (let i = 0; i < ltris.length; i += 3) {
      const v1 = ltris[i].v
      const v2 = ltris[i + 1].v
      const v3 = ltris[i + 2].v
      const f = ltris[i].f

      if (f.flag & MeshFlags.HIDE || !(f.flag & MeshFlags.UPDATE)) {
        continue
      }

      for (const axis of axes) {
        let tri

        if (axis === -1) {
          tri = sm2.tri(i, v1.co, v2.co, v3.co)
        } else {
          p1.load(v1)
          p2.load(v2)
          p3.load(v3)

          p1[axis as Number3] = -p1[axis]
          p2[axis as Number3] = -p2[axis]
          p3[axis as Number3] = -p3[axis]

          tri = sm2.tri(ltris.length + i * 3 + axis, p1, p2, p3)
        }
        tri.ids(f.eid, f.eid, f.eid)

        if (f.flag & MeshFlags.SELECT) {
          tempcolor.load(face_selcolor)
        } else {
          tempcolor.load(face_unselcolor)
        }

        if (cd_fset.i >= 0) {
          const fset = Math.abs(ltris[i].f.customData.get(cd_fset).value)

          const color = getFaceSetColor(fset)
          tempcolor.interp(color, 0.5)
        }

        if (cd_color.i >= 0) {
          const c1 = v1.customData.get(cd_color).color
          const c2 = v2.customData.get(cd_color).color
          const c3 = v3.customData.get(cd_color).color

          tempcolor2.load(c2).mul(tempcolor)
          tempcolor3.load(c3).mul(tempcolor)
          tempcolor.mul(c1)

          tri.colors(tempcolor, tempcolor2, tempcolor3)
        } else {
          tri.colors(tempcolor, tempcolor, tempcolor)
        }

        if (cd_nor !== undefined) {
          tri.normals(
            ltris[i].customData.get(cd_nor).no,
            ltris[i + 1].customData.get(cd_nor).no,
            ltris[i + 2].customData.get(cd_nor).no
          )
        } else if (f.flag & MeshFlags.SMOOTH_DRAW) {
          tri.normals(ltris[i].v.no, ltris[i + 1].v.no, ltris[i + 2].v.no)
        } else {
          tri.normals(f.no, f.no, f.no)
        }

        if (cd_uvs !== undefined) {
          tri.uvs(
            ltris[i].customData.get(cd_uvs).uv,
            ltris[i + 1].customData.get(cd_uvs).uv,
            ltris[i + 2].customData.get(cd_uvs).uv
          )
        }
      }
    }

    if (combinedWireframe) {
      //simplemesh_shapes.js uses this code path
      for (const e of mesh.edges) {
        if (e.flag & MeshFlags.HIDE) {
          continue
        }

        const line = sm2.line(e.eid, e.v1.co, e.v2.co)

        //line.ids(e.eid+1, e.eid+1);
        line.colors(white, white)

        if (haveUVs) {
          line.uvs(lineuv1, lineuv2)
        }

        line.normals(e.v1.no, e.v2.no)
      }
    }
    pushtime('faces')
  }

  for (const k in mesh._fancyMeshes) {
    const sm = mesh._fancyMeshes[k]
  }

  mesh.clearUpdateFlags(recalc)
  pushtime('final')

  /*
  let buf = 'genRenderMesh times:\n';
  for (let time of times) {
    buf += '  ' + time + '\n';
  }

  console.log(buf);
   */
}

export function drawMeshElements(
  mesh: Mesh,
  view3d: View3D,
  gl: WebGL2RenderingContext,
  selmask: number,
  uniforms: IUniformsBlock,
  program: ShaderProgram,
  object: SceneObject,
  drawTransFaces = false
) {
  uniforms = uniforms !== undefined ? Object.assign({}, uniforms) : {}

  if (!uniforms.active_color) {
    uniforms.active_color = [1.0, 0.8, 0.2, 1.0]
  }
  if (!uniforms.highlight_color) {
    uniforms.highlight_color = [1.0, 0.5, 0.25, 1.0]
  }
  if (!uniforms.select_color) {
    uniforms.select_color = [1.0, 0.7, 0.5, 1.0]
  }

  if (mesh.recalc & RecalcFlags.TESSELATE) {
    mesh.tessellate()
  }

  if (mesh.recalc & RecalcFlags.ELEMENTS) {
    //console.log("_genRenderElements");
    mesh._genRenderElements(gl, uniforms)
  }

  uniforms.alpha = uniforms.alpha === undefined ? 1.0 : uniforms.alpha

  const meshes = mesh._fancyMeshes

  uniforms.pointSize = uniforms.pointSize === undefined ? 10 : uniforms.pointSize
  uniforms.polygonOffset = uniforms.polygonOffset === undefined ? 0.5 : uniforms.polygonOffset

  const draw_list = (list: ElementList<any>, key: string) => {
    uniforms.active_id = list.active !== undefined ? list.active.eid : -1
    uniforms.highlight_id = list.highlight !== undefined ? list.highlight.eid : -1

    if (!meshes[key]) {
      console.warn('missing mesh element draw data', key)
      mesh.regenElementsDraw()
      return
    }

    meshes[key].draw(gl, uniforms, program)
  }

  if (selmask & SelMask.FACE) {
    const alpha = uniforms.alpha

    if (drawTransFaces) {
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      uniforms.alpha = 0.25

      //gl.depthMask(false);
      //gl.disable(gl.DEPTH_TEST);
    }

    if (selmask & SelMask.EDGE) {
      uniforms.polygonOffset *= 0.5
      const alpha = uniforms.alpha
      uniforms.alpha = 1.0

      draw_list(mesh.edges, 'edges')
      uniforms.alpha = alpha
    }

    uniforms.polygonOffset *= 0.25
    draw_list(mesh.faces, 'faces')

    if (drawTransFaces) {
      /*
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(true);

      gl.enable(gl.BLEND);
      draw_list(mesh.faces, "faces");

      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
       */
      gl.disable(gl.BLEND)
    }
  } else if (selmask & SelMask.EDGE) {
    draw_list(mesh.edges, 'edges')
  }

  if (selmask & SelMask.VERTEX) {
    draw_list(mesh.verts, 'verts')
  }
  if (selmask & SelMask.HANDLE) {
    draw_list(mesh.handles, 'handles')
  }
}
