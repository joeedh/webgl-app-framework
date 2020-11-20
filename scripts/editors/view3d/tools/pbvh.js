import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {BVH, BVHFlags} from "../../../util/bvh.js";
import {KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {TranslateWidget} from "../widgets/widget_tools.js";
let STRUCT = nstructjs.STRUCT;
import {Mesh} from '../../../mesh/mesh.js';
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {Shaders} from "../../../shaders/shaders.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import {ToolOp, Vec4Property, ListProperty} from "../../../path.ux/scripts/pathux.js";
import {MeshFlags} from "../../../mesh/mesh.js";
import {SimpleMesh, LayerTypes} from "../../../core/simplemesh.js";
import {splitEdgesSmart} from "../../../mesh/mesh_subdivide.js";

let _triverts = new Array(3);

export function dynTopoExec(verts, esize) {
  let edges = new Set();

  for (let v of verts) {
    for (let e of v.edges) {
      edges.add(e);
    }
  }
}

export class PaintOp extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    name : "paintop",
    toolpath : "bvh.paint",
    is_modal : true,
    inputs : {
      points : new ListProperty(Vec4Property) //fourth component is radius
    }
  }}

  on_mousemove(e) {
    let ctx = this.modal_ctx;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      return;
    }

    let view3d = ctx.view3d;

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let isect = bvh.castRay(origin, view);

    if (!isect) {
      return;
    }


    let p2 = new Vector3(isect.p).addFac(isect.tri.v1.no, 0.5);

    //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

    //console.log(isect, isect.tri);

    let vec = new Vector3(isect.tri.v1.no);
    vec.add(isect.tri.v2.no);
    vec.add(isect.tri.v3.no);
    vec.normalize();

    view.negate();
    if (vec.dot(view) < 0) {
      view.negate();
    }
    vec.add(view).normalize();

    let _tmp = new Vector3();

    let vsw = e.shiftKey ? 1.0 : 0.25;

    let vsmooth = (v) => {
      _tmp.load(v);
      let w = 1.0;

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);

        _tmp.add(v2);
        w++;
      }

      _tmp.mulScalar(1.0 / w);
      v.interp(_tmp, vsw);
    }

    let vs = new Set();

    let vadd = (v) => {
      vs.add(v);

      for (let e of v.edges) {
        vs.add(e.otherVertex(v));
      }
    }

    vadd(isect.tri.v1);
    vadd(isect.tri.v2);
    vadd(isect.tri.v3);

    vec.mulScalar(0.05);
    if (e.ctrlKey) {
      vec.mulScalar(-1.0);
    }
    if (e.shiftKey) {
      vec.mulScalar(0.0);
    }

    let radius = 75.0;
    let esize = 8.0;

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    radius /= Math.min(view3d.glSize[0], view3d.glSize[1]);
    esize /= Math.min(view3d.glSize[0], view3d.glSize[1]);

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    //matrix.invert();

    esize *= matrix.$matrix.m11;

    p3.multVecMatrix(view3d.activeCamera.rendermat);

    let w = p3[3];
    if (w <= 0) return;

    //console.log(w);

    radius *= w;
    esize *= w;

    //console.log("radius", radius);

    vs = bvh.closestVerts(isect.p, radius);
    //console.log(vs);


    let cd_node = bvh.cd_node;

    for (let v of vs) {
      let f = Math.max(1.0 - v.vectorDistance(isect.p) / radius, 0.0);
      f = f*f*(3.0 - 2.0*f);
      //f=1.0

      let node = v.customData[cd_node].node;

      if (node) {
        node.flag |= BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_NORMALS;
      }

      v.addFac(vec, f);
      v.flag |= MeshFlags.UPDATE;
    }

    let es = new Set();

    for (let v of vs) {
      for (let e of v.edges) {
        es.add(e);
      }

      if (e.shiftKey) {
        vsmooth(v);
      }
    }

    //this.doTopology(mesh, bvh, esize, vs, es);

    //mesh.recalcNormals();
    mesh.regenRender();

    bvh.update();
    window.redraw_viewport(true);
  }

  doTopology(mesh, bvh, esize, vs, es) {
    let es2 = new Set();

    let esqr = esize*esize;
    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    let max = 128;

    for (let e of es) {
      if (es2.size > max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      if (e.v1.vectorDistanceSqr(e.v2) >= esqr) {
        let l = e.l;
        let _i = 0;

        do {
          fs.add(l.f);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        es2.add(e);
      }
    }

    for (let f of fs) {
      let tris = bvh.fmap.get(f.eid);
      if (tris && tris.length > 0) {
        let node = tris[0].node;
        f.customData[cd_face_node].node = node;
        fmap.set(f, node);
      }

      bvh.removeFace(f.eid);
    }

    let {newvs, newfs} = splitEdgesSmart(mesh, es2);
    //let newvs = new Set(), newfs = fs;

    //console.log(newfs, newfs.size);

    if (newvs.size > 0 || newfs.size > 0) {
      mesh.regenTesellation();
      for (let i=0; i<2; i++) {
        let fsiter = i ? newfs : fs;

        for (let f of fsiter) {
          let l = f.lists[0].l;
          let firstl = l;
          let _i = 0;

          l = l.next;

          do {
            let v1 = firstl.v;
            let v2 = l.v;
            let v3 = l.next.v;

            let node;

            //bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
            if (i === 0) {
              node = fmap.get(f);
            } else {
              node = f.customData[cd_face_node].node;
            }

            if (node) {
              if (!node.leaf) {
                //node.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
              } else {
                let tri = node.bvh._getTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);

                node.uniqueTris.add(tri);
                node.allTris.add(tri);

                node.flag |= BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_UNIQUE_VERTS|BVHFlags.UPDATE_NORMALS;
              }
            } else {
              //bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
            }

            l = l.next;
          } while (l !== firstl.prev && _i++ < 1000);
        }
      }
    }
  }

  on_mouseup(e) {
    let ob = this.modal_ctx.object;
    let mesh = ob ? ob.data : undefined;

    this.modal_ctx.view3d.resetDrawLines();
    this.modalEnd();

    //auto-rebuild bvh if topology changed
    if (mesh instanceof Mesh) {
      mesh.getBVH(true);
    }
  }
}
ToolOp.register(PaintOp);

export class BVHToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.drawBVH = true;
    this.enableDraw = false;

    this._last_bvh_key = "";
    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  static register(cls) {
    ToolModes.push(cls);
    //WidgetTool.register(cls);
  }

  static toolModeDefine() {return {
    name        : "bvh",
    uiname      : "bvh test",
    icon        : Icons.FACE_MODE,
    flag        : 0,
    description : "Test bvh",
    selectMode  : SelMask.OBJECT|SelMask.GEOM, //if set, preferred selectmode, see SelModes
    transWidgets: []
  }}

  static buildSettings(container) {

  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    let name = this.toolModeDefine().name;

    let strip = header.strip();
    strip.prop(`scene.tools.${name}.drawBVH`);
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.bool("drawBVH", "drawBVH", "drawBVH");

    return st;
  }

  getBVH(mesh) {
    return mesh.bvh ? mesh.bvh : mesh.getBVH(false);
  }

  on_mousedown(e, x, y) {
    super.on_mousedown(e, x, y);

    if (e.button === 0 && !e.altKey) {
      this.ctx.api.execTool(this.ctx, "bvh.paint()");
      return true;
    }

    this.enableDraw ^= true;

    console.log("enableDraw", this.enableDraw);
    window.redraw_viewport();

    return false;
  }

  on_mouseup(e, x, y) {
    super.on_mouseup(e, x, y);

    this.mdown = false;

    return false;
  }

  update() {
    super.update();
  }

  destroy() {
  }

  onInactive() {
    if (!this.ctx || !this.ctx.object) {
      return;
    }
    let ctx = this.ctx;

    super.onInactive();

    let ob = ctx.object;
    if (ob.data instanceof Mesh && ob.data.bvh) {
      ob.data.bvh.destroy(ob.data);
      ob.data.bvh = undefined;
    }
  }

  on_drawend(view3d, gl) {
    if (!this.ctx || !this.ctx.scene) {
      return;
    }

    //if (!this.enableDraw) return;

    let ctx = this.ctx, scene = ctx.scene;

    let uniforms = {
      projectionMatrix : view3d.activeCamera.rendermat,
      objectMatrix : new Matrix4(),
      object_id : -1,
      size : view3d.glSize,
      near : view3d.activeCamera.near,
      far : view3d.activeCamera.far,
      aspect : view3d.activeCamera.aspect,
      polygonOffset : 0.0,
      color : [1, 0, 0, 1],
      alpha : 1.0
    };

    let program = Shaders.WidgetMeshShader;

    let drawNodeAABB = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNodeAABB(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0]+size[0]*0.5, node.min[1]+size[1]*0.5, node.min[2]+size[2]*0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);

      let f = node.id*0.1;
      uniforms.color[0] = Math.fract(f*Math.sqrt(3.0));
      uniforms.color[1] = Math.fract(f*Math.sqrt(5.0)+0.234);
      uniforms.color[2] = Math.fract(f*Math.sqrt(2.0)+0.8234);
      uniforms.color[3] = 1.0;
      //console.log(uniforms);

      //ob.data.draw(view3d, gl, uniforms, program, ob);
      Shapes.CUBE.drawLines(gl, uniforms, program);

      //console.log(matrix.toString());
    }

    for (let ob of scene.objects.selected.editable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let matrix = new Matrix4(ob.outputs.matrix.getValue());

      uniforms.object_id = ob.lib_id;

      let mesh = ob.data;
      let bvh = this.getBVH(mesh);

      //console.log("BVH", bvh.nodes.length);
      if (this.drawBVH) {
        drawNodeAABB(bvh.root, matrix);
      }
      //console.log("BVH", bvh, Shapes.CUBE);
    }
  }

  /*
  * called for all objects;  returns true
  * if an object if the toolmode drew the object
  * itself
  */
  drawObject(gl, uniforms, program, object, mesh) {
    if (!(this.ctx && this.ctx.object && mesh === this.ctx.object.data)) {
      return false;
    }

    let drawNode = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNode(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0]+size[0]*0.5, node.min[1]+size[1]*0.5, node.min[2]+size[2]*0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);
    }

    let ob = this.ctx.object;
    let bvh = mesh.getBVH(false);

    let parentoff = bvh.drawLevelOffset;

    for (let node of bvh.nodes) {
      if (!node.leaf) {
        continue;
      }

      let p = node;
      //get parent parentoff levels up

      for (let i=0; i<parentoff; i++) {
        p = p.parent ? p.parent : p;
      }

      if (node.flag & BVHFlags.UPDATE_DRAW) {
        p.flag |= BVHFlags.UPDATE_DRAW;
      }

      p.flag |= BVHFlags.TEMP_TAG;
    }

    function genNodeMesh(node) {
      let lflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV | LayerTypes.NORMAL | LayerTypes.ID;

      let sm = new SimpleMesh(lflag);
      function rec(node) {
        if (!node.leaf) {
          for (let c of node.children) {
            rec(c);
          }

          return;
        }

        let n = new Vector3();
        let id = object.lib_id;

        for (let tri of node.uniqueTris) {
          let tri2 = sm.tri(tri.v1, tri.v2, tri.v3);

          n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();

          tri2.normals(n, n, n);
          tri2.ids(id, id, id);
          tri2.colors(tri.v1.color, tri.v2.color, tri.v3.color);
        }
      }

      if (node.drawData) {
        node.drawData.destroy(gl);
      }

      //console.log("updating draw data for bvh node", node.id);

      rec(node);
      node.drawData = sm;
    }

    for (let node of bvh.nodes) {
      if (node.drawData && !(node.flag & BVHFlags.TEMP_TAG)) {
        node.drawData.destroy(gl);
        node.drawData = undefined;
      }

      if (node.flag & BVHFlags.TEMP_TAG) {
        let update = node.flag & BVHFlags.UPDATE_DRAW;
        update = update || !node.drawData;

        if (update) {
          genNodeMesh(node);
        }

        let f = node.id*0.1*Math.sqrt(3.0);
        f = Math.fract(f*10.0);

        let program2 = Shaders.SculptShader;

        uniforms.uColor = [f, f, f, 1.0];
        uniforms.alpha = 1.0;

        node.drawData.draw(gl, uniforms, program2);
      }

      node.flag &= ~(BVHFlags.TEMP_TAG|BVHFlags.UPDATE_DRAW);
    }
    return true;
  }
}

BVHToolMode.STRUCT = STRUCT.inherit(BVHToolMode, ToolMode) + `
  drawBVH : bool;
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);
