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
import {ToolOp, Vec4Property, FloatProperty, EnumProperty, FlagProperty, ListProperty} from "../../../path.ux/scripts/pathux.js";
import {MeshFlags} from "../../../mesh/mesh.js";
import {SimpleMesh, LayerTypes} from "../../../core/simplemesh.js";
import {splitEdgesSmart} from "../../../mesh/mesh_subdivide.js";

let _triverts = new Array(3);

export const SculptTools = {
  DRAW : 0,
  SHARP : 1,
  FILL : 2,
  SMOOTH : 3,
  CLAY : 4,
  SCRAPE : 5
};

export class SculptBrush {
  constructor() {
    this.tool = SculptTools.CLAY;
    this.strength = 1.0;
    this.spacing = 0.07;
    this.radius = 55.0;
    this.autosmooth = 0.0;
    this.planeoff = 0.0;
  }
}
SculptBrush.STRUCT = `
SculptBrush {
  autosmooth : float;
  strength   : float;
  tool       : int;
  radius     : float;
  planeoff   : float;
  spacing    : float;
}
`
nstructjs.register(SculptBrush);

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

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this._first = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();
  }

  static tooldef() {return {
    name : "paintop",
    toolpath : "bvh.paint",
    is_modal : true,
    inputs : {
      points : new ListProperty(Vec4Property), //fourth component is radius
      vecs : new ListProperty(Vec4Property), //displacements, fourth component
      tool : new EnumProperty("CLAY", SculptTools),
      strength : new FloatProperty(1.0),
      radius : new FloatProperty(55.0),
      planeoff : new FloatProperty(0.0),
      autosmooth : new FloatProperty(0.0),
      spacing : new FloatProperty(0.07)
    }
  }}

  undoPre(ctx) {
    let mesh;
    if (ctx.object && ctx.object.data instanceof Mesh) {
      mesh = ctx.object.data;
    }

    this._undo = {mesh : mesh ? mesh.lib_id : -1, vmap : new Map()};
  }

  undo(ctx) {
    let undo = this._undo;
    let mesh = ctx.datalib.get(undo.mesh);

    if (!mesh) {
      console.warn("eek! no mesh!");
      return;
    }

    let bvh = mesh.bvh;
    let cd_node;

    if (bvh) {
      cd_node = bvh.cd_node;
    }

    for (let eid of undo.vmap.keys()) {
      let v = mesh.eidmap[eid];

      if (v) {
        v.flag |= MeshFlags.UPDATE;
        v.load(undo.vmap.get(eid));

        if (bvh) {
          let node = v.customData[cd_node].node;
          if (node) {
            node.flag |= BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_NORMALS;
          }
        }
      }
    }

    mesh.recalcNormals();
    mesh.regenRender();
    mesh.regenPartial();

    if (bvh) {
      bvh.update();
    }
    window.redraw_viewport();
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      return;
    }

    let view3d = ctx.view3d;

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    let radius = this.inputs.radius.getValue();
    let strength = this.inputs.strength.getValue();
    let planeoff = this.inputs.planeoff.getValue();

    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let isect = bvh.castRay(origin, view);

    if (!isect) {
      return;
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(view3d.activeCamera.rendermat);


    let w = p3[3] * matrix.$matrix.m11;
    if (w <= 0) return;

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1]);
    radius *= w;

    let vec = new Vector3(isect.tri.v1.no);
    vec.add(isect.tri.v2.no);
    vec.add(isect.tri.v3.no);
    vec.normalize();

    view.negate();
    if (vec.dot(view) < 0) {
      view.negate();
    }
    view.normalize();

    vec.add(view).normalize();

    console.log("first", this._first);

    if (this._first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first = false;

      return;
    }

    let spacing = this.inputs.spacing.getValue();
    let steps = Math.ceil(this.last_p.vectorDistance(isect.p)/(radius*spacing));
    steps = Math.max(steps, 1);

    console.log("STEPS", steps, radius, spacing, this._first);

    for (let i=0; i<steps; i++) {
      let s = (i+1) / steps;

      const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
        SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE;

      let mode = this.inputs.tool.getValue();

      let isplane = false;

      if (e.shiftKey) {
        mode = SMOOTH;
      }

      switch (mode) {
        case FILL:
        case CLAY:
        case SCRAPE:
          isplane = true;
          break;
        default:
          isplane = false;
          break;
      }

      let p2 = new Vector3(this.last_p).interp(isect.p, s);

      p3.load(p2).multVecMatrix(view3d.activeCamera.rendermat);
      let w = p3[3] * matrix.$matrix.m11;

      let vec2 = new Vector3(this.last_vec).interp(vec, s);

      //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

      //console.log(isect, isect.tri);

      //vec.load(view);

      if (mode === SHARP) {
        vec2.negate();
      }

      if (e.ctrlKey) {
        vec2.negate();
      }

      let esize = 8.0;

      esize /= Math.max(view3d.glSize[0], view3d.glSize[1]);

      esize *= matrix.$matrix.m11;
      esize *= w;

      let radius2 = radius + (this.last_radius - radius)*s;

      p3.load(p2);
      p3[3] = radius2;

      let vec4 = new Vector4(vec2);
      vec4[3] = this.inputs.planeoff.getValue();

      this.inputs.points.push(p3);
      this.inputs.vecs.push(vec4);

      this.execDot(ctx, p3, vec4);
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_vec.load(vec);
    this.last_r = radius;

    window.redraw_viewport();
  }

  exec(ctx) {
    let i = 0;
    for (let p of this.inputs.points) {
      this.execDot(ctx, p, this.inputs.vecs.getListItem(i));
      i++;
    }

    window.redraw_viewport();
  }

  execDot(ctx, p3, vec) {
    const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
      SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      console.log("ERROR!");
      return;
    }

    let undo = this._undo;
    let vmap = undo.vmap;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let mode = this.inputs.tool.getValue();
    let radius = p3[3];
    let strength = this.inputs.strength.getValue();

    let planeoff = vec[3];
    let isplane = false;

    let esize = 8.0;

    if (mode === SCRAPE) {
      planeoff += -0.5;
      //strength *= 5.0;
      isplane = true;
    } else if (mode === FILL) {
      strength *= 0.5;
      isplane = true;
    } else if (mode === CLAY) {
      planeoff += 1.5;
      strength *= 2.0;
      isplane = true;
    } else if (mode === SMOOTH) {
      isplane = true;
    }

    vec = new Vector3(vec);
    vec.mulScalar(strength*0.1*radius);
    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let planep = new Vector3(p3);

    planep.addFac(vec, planeoff);

    //console.log(w);

    //console.log("radius", radius);

    p3 = new Vector3(p3);
    let vs = bvh.closestVerts(p3, radius);

    //console.log(vs, p3);

    let vsw;
    let _tmp = new Vector3();

    let vsmooth = (v, fac) => {
      _tmp.load(v);
      let w = 1.0;

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);

        _tmp.add(v2);
        w++;
      }

      _tmp.mulScalar(1.0 / w);
      v.interp(_tmp, vsw * fac);
    }

    let cd_node = bvh.cd_node;
    let ws = new Array(vs.size);

    let wi = 0;

    let planetmp = new Vector3();

    switch (mode) {
      case SculptTools.SMOOTH:
        vsw = 1.0; //strength; //Math.min(Math.max(strength, 0.0), 1.0);
        break;
      default:
        vsw = this.inputs.autosmooth.getValue();
        break;
    }

    vsw += this.inputs.autosmooth.getValue();

    //console.log("VSW", vsw, mode);

    for (let v of vs) {
      if (!vmap.has(v.eid)) {
        vmap.set(v.eid, new Vector3(v));
      }

      let f = Math.max(1.0 - v.vectorDistance(p3) / radius, 0.0);
      let f2 = f;

      if (mode === SHARP) {
        f *= f;
        //f2 = Math.pow(f2, 0.5);
      } else if (mode === FILL) {
        //f = f * f * (3.0 - 2.0 * f);
        f = Math.sqrt(f);
      } else if (mode === SCRAPE) {
        f = Math.pow(f, 0.2);
        f = 1.0;
      } else if (mode === CLAY) {
        f = Math.sqrt(f);
      } else if (mode === SMOOTH) {
        f = f*f*(3.0-2.0*f);
        f *= strength;
      } else {
        f = f*f*(3.0-2.0*f);
      }

      /*
      f = 1.0 - f;
      f = 1.0 - Math.exp(-f*10.0);
      f = 1.0 - f;
      //*/
      ws[wi++] = f;

      //f=1.0

      if (mode === SHARP) {
        f *= 1.0;
        f2 *= 0.25;

        let d = 1.0 - Math.max(v.no.dot(nvec), 0.0);

        //d = 1.0 - d;
        //d *= d*d*d*d;
        d *= d;
        //d = 1.0 - d;

        v.addFac(v.no, vlen*d*f2);
        v.addFac(vec, f);//
      } else if (isplane) {
        let co = planetmp.load(v);
        co.sub(planep);

        let d = co.dot(nvec);
        v.addFac(vec, -d*f);
      } else if (mode === DRAW) {
        v.addFac(vec, f);//
      }

      v.flag |= MeshFlags.UPDATE;
    }

    //let es = new Set();
    wi = 0;

    for (let v of vs) {
      let node = v.customData[cd_node].node;

      if (node) {
        node.flag |= BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_NORMALS;
      }

      //for (let e of v.edges) {
      //  es.add(e);
      //}

      if (vsw >= 0) {
        vsmooth(v, ws[wi++]);
      }

      v.flag |= MeshFlags.UPDATE;
    }

    //this.doTopology(mesh, bvh, esize, vs, es);

    if (!this.modalRunning) {
      mesh.regenTesellation();
    }

    //mesh.recalcNormals();
    mesh.regenRender();

    bvh.update();
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

  modalStart(ctx) {
    this._first = true;
    return super.modalStart(ctx);
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

    this.brush = new SculptBrush();
    this.drawBVH = false;

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

    let row = addHeaderRow();
    let path = `scene.tools.${name}.brush`

    strip = row.strip();

    strip.listenum(path + ".tool");
    strip.prop(path + ".radius");

    strip = addHeaderRow().strip();
    strip.prop(path + ".strength");
    strip.prop(path + ".autosmooth");

    strip = addHeaderRow().strip();
    strip.prop(path + ".planeoff");
    strip.prop(path + ".spacing");
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.bool("drawBVH", "drawBVH", "drawBVH");

    let bst = st.struct("brush", "brush", "Brush");
    bst.float("strength", "strength", "Strength").range(0.001, 2.0).noUnits();
    bst.float("radius", "radius", "Radius").range(0.1, 150.0).noUnits();
    bst.enum("tool", "tool", SculptTools);
    bst.float("autosmooth", "autosmooth", "Autosmooth").range(0.0, 1.0).noUnits();
    bst.float("planeoff", "planeoff", "planeoff").range(-1.0, 1.0).noUnits();
    bst.float("spacing", "spacing", "Spacing").range(0.01, 2.0).noUnits();

    return st;
  }

  getBVH(mesh) {
    return mesh.bvh ? mesh.bvh : mesh.getBVH(false);
  }

  on_mousedown(e, x, y) {
    super.on_mousedown(e, x, y);

    if (e.button === 0 && !e.altKey) {
      let brush = this.brush;

      this.ctx.api.execTool(this.ctx, "bvh.paint()", {
        strength : brush.strength,
        tool : e.shiftKey ? SculptTools.SMOOTH : brush.tool,
        radius : brush.radius,
        autosmooth : brush.autosmooth,
        planeoff : brush.planeoff,
        spacing : brush.spacing
      });
      return true;
    }

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
      node.flag &= ~BVHFlags.TEMP_TAG;
    }

    let drawnodes = new Set();

    for (let node of bvh.nodes) {
      if (!node.leaf) {
        continue;
      }

      let p = node;
      //get parent parentoff levels up

      for (let i=0; i<parentoff; i++) {
        if (p.flag & BVHFlags.TEMP_TAG) {
          break;
        }

        p = p.parent ? p.parent : p;
        /*
        let p2 = p.parent ? p.parent : p;

        let d;
        let bad = false;

        for (let c of p2.children) {
          if (d === undefined) {
            d = c.subtreeDepth;
          } else {
            bad = bad || c.subtreeDepth !== d;
          }
        }

        if (!bad) {
          p = p2;
        } else {
          break;
        }
        */
      }

      p.flag |= BVHFlags.TEMP_TAG;

      drawnodes.add(p);

      if (node.flag & BVHFlags.UPDATE_DRAW) {
        p.flag |= BVHFlags.UPDATE_DRAW;
      }
    }

    for (let node of new Set(drawnodes)) {
      let p2 = node.parent;
      while (p2) {
        if (p2.flag & BVHFlags.TEMP_TAG) {
          node.flag &= ~BVHFlags.TEMP_TAG;
          p2.flag |= node.flag & BVHFlags.UPDATE_DRAW;
          break;
        }
        p2 = p2.parent;
      }
    }

    let t1 = new Vector3();
    let t2 = new Vector3();
    let t3 = new Vector3();

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
          /*
          t1.load(tri.v1);
          t2.load(tri.v2);
          t3.load(tri.v3);


          for (let i=0; i<3; i++) {
            t1[i] += (Math.random()-0.5)*0.01;
            t2[i] += (Math.random()-0.5)*0.01;
            t3[i] += (Math.random()-0.5)*0.01;

          }*/

          //*
          t1 = tri.v1;
          t2 = tri.v2;
          t3 = tri.v3;
          //*/

          let tri2 = sm.tri(t1, t2, t3);

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
      sm.gen = 0;
      node.drawData = sm;
    }

    for (let node of bvh.nodes) {
      if (node.drawData && !(node.flag & BVHFlags.TEMP_TAG)) {
        node.drawData.destroy(gl);
        node.drawData = undefined;
        continue;
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

        uniforms.uColor = [f, Math.fract(f*3.23423+0.432), Math.fract(f*5.234+.13432), 1.0];
        uniforms.alpha = 1.0;

        if (node.drawData.gen === 0) {
        //  uniforms.uColor = [f, f, f, 1.0];
        }
        node.drawData.draw(gl, uniforms, program2);

        if (0) {
          uniforms.alpha = 0.5;

          gl.depthMask(false);
          gl.disable(gl.DEPTH_TEST);
          gl.enable(gl.CULL_FACE);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          node.drawData.draw(gl, uniforms, program2);

          gl.depthMask(true);
          gl.disable(gl.CULL_FACE);
          gl.disable(gl.BLEND);
          gl.enable(gl.DEPTH_TEST);
        }


        gl.disable(gl.CULL_FACE);
        node.drawData.gen++;
      }

      node.flag &= ~(BVHFlags.TEMP_TAG|BVHFlags.UPDATE_DRAW);
    }
    return true;
  }
}

BVHToolMode.STRUCT = STRUCT.inherit(BVHToolMode, ToolMode) + `
  drawBVH : bool;
  brush   : SculptBrush;
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);
