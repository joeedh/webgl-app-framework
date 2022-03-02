import * as util from '../../../util/util.js';
import {
  BoolProperty,
  Curve1DProperty,
  EnumProperty, FlagProperty, FloatArrayProperty, FloatProperty, IntProperty, Matrix4, Quat, ToolOp, Vec3Property,
  Vec4Property,
  Vector2, Vector3,
  Vector4, closest_point_on_line
} from '../../../path.ux/scripts/pathux.js';
import {Grid, GridBase, QRecalcFlags} from '../../../mesh/mesh_grids.js';
import {CDFlags, CustomDataElem} from '../../../mesh/customdata.js';
import {
  BrushFlags, DynTopoFlags, SculptTools, BrushSpacingModes, DynTopoModes, SubdivModes
} from '../../../brush/brush.js';
import {getArrayTemp, LogContext, Loop, Mesh, MeshFlags, MeshTypes, Vertex} from '../../../mesh/mesh.js';
import {BVHFlags, BVHTriFlags, BVHVertFlags, getDynVerts, IsectRet} from '../../../util/bvh.js';
import {QuadTreeFields, QuadTreeFlags, QuadTreeGrid} from '../../../mesh/mesh_grids_quadtree.js';
import {EMapFields, KdTreeFields, KdTreeFlags, KdTreeGrid, VMapFields} from '../../../mesh/mesh_grids_kdtree.js';
import {
  splitEdgesSmart, splitEdgesSimple, splitEdgesSimple2, splitEdgesSmart2, splitEdgesPreserveQuads, countNewSplitEdges
} from '../../../mesh/mesh_subdivide.js';
import {
  BrushProperty, calcConcave, PaintOpBase, PaintSample, PaintSampleProperty, SymAxisMap,
  getBVH, regenBVH
} from './pbvh_base.js';
import {trianglesToQuads, triangulateFan, TriQuadFlags} from '../../../mesh/mesh_utils.js';
import {applyTriangulation, triangulateFace, triangulateQuad} from '../../../mesh/mesh_tess.js';
import {MeshLog} from '../../../mesh/mesh_log.js';
import {TetMesh} from '../../../tet/tetgen.js';
import {MultiGridSmoother} from '../../../mesh/multigrid_smooth.js';
import {getCurveVerts, dirCurveSmooth} from '../../../mesh/mesh_curvature.js';
import {TexUserFlags, TexUserModes} from '../../../texture/proceduralTex.js';
import {closest_bez3_v2, dbez3_v2} from '../../../util/bezier.js';
import {tetSolve} from '../../../tet/tet_deform.js';
import {DispContext, DispLayerVert, getSmoothMemo, SmoothMemoizer} from '../../../mesh/mesh_displacement.js';
import {getCornerFlag, getFaceSets, getSmoothBoundFlag} from '../../../mesh/mesh_facesets.js';

//grab data field definition
const GEID = 0, GEID2 = 1, GDIS = 2, GSX = 3, GSY = 4, GSZ = 5;
const GAX = 6, GAY = 7, GAZ = 8, GOFFX = 9, GOFFY = 10, GOFFZ = 11, GTOT = 12;

let UGTOT = 9;

let ENABLE_DYNTOPO_EDGE_WEIGHTS = true;
let DYNTOPO_T_GOAL = 7;

let edist_coll_tmp1 = new Vector3();
let edist_coll_tmp2 = new Vector3();
let edist_coll_tmp3 = new Vector3();
let edist_coll_tmp4 = new Vector3();

let ENABLE_RAKE = true;
let ENABLE_CURVATURE_RAKE = true;

const FANCY_MUL = 1.0;

window._disableRake = function (curvatureOnly = false, mode = false) {
  ENABLE_CURVATURE_RAKE = mode;

  if (!curvatureOnly) {
    ENABLE_RAKE = mode;
  }
}

/*
let GVEID = 0, GVTOT=1;
let GGEID_LOOP=0, GGEID_GRIDVERT=1, GGTOT=2;
*/

/*
BrushProperty works by copying SculptBrush.  It also copies any
textures inside of them, but not anything those textures references (e.g. images).

WARNING: this means there could conceivably be reference leaks here with the undo stack
*/


let cfrets = util.cachering.fromConstructor(Vector4, 128);
export let colorfilterfuncs = [0, 0];
let midtmp = new Vector3();

colorfilterfuncs[1] = function (v, cd_color, fac = 0.5) {
  if (cd_color < 0) {
    return;
  }

  let ret = cfrets.next().zero();
  let tot = 0.0;
  fac = 1.0 - fac;

  for (let v2 of v.neighbors) {
    let clr = v2.customData[cd_color].color;
    let w = 1.0;

    tot += w;
    ret.addFac(clr, w);
  }

  if (tot === 0.0) {
    ret.load(v.customData[cd_color].color);
  } else {
    ret.mulScalar(1.0/tot);
    ret.interp(v.customData[cd_color].color, fac);
  }

  return ret;
}

colorfilterfuncs[0] = function (v, cd_color, fac = 0.5) {
  if (cd_color < 0) {
    return;
  }

  let ret = cfrets.next().zero();
  let tot = 0.0;
  fac = 1.0 - fac;

  for (let e of v.edges) {
    let v2 = e.otherVertex(v);
    let clr = v2.customData[cd_color].color;
    let w = 1.0;

    tot += w;
    ret.addFac(clr, w);
  }

  if (tot === 0.0) {
    ret.load(v.customData[cd_color].color);
  } else {
    ret.mulScalar(1.0/tot);
    ret.interp(v.customData[cd_color].color, fac);
  }

  return ret;
}


export class PaintOp extends PaintOpBase {
  constructor() {
    super();

    this.edist_scale = () => 1.0;

    this.edist_subd = this.edist_subd.bind(this);
    this.edist_coll = this.edist_coll.bind(this);

    this._last_enable_mres = "";

    this.dynTopoRand = new util.MersenneRandom();

    this.grabEidMap = undefined;
    this.grabDists = undefined;

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this.last_origco = new Vector4();
    this._first2 = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();

    this.smoother = undefined;
    this.task = undefined;
  }

  static tooldef() {
    return {
      uiname  : "paintop",
      toolpath: "bvh.paint",
      is_modal: true,
      inputs  : ToolOp.inherit({
        grabData        : new FloatArrayProperty(),
        grabCo          : new Vec3Property(),
        grabRadiusFactor: new FloatProperty(2.5),
        grabTh          : new FloatProperty(0.0),

        dynTopoLength      : new FloatProperty(25),
        dynTopoDepth       : new IntProperty(20),
        useDynTopo         : new BoolProperty(false),
        useMultiResDepth   : new BoolProperty(false),
        reprojectCustomData: new BoolProperty(false),

        drawFaceSet : new IntProperty(2),
      })
    }
  }

  ensureSmoother(mesh) {
    if (!this.smoother) {
      this.smoother = MultiGridSmoother.ensureSmoother(mesh, true, undefined, true);
    }
  }

  initOrigData(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    let cd_orig;
    let haveGrids = cd_grid >= 0;
    let initverts = false;

    if (haveGrids) {
      cd_orig = mesh.loops.customData.getNamedLayerIndex("__orig_co", "vec3");

      if (cd_orig < 0) {
        let layer = mesh.loops.addCustomDataLayer("vec3", "__orig_co");
        layer.flag |= CDFlags.TEMPORARY;
        cd_orig = layer.index;
        initverts = true;
      }
    } else {
      cd_orig = mesh.verts.customData.getNamedLayerIndex("__orig_co", "vec3");

      if (cd_orig < 0) {
        let layer = mesh.verts.addCustomDataLayer("vec3", "__orig_co");
        layer.flag |= CDFlags.TEMPORARY;
        cd_orig = layer.index;
        initverts = true;
      }
    }

    if (initverts) {
      for (let v of mesh.verts) {
        v.customData[cd_orig].value.load(v);
      }
    }

    return cd_orig;
  }

  calcUndoMem(ctx) {
    let ud = this._undo;
    let tot = 0;

    if (!ud) {
      return 0;
    }

    tot += ud.vmap.size*(8 + 3*8);
    tot += ud.gmap.size*(16*8); //approximate size of gmap
    tot += ud.gdata.length*8;
    tot += ud.gset.size*8;
    tot += ud.log.calcMemSize();

    return tot;
  }

  undoPre(ctx) {
    let mesh;
    if (ctx.object && ctx.object.data instanceof Mesh) {
      mesh = ctx.object.data;
    } else if (ctx.object && ctx.object.data instanceof TetMesh) {
      mesh = ctx.object.data;
    }

    let cd_grid = -1, cd_mask = -1;

    if (mesh) {
      cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_grid >= 0) {
        cd_mask = mesh.loops.customData.getLayerIndex("mask");
      } else {
        cd_mask = mesh.verts.customData.getLayerIndex("mask");
      }
    }

    this._undo = {
      mesh : mesh ? mesh.lib_id : -1,
      mode : this.inputs.brush.getValue().tool,
      vmap : new Map(),
      gmap : new Map(),
      mmap : new Map(), //mask data for nongrid verts
      cd_mask,
      gdata: [],
      log  : new MeshLog(),
      gset : new Set(),
      fsetmap : new Map()
    };

    if (mesh) {
      this._undo.log.start(mesh);
    }
  }

  undo(ctx) {
    console.log("BVH UNDO!");

    let undo = this._undo;
    let mesh = ctx.datalib.get(undo.mesh);

    if (!mesh) {
      console.warn("eek! no mesh!");
      return;
    }

    let cd_fset = getFaceSets(mesh, false);

    let cd_mask = undo.cd_mask;

    let bvh = this.getBVH(mesh);
    let cd_node;
    let cd_dyn_vert = getDynVerts(mesh);

    if (bvh) {
      cd_node = bvh.cd_node;
    }

    let cd_grid = GridBase.meshGridOffset(mesh);
    let gd = undo.gdata;

    console.warn("UNDO", undo);

    if (cd_grid < 0 && cd_fset >= 0) {
      for (let [eid, fset] of undo.fsetmap) {
        let f = mesh.eidMap.get(eid);

        if (!f || f.type !== MeshTypes.FACE) {
          console.log("invalid face in undo!", eid, f);
          continue;
        }

        f.customData[cd_fset].value = fset;

        for (let v of f.verts) {
          v.flag |= MeshFlags.UPDATE;

          if (cd_node !== undefined) {
            let mv = v.customData[cd_dyn_vert];

            mv.flag |= BVHVertFlags.NEED_BOUNDARY;

            let node = v.customData[cd_node].node;
            node.setUpdateFlag(BVHFlags.UPDATE_INDEX_VERTS|BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK);
          }
        }
      }
    }
    console.log("CD_GRID", cd_grid);
    console.log("LOG", this._undo.log, cd_grid < 0 && this._undo.log.log.length > 0);

    if (cd_grid < 0 && this._undo.log.log.length > 0) {
      let log = this._undo.log;

      log.undo(mesh);
      mesh.regenTessellation();
      mesh.regenBVH();
      bvh = this.getBVH(mesh);
    }

    let doColors = () => {
      let cd_color = mesh.loops.customData.getLayerIndex("color");

      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], r = gd[i + 2], g = gd[i + 3], b = gd[i + 4], a = gd[i + 5];

        l = mesh.eidMap.get(l);
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        let c = p.customData[cd_color].color;
        c[0] = r;
        c[1] = g;
        c[2] = b;
        c[3] = a;

        let node = p.customData[cd_node].node;

        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS);
        }
      }

      cd_color = mesh.verts.customData.getLayerIndex("color");

      if (cd_color < 0) {
        return;
      }

      for (let eid of undo.vmap.keys()) {
        let v = mesh.eidMap.get(eid);

        if (v) {
          v.flag |= MeshFlags.UPDATE;
          v.customData[cd_color].color.load(undo.vmap.get(eid));

          if (bvh) {
            let node = v.customData[cd_node].node;
            if (node) {
              node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
            }
          }
        }
      }

      //XXX for now, regen bvh on undo
      mesh.regenBVH();

      mesh.regenRender();
      mesh.regenPartial();
    }

    let doMasks = () => {
      if (cd_mask < 0) {
        return;
      }

      let mmap = undo.mmap;

      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], mask = gd[i + 2];

        l = mesh.eidMap.get(l);
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        p.customData[cd_mask].value = mask;

        let node = p.customData[cd_node].node;

        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS);
        }
      }

      for (let [veid, mask] of mmap) {
        let v = mesh.eidMap.get(veid);

        if (!v) {
          continue;
        }

        v.customData[cd_mask].value = mask;
        let node = v.customData[cd_node].node;

        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK);
        }
      }
    }

    let doCoords = () => {
      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], x = gd[i + 2], y = gd[i + 3], z = gd[i + 4];
        let nx = gd[i + 5], ny = gd[i + 6], nz = gd[i + 7];

        l = mesh.eidMap.get(l);
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        p[0] = x;
        p[1] = y;
        p[2] = z;
        p.no[0] = nx;
        p.no[1] = ny;
        p.no[2] = nz;

        let node = p.customData[cd_node].node;

        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS);
        }
      }

      for (let eid of undo.vmap.keys()) {
        let v = mesh.eidMap.get(eid);

        if (v) {
          v.flag |= MeshFlags.UPDATE;
          v.load(undo.vmap.get(eid));

          if (bvh) {
            let node = v.customData[cd_node].node;

            if (node) {
              node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS);
            }
          }
        }
      }

      bvh.update();

      if (cd_grid < 0) {
        mesh.recalcNormals();
      }

      mesh.regenRender();
      mesh.regenPartial();
    }

    let doQuadTreeGrids = () => {
      console.log("gmap:", undo.gmap);
      let gmap = undo.gmap;

      let cd_node = mesh.loops.customData.getLayerIndex("bvh");
      let cd_grid = GridBase.meshGridOffset(mesh);

      let updateloops = new Set();
      let killloops = new Set();

      for (let l of gmap.keys()) {
        let grid1 = l.customData[cd_grid];
        let grid2 = gmap.get(l);

        //forcably unlink verts from uniqueVerts in bvh tree nodes
        //except we're destroy the bvh anyway, and mesh.bvh does this for us
        /*
        if (cd_node >= 0) {
          for (let p of grid1.points) {
            let node = p.customData[cd_node];
            if (node && node.node && node.node.uniqueVerts) {
              node.node.uniqueVerts.delete(p);
            }
            if (node) {
              node.node = undefined;
            }
          }
        }*/

        //bvh.removeFace(l.eid, true);

        grid2.copyTo(grid1, true);

        grid1.recalcFlag |= QRecalcFlags.MIRROR | QRecalcFlags.ALL | QRecalcFlags.TOPO;

        killloops.add(l);

        updateloops.add(l);
        updateloops.add(l.prev.radial_next);
        updateloops.add(l.radial_next.next);
        updateloops.add(l.prev);
        updateloops.add(l.next);
      }

      //bvh.update();

      //let updateflag = QRecalcFlags.NEIGHBORS|QRecalcFlags.POLYS|QRecalcFlags.TOPO|QRecalcFlags.CHECK_CUSTOMDATA;
      let updateflag = QRecalcFlags.ALL | QRecalcFlags.MIRROR;

      for (let l of killloops) {
        let grid = l.customData[cd_grid];

        //bvh.removeFace(l.eid, true);
        grid.recalcFlag |= updateflag;
      }

      //do modified grids first
      for (let l of killloops) {
        let grid = l.customData[cd_grid];

        grid.update(mesh, l, cd_grid);
      }

      //now do neightboring grids
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.update(mesh, l, cd_grid);
      }


      //just regenerate entire bvh tree on undo for now
      if (bvh) {
        mesh.regenBVH();
      }

      bvh = undefined;

      if (0) {
        let trisout = [];

        for (let l of killloops) {
          let grid = l.customData[cd_grid];
          grid.makeBVHTris(mesh, bvh, l, cd_grid, trisout);
        }

        while (trisout.length > 0) {
          let ri = (~~(this.rand.random()*trisout.length/5.0*0.99999))*5;
          let ri2 = trisout.length - 5;

          let eid = trisout[ri];
          let id = trisout[ri + 1];
          let v1 = trisout[ri + 2];
          let v2 = trisout[ri + 3];
          let v3 = trisout[ri + 4];

          bvh.addTri(eid, id, v1, v2, v3);

          for (let j = 0; j < 5; j++) {
            trisout[ri + j] = trisout[ri2 + j];
          }

          trisout.length -= 5;
        }
      }
    }

    let haveQuadTreeGrids = false;
    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        if (grid instanceof QuadTreeGrid) {
          haveQuadTreeGrids = true;
        }

        if (grid instanceof KdTreeGrid) {
          haveQuadTreeGrids = true;
        }
        break;
      }
    }
    let mode = undo.mode;
    let isPaintColor = mode === SculptTools.PAINT || mode === SculptTools.PAINT_SMOOTH;

    if (mode === SculptTools.MASK_PAINT) {
      doMasks();
    } else if (haveQuadTreeGrids) {
      doQuadTreeGrids();
    } else if (isPaintColor) {
      doColors();
    } else {
      doCoords();
    }

    if (bvh) {
      bvh.update();
    }
    window.redraw_viewport(true);
  }


  sampleViewRay(rendermat, _mpos, view, origin, pressure, invert, isInterp) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d, mesh = ctx.mesh;
    let tetmesh = ctx.tetmesh;

    let delayMode = this.hasSampleDelay();

    if ((!mesh && !tetmesh) || !view3d) {
      return;
    }


    let the_mesh = mesh || tetmesh;

    let bvh = this.getBVH(the_mesh);
    let brush = this.inputs.brush.getValue();
    let mode = brush.tool;

    let first = this._first2;

    let ret = super.sampleViewRay(rendermat, _mpos, view, origin, pressure, invert, isInterp);

    if (!ret) {
      return;
    }

    let {ob, origco, p, isect, radius, vec, mpos, getchannel, w} = ret;
    view = ret.view;

    let strength = brush.strength;
    let planeoff = brush.planeoff;
    let autosmooth = brush.autosmooth;
    let autosmoothInflate = brush.autosmoothInflate;
    let concaveFilter = brush.concaveFilter;
    let pinch = brush.pinch;
    let smoothProj = brush.smoothProj;
    let rake = brush.rake;
    let sharp = brush.sharp;

    strength = getchannel("strength", strength);
    autosmooth = getchannel("autosmooth", autosmooth);
    autosmoothInflate = getchannel("autosmoothInflate", autosmoothInflate);
    concaveFilter = getchannel("concaveFilter", concaveFilter);
    pinch = getchannel("pinch", pinch);
    smoothProj = getchannel("smoothProj", smoothProj);
    rake = getchannel("rake", rake);
    sharp = getchannel("sharp", sharp);

    let haveOrigData = PaintOpBase.needOrig(brush);
    let cd_orig = -1;

    let cd_grid = mesh ? GridBase.meshGridOffset(mesh) : -1;

    if (haveOrigData) {
      cd_orig = this.initOrigData(the_mesh);
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(rendermat);

    if (mode !== SculptTools.SNAKE && mode !== SculptTools.SLIDE_RELAX && mode !== SculptTools.GRAB) {
      vec = new Vector3(isect.tri.v1.no);
      vec.add(isect.tri.v2.no);
      vec.add(isect.tri.v3.no);
      vec.normalize();

      view.negate();
      if (vec.dot(view) < 0) {
        view.negate();
      }
      view.normalize();

      //if (mode !== SculptTools.SMOOTH) {
      vec.interp(view, 1.0 - brush.normalfac).normalize();
      //}
    } else if (!first) {
      vec = new Vector3(isect.p).sub(this.last_p);
      let p1 = new Vector3(isect.p);
      let p2 = new Vector3(this.last_p);

      view3d.project(p1);
      view3d.project(p2);

      p1[2] = p2[2];

      view3d.unproject(p1);
      view3d.unproject(p2);

      vec.load(p1).sub(p2);
    }

    //console.log("first", this._first);

    window.redraw_viewport(true);

    if (first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_origco.load(origco);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first2 = false;

      if (mode === SculptTools.GRAB) {
        this.inputs.grabCo.setValue(isect.p);
        this.initGrabData(the_mesh, isect.p, radius*this.inputs.grabRadiusFactor.getValue());
      }

      return;
    }

    let spacing = brush.spacing;
    let steps = 0;

    if (mode === SculptTools.GRAB) {
      steps = 1;
    }

    if (brush.spacingMode !== BrushSpacingModes.EVEN) {
      steps = 1;
    } else if (mode !== SculptTools.GRAB) {
      steps = this.last_p.vectorDistance(isect.p)/(2.0*radius*spacing);

      if (steps < 1) {
        return;
      }

      steps = Math.max(Math.ceil(steps), 1);
    }

    //console.log("STEPS", steps, radius, spacing, this._first);

    const DRAW                                                            = SculptTools.DRAW, SHARP                                  = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH                                                          = SculptTools.SMOOTH, CLAY                               = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH                                                    = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB;

    if (mode === SHARP) {
      invert ^= true;
    }

    let this2 = this;

    let task = (function* () {
      let ds = 1.0/steps;

      for (let i = 0; i < steps; i++) {
        let s = (i + 1)/steps;

        let isplane = false;

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

        let sco = new Vector4(this2.last_p).interp(isect.p, s);
        sco[3] = 1.0;
        view3d.project(sco);

        let p2 = new Vector3(this2.last_p).interp(isect.p, s);
        let op2 = new Vector4(this2.last_origco).interp(origco, s);

        p3.load(p2);
        p3[3] = 1.0;
        p3.multVecMatrix(rendermat);

        let w = p3[3]*matrix.$matrix.m11;

        let vec2 = new Vector3(this2.last_vec).interp(vec, s);

        //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

        //console.log(isect, isect.tri);

        //vec.load(view);

        let esize = brush.dynTopo.edgeSize;
        let emode = brush.dynTopo.edgeMode;

        if (emode === DynTopoModes.SCREEN) {
          esize /= view3d.glSize[1]; //Math.min(view3d.glSize[0], view3d.glSize[1]);
          esize *= w;
        } else {
          esize *= 0.1;
        }

        let radius2 = radius + (this2.last_radius - radius)*s;

        if (invert) {
          if (isplane) {
            //planeoff = -planeoff;
          } else {
            //strength = -strength;
          }
        }

        let ps = new PaintSample();

        ps.smoothProj = smoothProj;
        ps.pinch = pinch;
        ps.sharp = sharp;
        ps.sp.load(sco);
        ps.rake = rake;
        ps.invert = invert;
        ps.origp.load(op2);
        ps.p.load(p2);
        ps.p[3] = w;
        ps.viewPlane.load(view).normalize();
        ps.viewvec.load(view).normalize();
        ps.dstrokeS = ds;
        ps.strokeS = 0; //will be set from lastps below
        ps.isInterp = isInterp || (i > 0 && i < steps - 1);

        ps.rendermat.load(rendermat);

        ps.concaveFilter = concaveFilter;
        ps.autosmooth = autosmooth;
        ps.autosmoothInflate = autosmoothInflate;
        ps.esize = esize;
        ps.vec.load(vec2);
        ps.planeoff = planeoff;
        ps.radius = radius2;
        ps.strength = strength;

        let lastps;
        let data = this2.inputs.samples.data;

        if (this2.lastps1) {
          lastps = this2.lastps1;

          ps.strokeS = lastps.strokeS + ds;

          ps.dsp.load(ps.sp).sub(lastps.sp);
          ps.angle = Math.atan2(ps.dsp[1], ps.dsp[0]);

          lastps.futureAngle = ps.angle;

          ps.dvec.load(ps.vec).sub(lastps.vec);
          ps.dp.load(ps.p).sub(lastps.p);
        }

        let runps = this2.lastps2;

        if (runps) {
          runps.futureAngle = lastps.angle;
          data.push(runps);
        }

        this2.lastps2 = this2.lastps1;
        this2.lastps1 = ps;

        this2.inputs.samples.push(ps);

        if (this2.modalRunning && runps) {
          for (let iter of this2.execDotWithMirror_task(ctx, runps, lastps)) {
            yield;
          }
        }
      }
    })();

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_origco.load(origco);
    this.last_vec.load(vec);
    this.last_r = radius;

    return task;
  }

  initGrabData(mesh, co, radius) {
    console.log("Init grab data", mesh, co, radius);

    let sym = this.inputs.symmetryAxes.getValue();
    let axismap = SymAxisMap;

    let bvhRadius = radius;
    let smul = this.inputs.brush.getValue().smoothRadiusMul;

    bvhRadius *= smul;

    let bvh = this.getBVH(mesh);
    let vs = bvh.closestVerts(co, bvhRadius);
    let co2 = new Vector3();

    let offs = axismap[sym];
    if (offs) {
      for (let off of offs) {
        co2.load(co).mul(off);
        let vs2 = bvh.closestVerts(co2, bvhRadius);

        for (let v of vs2) {
          vs.add(v);
        }
      }
    }

    let gd = [];
    let cd_grid = GridBase.meshGridOffset(mesh);
    let haveGrids = cd_grid >= 0;
    let gdists = this.grabDists = [];
    let sign = new Vector3();
    let add = new Vector3();

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.update(mesh, l, cd_grid);
      }

      this.grabEidMap = new Map();

      for (let v of vs) {
        gd.push(v.loopEid);
        gd.push(v.eid);

        let dis = v.vectorDistance(co);
        let offs = axismap[sym];

        if (offs) {
          for (let off of offs) {
            co2.load(co).mul(off);
            let dis2 = v.vectorDistance(co2);
            if (dis2 < dis) {
              for (let i = 0; i < 3; i++) {
                if (off[i] < 0) {
                  //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
                }
              }
              dis = dis2;
              sign.load(off);
            }
          }
        }

        gd.push(dis);

        gd.push(sign[0]);
        gd.push(sign[1]);
        gd.push(sign[2]);

        gd.push(add[0]);
        gd.push(add[1]);
        gd.push(add[2]);

        gd.push(0);
        gd.push(0);
        gd.push(0);

        gdists.push(dis);

        this.grabEidMap.set(v.eid, v);
      }
    } else {
      for (let v of vs) {
        gd.push(v.eid);
        gd.push(0);

        add.zero();
        sign[0] = sign[1] = sign[2] = 1.0;

        let offs = axismap[sym];

        let dis = v.vectorDistance(co);
        if (sym && offs) {
          for (let off of offs) {
            for (let i = 0; i < 3; i++) {
              if (off[i] > 0) {
                continue;
              }

              //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
              let f = Math.abs(co[i]) + 0.00001;
              let ratio = radius/f;

              //add[i] = -Math.abs(co[i]);
              sign[i] *= ratio;
            }
          }
        }

        if (offs) {
          for (let off of offs) {
            co2.load(co).mul(off);
            let dis2 = v.vectorDistance(co2);
            if (dis2 < dis) {
              dis = dis2;
              sign.load(off);
              add.zero();

              for (let i = 0; i < 3; i++) {
                if (off[i] > 0) {
                  continue;
                }

                //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
                let f = Math.abs(co2[i]) + 0.00001;
                let ratio = radius/f;

                //add[i] = -Math.abs(co[i]);
                sign[i] *= ratio;
              }

              dis = dis2;
            }
          }
        }

        gd.push(dis);

        gd.push(sign[0]);
        gd.push(sign[1]);
        gd.push(sign[2]);

        gd.push(add[0]);
        gd.push(add[1]);
        gd.push(add[2]);

        gd.push(0);
        gd.push(0);
        gd.push(0);

        gdists.push(dis);
      }
    }

    this.inputs.grabData.setValue(gd);
  }

  execPost() {
    //prevent nasty reference leak in undo stack
    this.grabEidMap = undefined;

    if (this.smoother) {
      //this.smoother.finish();
      this.smoother = undefined;
    }
  }

  _ensureGrabEidMap(ctx) {
    let mesh = ctx.mesh || ctx.tetmesh;

    if (!this.grabEidMap) {
      let gdists = this.grabDists = [];

      let gmap = this.grabEidMap = new Map();
      let grids = new WeakSet();
      let gd = this.inputs.grabData.getValue();

      let cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_grid >= 0) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let l = gd[i], p = gd[i + 1], dis = gd[i + 2];

          gdists.push(dis);

          l = mesh.eidMap.get(l);
          if (!l) {
            console.error("error, missing loop " + l);
            continue;
          }

          let grid = l.customData[cd_grid];
          if (!grids.has(grid)) {
            grids.add(grid);
            grid.update(mesh, l, cd_grid);

            for (let p of grid.points) {
              gmap.set(p.eid, p);
            }
          }
        }
      } else {
        for (let i = 0; i < gd.length; i += GTOT) {
          let eid = gd[i], dis = gd[i + 2];

          let v = mesh.eidMap.get(eid);
          if (!v) {
            console.warn("Missing vertex error: " + eid + " was missing");
            continue;
          }

          gdists.push(dis);
          gmap.set(v.eid, v);
        }
      }
    }
  }

  execDotWithMirror(ctx, ps, lastps) {
    for (let iter of this.execDotWithMirror_task(ctx, ps, lastps)) {

    }
  }

  * execDotWithMirror_task(ctx, ps, lastps) {
    let sym = this.inputs.symmetryAxes.getValue();

    if (!sym) {
      for (let iter of this.execDot_task(ctx, ps, lastps)) {
        yield;
      }
      return;
    }

    for (let iter of this.execDot_task(ctx, ps.copy(), lastps ? lastps.copy() : undefined)) {
      yield;
    }

    let offs = SymAxisMap[sym];

    let mode = this.inputs.brush.getValue().tool;
    if (mode === SculptTools.GRAB) {// || mode === SculptTools.SNAKE) {
      return;
    }

    if (!offs) {
      return;
    }

    for (let off of offs) {
      off = new Vector4(off);
      off[3] = 1.0;

      let mps = ps.copy();
      let mlastps = lastps ? lastps.copy().mirror(off) : undefined;

      mps.mirror(off);

      let gco = this.inputs.grabCo.getValue();
      let orig = new Vector3(gco);

      gco.mul(off);
      this.inputs.grabCo.setValue(gco);

      for (let iter of this.execDot_task(ctx, mps, mlastps)) {
        yield;
      }

      this.inputs.grabCo.setValue(orig);
    }
  }

  exec(ctx) {
    this.dynTopoRand.seed(0);
    this.rand.seed(0);

    let i = 0;
    let lastps;

    if (!this.modalRunning) {
      let mesh = ctx.mesh || ctx.tetmesh;
      let brush = this.inputs.brush.getValue();

      let haveOrigData = PaintOpBase.needOrig(brush);

      if (haveOrigData) {
        this._checkOrig(ctx);
      }

      if (mesh) {
        this.getBVH(mesh);
      }
    }

    for (let ps of this.inputs.samples) {
      this.execDotWithMirror(ctx, ps, lastps);
      lastps = ps;
    }

    /*
    for (let p of this.inputs.points) {
      this.execDot(ctx, p, this.inputs.vecs.getListItem(i), this.inputs.extra.getListItem(i), lastp);
      lastp = p;
      i++;
    }*/

    window.redraw_viewport(true);
  }

  getOrigCo(mesh, v, cd_grid, cd_orig) {
    let gset = this._undo.gset;
    let gmap = this._undo.gmap;
    let vmap = this._undo.vmap;

    if (cd_grid >= 0 && mesh.eidMap.has(v.loopEid)) {
      let l = mesh.eidMap.get(v.loopEid);
      let grid = l.customData[cd_grid];

      if (grid instanceof Grid) {
        let gdimen = grid.dimen;
        let id = v.loopEid*gdimen*gdimen + v.index;

        //let execDot set orig data
        if (!gset.has(id)) {
          return v;
        }
      } else {
        if (!gmap.has(l)) {
          return v;
        }
      }
    } else {
      //let execDot set orig data
      if (!vmap.has(v.eid)) {
        return v;
        //v.customData[cd_orig].value.load(v);
        //vmap.set(v.eid, new Vector3(v));
      }
    }

    //ok, we have valid orig data? return it
    return v.customData[cd_orig].value;
  }

  calcNormalVariance(mesh, bvh, co, radius) {
    let tris = bvh.closestTris(co, radius);

    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    console.log(tris);
    //how much do normals cancel each other out?
    let n = new Vector3();
    let tan = new Vector3();
    let tot = 0;

    let tan2 = new Vector3();

    let cd_curv = getCurveVerts(mesh);
    let cd_fset = getFaceSets(mesh, false);

    for (let t of tris) {
      if (!t.v1) {
        continue;
      }

      let cv = t.v1.customData[cd_curv];
      cv.update(t.v1, cd_cotan, cd_fset);

      //tan2.load(cv.tan).normalize();
      tan.addFac(cv.tan, t.area);
      n.addFac(t.no, t.area);

      tot += t.area;
    }

    if (!tot) {
      return undefined;
    }

    tan.mulScalar(1.0/tot);
    n.mulScalar(1.0/tot);

    console.log(n.vectorLength(), tan.vectorLength(), tan);

    return {
      n,
      t: tan
    }
  }

  sampleNormal(ctx, mesh, bvh, p, radius) {
    let vs = bvh.closestVerts(p, radius);

    let no = new Vector3();

    for (let v of vs) {
      no.add(v.no);
    }

    no.normalize();
    return no;
  }

  execDot(ctx, ps, lastps) {
    for (let iter of this.execDot_task(ctx, ps, lastps)) {

    }
  }

  * execDot_task(ctx, ps, lastps) {//ctx, p3, vec, extra, lastp3 = p3) {
    let brush = this.inputs.brush.getValue();
    let falloff = brush.falloff;
    let falloff2 = brush.flag & BrushFlags.USE_LINE_CURVE ? brush.falloff2 : brush.falloff;
    let haveTex = brush.texUser.texture !== undefined;
    let texUser = brush.texUser;
    let texScale = 1.0;
    let tex = brush.texUser.texture;

    if (this.inputs.brush.getValue().tool === SculptTools.GRAB) {
      this._ensureGrabEidMap(ctx);
    }

    let ob = ctx.object;
    let obmat = ob.outputs.matrix.getValue();
    let mesh = ob.data;

    const DRAW                                                            = SculptTools.DRAW,
          SHARP                                                           = SculptTools.SHARP,
          FILL                                                            = SculptTools.FILL,
          SMOOTH                                                          = SculptTools.SMOOTH,
          CLAY                                                            = SculptTools.CLAY,
          SCRAPE                                                          = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH                                                    = SculptTools.PAINT_SMOOTH,
          GRAB                                                            = SculptTools.GRAB,
          COLOR_BOUNDARY                                                  = SculptTools.COLOR_BOUNDARY,
          MASK_PAINT                                                      = SculptTools.MASK_PAINT,
          WING_SCRAPE                                                     = SculptTools.WING_SCRAPE,
          PINCH                                                           = SculptTools.PINCH,
          TOPOLOGY                                                        = SculptTools.TOPOLOGY,
          DIRECTIONAL_FAIR                                                = SculptTools.DIRECTIONAL_FAIR,
          SLIDE_RELAX                                                     = SculptTools.SLIDE_RELAX,
          FACE_SET_DRAW                                                   = SculptTools.FACE_SET_DRAW;

    if (!ctx.object || !(ctx.object.data instanceof Mesh || ctx.object.data instanceof TetMesh)) {
      console.log("ERROR!");
      return;
    }

    let mode = this.inputs.brush.getValue().tool;
    let haveOrigData = PaintOpBase.needOrig(brush);

    let drawFaceSet = this.inputs.drawFaceSet.getValue();
    const cd_fset = getFaceSets(mesh, mode === FACE_SET_DRAW);

    let undo = this._undo;
    let vmap = undo.vmap;
    let gset = undo.gset;
    let gmap = undo.gmap;
    let gdata = undo.gdata;

    let mres, oldmres;

    let bvh = this.getBVH(mesh);
    let vsw;

    bvh.checkCD();

    /* test deforming base (well, level 1) of grid but displaying full thing
    if (GridBase.meshGridOffset(mesh) >= 0) {
      let cd_grid = GridBase.meshGridOffset(mesh);
      let layer = mesh.loops.customData.flatlist[cd_grid];

      mres = mesh.loops.customData.getLayerSettings(layer.typeName);
      if (mres) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          let co = new Vector3();

          for (let p of grid.points) {
            co.load(p);
            let tot = 1;

            for (let pr of p.bRing) {
              co.add(pr);
              tot++;
            }

            co.mulScalar(1.0 / tot);
            p.load(co);
          }

          grid.recalcFlag |= QRecalcFlags.NORMALS|QRecalcFlags.TOPO|QRecalcFlags.NEIGHBORS;
          grid.update(mesh, l, cd_grid);
        }

        oldmres = mres.copy();

        mres.flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
        mres.depthLimit = 1;

        mesh.regenBVH();
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          grid.recalcFlag |= QRecalcFlags.NORMALS|QRecalcFlags.TOPO|QRecalcFlags.NEIGHBORS;
          grid.update(mesh, l, cd_grid);
        }
        bvh = mesh.getBVH(false);
      }
    }
    //*/

    let pinch = ps.pinch;
    let radius = ps.radius;
    let strength = ps.strength;

    if (mode === PINCH) {
      pinch = 1.0; //strength defines pinch in this case
    }

    let smoothProj = ps.smoothProj;
    let cd_mask;
    let haveQuadEdges = brush.dynTopo.flag & DynTopoFlags.DRAW_TRIS_AS_QUADS;

    let haveGrids = bvh.cd_grid >= 0;
    let cd_grid = bvh.cd_grid;

    if (haveGrids) {
      cd_mask = mesh.loops.customData.getLayerIndex("mask");
    } else {
      cd_mask = mesh.verts.customData.getLayerIndex("mask");
    }


    let cd_curv = -1;
    let cd_dyn_vert = getDynVerts(mesh);

    let rakeCurveFac = 0.0;

    const doCurvRake = ENABLE_CURVATURE_RAKE && (!haveGrids && (ps.rake > 0.0 || ps.pinch > 0.0 || mode === WING_SCRAPE));
    const rakeCurvePosXOnly = brush.flag & BrushFlags.CURVE_RAKE_ONLY_POS_X;

    let sharp = ps.sharp;
    if (ps.invert && mode === TOPOLOGY) {
      sharp += ps.autosmooth + Math.abs(ps.strength);
      ps.autosmooth = 0.0;
    } else if (ps.invert && mode === SMOOTH) {
      sharp = Math.abs(ps.strength);
    }

    if (doCurvRake || sharp !== 0.0 || this.hasCurveVerts(brush)) {
      cd_curv = getCurveVerts(mesh);
      rakeCurveFac = brush.rakeCurvatureFactor;
    }

    if (mode === MASK_PAINT && cd_mask < 0) {
      if (haveGrids) {
        mesh.verts.addCustomDataLayer("mask");
        GridBase.syncVertexLayers(mesh);

        cd_mask = mesh.loops.customData.getLayerIndex("mask");
      } else {
        cd_mask = mesh.verts.addCustomDataLayer("mask").index;
      }
    }

    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    let isPaintMode = mode === PAINT || mode === PAINT_SMOOTH || mode === FACE_SET_DRAW;
    let isMaskMode = mode === MASK_PAINT;

    let doTopo = mode === TOPOLOGY || (brush.dynTopo.flag & DynTopoFlags.ENABLED);
    doTopo = doTopo && (!haveGrids || !this.inputs.useMultiResDepth.getValue());
    doTopo = doTopo && !(isPaintMode || isMaskMode);
    doTopo = doTopo && !(mesh instanceof TetMesh);

    //console.error("strokeS", ps.strokeS, ps.dstrokeS);

    if (brush.dynTopo.spacingMode !== BrushSpacingModes.EVEN && ps.isInterp) {
      doTopo = false;
    } else if (mode !== SNAKE && brush.dynTopo.spacingMode === BrushSpacingModes.EVEN) {
      //enforce dyntopo spacing

      let p1 = lastps ? lastps.strokeS : 0.0;
      let p2 = ps.strokeS;

      let spacing = 0.5*brush.dynTopo.spacing;

      p1 = ~~(p1/spacing);
      p2 = ~~(p2/spacing);

      if (lastps && p1 === p2) {
        doTopo = false;
      }
    }

    let planeoff = ps.planeoff;
    let pinchpower = 1.0;
    let pinchmul = 1.0;

    let isplane = false;

    let vec = new Vector3(ps.vec);
    let planep = new Vector3(ps.p);

    let cd_disp = mesh.verts.customData.getLayerIndex("displace");
    let esize = ps.esize;

    let w = ps.p[3];

    if (haveTex) {
      texScale *= 10.0/w;
    }

    switch (mode) {
      case SMOOTH:
      case PAINT_SMOOTH:
        vsw = Math.abs(strength) + ps.autosmooth;
        break;
      default:
        vsw = ps.autosmooth; //autosmooth
        break;
    }

    let wvec1 = new Vector3();
    let wvec2 = new Vector3();
    let wtan = new Vector3();
    let wtmp0 = new Vector3();
    let wtmp1 = new Vector3();
    let wtmp2 = new Vector3();
    let wtmp3 = new Vector3();
    let wno = new Vector3();
    let woff = planeoff;
    let wplanep1 = new Vector3();
    let wplanep2 = new Vector3();

    if (mode === WING_SCRAPE) {
      isplane = true;

      pinchpower = 3.0;
      pinchmul = 0.25;

      //sample normal
      let no = this.sampleNormal(ctx, mesh, bvh, ps.p, radius*0.25);
      let tan = new Vector3(ps.dp);

      let d = no.dot(tan);
      tan.addFac(no, -d).normalize();

      let len = vec.vectorLength();
      let quat = new Quat();

      let th = Math.PI*0.2;
      quat.axisAngleToQuat(tan, -th);
      quat.normalize();
      let mat = quat.toMatrix();

      wvec1.load(no)//.mulScalar(len);
      wvec1.multVecMatrix(mat);

      quat.axisAngleToQuat(tan, th);
      quat.normalize();
      mat = quat.toMatrix();

      wvec2.load(no)//.mulScalar(len);
      wvec2.multVecMatrix(mat);

      wno.load(no);
      wtan.load(tan);

      //planep.load(ps.p).addFac(wno, woff);

      woff = ps.planeoff*0.25;

      wplanep1.load(ps.p).addFac(wvec1, -0.005);
      wplanep2.load(ps.p).addFac(wvec2, -0.005);

      //wplanep1.addFac(wno, woff);
      //wplanep2.addFac(wno, woff);

      planeoff = 0;
      //vec.multVecMatrix(mat);
      //vec.load(tan).mulScalar(len);
      //
    } else if (mode === MASK_PAINT) {
      strength = Math.abs(strength);
    } else if (mode === SCRAPE) {
      planeoff += -1.0;
      //strength *= 5.0;
      isplane = true;
    } else if (mode === FILL) {
      planeoff -= 0.1;

      strength *= 0.5;
      isplane = true;
    } else if (mode === CLAY) {
      planeoff += 3.25;

      //strength *= 2.0;

      isplane = true;
    } else if (mode === SMOOTH) {
      isplane = !(brush.flag & BrushFlags.MULTIGRID_SMOOTH);
      isplane = isplane && (brush.flag & BrushFlags.PLANAR_SMOOTH);

      if (brush.flag & BrushFlags.MULTIGRID_SMOOTH) {
        strength *= 0.15;
      }

      //if (1 || (brush.flag & BrushFlags.MULTIGRID_SMOOTH)) {
      radius *= 1.0 + vsw*vsw;

      //}
    } else if (mode === PAINT) {

    } else if (mode === SHARP) {
      let t1 = new Vector3(ps.dp);

      //isplane = true;
      //planeoff += 3.0;
      //strength *= 2.0;
    } else if (mode === GRAB) {
      strength *= 5.0;
      radius *= this.inputs.grabRadiusFactor.getValue();

      isplane = false;
    } else if (mode === SNAKE || mode === SLIDE_RELAX || mode === FACE_SET_DRAW) {
      isplane = false;
    }

    if (ps.invert) {//isplane && strength < 0) {
      //strength = Math.abs(strength);
      if (isplane) {
        planeoff = -planeoff;
      } else if (mode !== SMOOTH && mode !== PAINT_SMOOTH) {
        strength *= -1;
      }
    }

    let updateflag = BVHFlags.UPDATE_DRAW;
    if (mode !== PAINT && mode !== PAINT_SMOOTH) {
      updateflag |= BVHFlags.UPDATE_NORMALS;
    } else {
      updateflag |= BVHFlags.UPDATE_COLORS;
    }

    let cd_orig = -1;

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let sym = mesh.symFlag;

    if (mode !== SNAKE && mode !== SLIDE_RELAX) {
      //let w2 = Math.pow(Math.abs(w), 0.5)*Math.sign(w);
      let w2 = Math.pow(Math.abs(radius), 0.5)*Math.sign(radius);

      planeoff *= w2;

      vec.mulScalar(strength*0.1*w2);
    }


    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let nvec2 = new Vector3(nvec);

    planep.addFac(nvec, planeoff*radius*0.5);

    if (0 && mode === SHARP) {
      let q = new Quat();
      let pth = Math.PI*0.35;

      q.axisAngleToQuat(nvec, pth);
      let mat = q.toMatrix();

      nvec.multVecMatrix(mat);

      q.axisAngleToQuat(nvec2, -pth);
      mat = q.toMatrix();

      nvec2.multVecMatrix(mat);
    }

    let p3 = new Vector3(ps.p);

    let useLinePlane = brush.flag & BrushFlags.LINE_FALLOFF;
    if (ps.dp.dot(ps.dp) === 0.0) {
      useLinePlane = false;
    }

    let linePlane = new Vector3(ps.dp).cross(ps.viewPlane).normalize();
    let linePlane2 = new Vector3(ps.dp);

    //move into view plane
    let d = linePlane2.dot(ps.viewPlane);
    linePlane2.addFac(ps.viewPlane, -d).normalize();

    let useSmoothMemo = vsw < 0.75 && GridBase.meshGridOffset(mesh) < 0;

    let smemo;

    if (useSmoothMemo) {
      smemo = new SmoothMemoizer(mesh, -1);
      smemo.noDisp = true;
      smemo.projection = smoothProj;
      smemo.smoothGen = Math.random();
      smemo.initGen = Math.random();
      smemo.start(false, -1, true);
      smemo.memoize = !(window.noMemoize ?? false);
    }

    //query bvh tree
    let vs;
    let gd;
    let signs = [];
    let goffs = [];
    let gidxs = [];

    let bvhRadius = radius;
    const smoothRadiusMul = brush.smoothRadiusMul;

    if (smoothRadiusMul !== 1.0) {
      bvhRadius *= smoothRadiusMul;
    }

    if (mode === GRAB && doTopo) {
      let gdists = this.grabDists = [];

      let co = this.inputs.grabCo.getValue(); //ps.origp;

      vs = bvh.closestOrigVerts(co, bvhRadius);
      console.log("VS", vs);
      gd = [];

      let axismap = SymAxisMap;
      let sym = this.inputs.symmetryAxes.getValue();

      let co2 = new Vector3();
      let sign = new Vector3();
      let add = new Vector3();

      for (let v of vs) {
        let dis = v.customData[cd_orig].value.vectorDistance(co);
        let offs = axismap[sym];

        add.zero();
        sign[0] = sign[1] = sign[2] = 1.0;

        if (sym && offs) {
          for (let off of offs) {
            for (let i = 0; i < 3; i++) {
              if (off[i] > 0) {
                continue;
              }

              //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
              let f = Math.abs(co[i]) + 0.00001;
              let ratio = radius/f;

              //add[i] = -Math.abs(co[i]);
              sign[i] *= ratio;
            }
          }
        }

        if (offs) {
          for (let off of offs) {
            co2.load(co).mul(off);

            let dis2 = v.vectorDistance(co2);
            if (dis2 < dis) {
              dis = dis2;
              sign.load(off);
              add.zero();

              for (let i = 0; i < 3; i++) {
                if (off[i] > 0) {
                  continue;
                }

                //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
                let f = Math.abs(co2[i]) + 0.00001;
                let ratio = radius/f;

                //add[i] = -Math.abs(co[i]);
                sign[i] *= ratio;
              }

              dis = dis2;
            }
          }
        }

        let i = gd.length;

        gd.push(v.eid);
        gd.push(0);
        gd.push(dis);

        gd.push(sign[0]);
        gd.push(sign[1]);
        gd.push(sign[2]);

        gd.push(add[0]);
        gd.push(add[1]);
        gd.push(add[2]);

        gd.push(0);
        gd.push(0);
        gd.push(0);

        let jtot = GTOT - (gd.length - i);

        for (let j = 0; j < jtot; j++) {
          gd.push(0);
        }

        signs.push(sign[0]);
        signs.push(sign[1]);
        signs.push(sign[2]);

        gdists.push(dis);

        goffs.push(0);
        goffs.push(0);
        goffs.push(0);

        gidxs.push(i);
      }
    } else if (mode === GRAB) {
      let gmap = this.grabEidMap;
      gd = this.inputs.grabData.getValue();
      vs = new Set();

      if (haveGrids) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let leid = gd[i], peid = gd[i + 1], dis = gd[i + 2];

          let v = gmap.get(peid);
          if (!v) {
            console.warn("Missing grid vert " + peid);
            throw new Error("missing grid vert");
            continue;
          }

          let sx = gd[i + 3], sy = gd[i + 4], sz = gd[i + 5];
          signs.push(sx);
          signs.push(sy);
          signs.push(sz);

          let ox = gd[i + 6], oy = gd[i + 7], oz = gd[i + 8];

          goffs.push(ox);
          goffs.push(oy);
          goffs.push(oz);

          vs.add(v);
          gidxs.push(i);
        }
      } else {
        for (let i = 0; i < gd.length; i += GTOT) {
          let v = mesh.eidMap.get(gd[i]);

          if (!v) {
            console.warn("Missing vert " + gd[i]);
            //signs.length += 3;
            //goffs.length += 3;
            //vs.push(new Vector3());

            continue;
          }

          let sx = gd[i + 3], sy = gd[i + 4], sz = gd[i + 5];
          signs.push(sx);
          signs.push(sy);
          signs.push(sz);

          let ox = gd[i + 6], oy = gd[i + 7], oz = gd[i + 8];

          goffs.push(ox);
          goffs.push(oy);
          goffs.push(oz);

          vs.add(v);
          gidxs.push(i);
        }
      }
    } else {
      if (brush.flag & BrushFlags.SQUARE) {
        let mat = new Matrix4();

        let linePlane3 = new Vector3(linePlane);
        let d = linePlane3.dot(ps.viewPlane);
        linePlane3.addFac(ps.viewPlane, -d).normalize();

        let bad = ps.dp.dot(ps.dp) < 0.00001 || linePlane3.dot(linePlane3) < 0.00001;
        bad = bad || linePlane3.vectorDistanceSqr(ps.viewPlane) < 0.0001;
        bad = bad || Math.abs(linePlane3.dot(ps.viewPlane)) > 0.001;

        if (bad) {
          return; //do nothing
        }

        ps.viewPlane.normalize();

        mat.makeNormalMatrix(ps.viewPlane, linePlane3);
        mat.invert();

        vs = bvh.closestVertsSquare(p3, bvhRadius, mat);
      } else {
        vs = bvh.closestVerts(p3, bvhRadius);
      }
    }

    if (doTopo && !haveGrids) {
      let log = this._undo.log;
      log.checkStart(mesh);

      for (let v of vs) {
        log.ensure(v);

        for (let v2 of v.neighbors) {
          log.ensure(v2);
        }
      }
    }


    if (mode === SNAKE || mode === SLIDE_RELAX) {
      p3.zero();
      let tot = 0.0;

      for (let v of vs) {
        p3.add(v);
        tot++;
      }

      if (tot) {
        p3.mulScalar(1.0/tot);
      }
    }

    let rmat = new Matrix4();

    let firstps = this.inputs.samples.data[0];

    if ((mode === SNAKE || mode === SLIDE_RELAX) && lastps) {
      let t1 = new Vector3(ps.dp).normalize();
      let t2 = new Vector3(lastps.dp).normalize();
      let t3 = new Vector3(t2).cross(t1);
      let c = lastps.p;

      //XXX not working
      if (0) { //(1 || t1.dot(t2) > 0.05) {
        let quat = new Quat();

        t1.cross(ps.viewPlane).normalize();
        t2.cross(ps.viewPlane).normalize();

        let th = t1.dot(t2)*0.99999;
        th = Math.acos(th);

        if (t3.dot(ps.viewPlane) < 0) {
          th = -th;
        }

        //th *= 0.75;
        //th *= 1.25;
        th *= 0.98;

        quat.axisAngleToQuat(ps.viewPlane, th);

        let tmat = new Matrix4();
        tmat.makeIdentity().translate(c[0], c[1], c[2]);

        quat.toMatrix(rmat);
        rmat.preMultiply(tmat);

        tmat.makeIdentity().translate(-c[0], -c[1], -c[2]);
        rmat.multiply(tmat);
      }
    } else if (0) { //mode === GRAB && firstps && firstps !== ps && lastps) {
      let grabco = this.inputs.grabCo.getValue();

      let t1 = new Vector3(ps.p).sub(grabco);
      let d = t1.dot(ps.viewPlane);
      t1.addFac(ps.viewPlane, -d).normalize();

      let t2 = new Vector3(lastps.p).sub(grabco);
      d = t2.dot(ps.viewPlane);
      t2.addFac(ps.viewPlane, -d).normalize();

      let axis = new Vector3(t1).cross(t2).normalize();

      let quat = new Quat();

      //grabco = ps.origp;

      let th = t1.dot(t2);
      th = Math.acos(th*0.9999)*0.1;
      if (axis.dot(ps.viewPlane) < 0.0) {
        th = -th;
      }

      th += this.inputs.grabTh.getValue();

      this.inputs.grabTh.setValue(th);

      if (isNaN(th)) {
        console.warn("NaN!", "th", th, "t1", t1, "t2", t2);
        th = 0.0;
      }

      console.log(grabco);

      axis = ps.viewPlane;
      quat.axisAngleToQuat(axis, -th);
      quat.toMatrix(rmat);

      //let tmat = new Matrix4();
      //tmat.translate(-grabco[0], -grabco[1], -grabco[2]);

      //rmat.multiply(tmat);
      //tmat.invert();
      //rmat.preMultiply(tmat);
      /*

      on factor;
      load_package avector;

      procedure bez(a, b);
        a + (b - a)*s;

      lin := bez(k1, k2);
      quad := bez(lin, sub(k2=k3, k1=k2, lin));
      cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));

      dis := 1;

      procedure w(x, y, z, dis);
        sub(s=(1.0 - (x**2 + y**2 + z**2) / (dis**2)), quad);

      dx := df(w(x,y,z, dis), x);
      dy := df(w(x,y,z, dis), y);
      dz := df(w(x,y,z, dis), z);

      f1 := ((dx-1.0)*dis2)**2 + ((dy-1.0)*dis2)**2 + ((dz-1.0)*dis2)**2;
      comment: f1 := (dx*dy*dz)**2 - vol;

      f2 := int(f1, x);
      f2 := sub(x=0.5, f2) - sub(x=-0.5, f2);
      f3 := int(f2, y);
      f3 := sub(y=0.5, f3) - sub(y=-0.5, f3);
      f4 := int(f3, z);
      f4 := sub(z=0.5, f4) - sub(z=-0.5, f4);

      on fort;

      f4;
      df(f4, k1);
      df(f4, k2);
      df(f4, k3);
      df(f4, k4);

      off fort;

      ks := {0, 0, 1, 1};

      procedure test(ks);
        sub(k1=part(ks, 1), k2=part(ks, 2), k3=part(ks, 3), k4=part(ks, 4), f4);
       */

    } else if (0 && mode === GRAB) {
      function f4(k1, k2, k3, k4, dis2) {
        return ((583.0*k1**2 + 860.0*k1*k2 - 2026.0*k1*k3 + 988.0*k2**2 - 2836.0*k2*k3 + 2431.0*k3**2 + 3780.0)*dis2**2)/1260.0;
      }

      function dk1(k1, k2, k3, k4, dis2) {
        return ((430.0*k2 - 1013.0*k3 + 583.0*k1)*dis2**2)/630.0;
      }

      function dk2(k1, k2, k3, k4, dis2) {
        return ((494.0*k2 - 709.0*k3 + 215.0*k1)*dis2**2)/315.0;
      }

      function dk3(k1, k2, k3, k4, dis2) {
        return (-(1418.0*k2 - 2431.0*k3 + 1013.0*k1)*dis2**2)/630.0;
      }

      function dk4(k1, k2, k3, k4, dis2) {
        //return 0.0;
      }

      let cv = brush.falloff.getGenerator("EquationCurve");
      let cv2 = ctx.toolmode.getBrush().falloff.getGenerator("EquationCurve");

      let ks = [0, 0, 1];
      let gs = [0, 0, 0];

      //console.log("concave", ps.concaveFilter);
      let dis2 = Math.max(ps.concaveFilter, 0.0001);

      //console.log("\n");
      /*
      for (let i=0; i<31; i++) {
        let r1 = f4(ks[0], ks[1], ks[2], 0.0, dis2);
        if (i % 10 === 0) {
          console.log("ERR", r1);
        }

        gs[0] = dk1(ks[0], ks[1], ks[2], 0.0, dis2);
        gs[1] = dk2(ks[0], ks[1], ks[2], 0.0, dis2);
        gs[2] = dk3(ks[0], ks[1], ks[2], 0.0, dis2);

        let totg = gs[0]**2 + gs[1]**2 + gs[2]**2;

        if (totg === 0.0) {
          break;
        }

        let fac = 0.1;
        //r1 /= totg;

        fac /= Math.sqrt(totg);

        for (let i=0; i<3; i++) {
          ks[i] += -gs[i]*fac;
        }
      }*/

      let rand = new util.MersenneRandom();

      function errf(k1, k2, k3, dis2) {

      }

      for (let i = 0; i < 31; i++) {
        let s = Math.random();


      }

      let expr = "((k1 - k2)*x - k1 - ((k2 - k3)*x - k2))*x - ((k1 - k2)*x - k1)";
      expr = expr.replace(/k1/g, "" + ks[0]).replace(/k2/g, "" + ks[1]).replace(/k3/g, "" + ks[2]);

      cv.equation = expr;
      cv.update();
      cv.redraw();

      cv2.equation = expr;
      cv2.update();
      cv2.redraw();
    }


    let _tmp = new Vector3();

    let vsmooth, gdimen, cd_color, have_color;
    let haveQuadTreeGrids = false;

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        if (grid instanceof QuadTreeGrid) {
          haveQuadTreeGrids = true;
        } else if (grid instanceof KdTreeGrid) {
          haveQuadTreeGrids = true;
        }

        break;
      }
    }

    let origset = new WeakSet();
    let mmap = this._undo.mmap;
    let fsetmap = this._undo.fsetmap;

    function doUndo(v) {
      if (!haveGrids && mode === MASK_PAINT && cd_mask >= 0 && !mmap.has(v.eid)) {
        mmap.set(v.eid, v.customData[cd_mask].value);
      }

      if (mode === FACE_SET_DRAW && !vmap.has(v.eid)) {
        for (let f of v.faces) {
          if (!fsetmap.has(f.eid)) {
            let fset = f.customData[cd_fset].value;

            fsetmap.set(f.eid, fset);
          }
        }

        vmap.set(v.eid, new Vector3(v));
      }

      if (doTopo && !haveGrids) {
        if (haveOrigData && !vmap.has(v.eid)) {
          let data = v.customData[cd_orig].value;

          data.load(v);

          if (isPaintMode && have_color) {
            vmap.set(v.eid, new Vector4(v.customData[cd_color].color));
          } else {
            vmap.set(v.eid, new Vector3(data));
          }
        }

        return;
      }

      if (!haveGrids && !vmap.has(v.eid)) {
        if (haveOrigData) {
          v.customData[cd_orig].value.load(v);
        }

        if (isPaintMode && have_color) {
          vmap.set(v.eid, new Vector4(v.customData[cd_color].color));
        } else if (!isPaintMode) {
          vmap.set(v.eid, new Vector3(v));
        }
      } else if (haveQuadTreeGrids) {
        let node = v.customData[cd_node];
        v.flag |= MeshFlags.UPDATE;

        if (node.node) {
          node.node.flag |= updateflag;
        }

        if (v.loopEid !== undefined) {
          let l = mesh.eidMap.get(v.loopEid);

          if (l && l instanceof Loop && l.eid === v.loopEid) {
            let grid = l.customData[cd_grid];

            if (!gmap.has(l)) {
              if (haveOrigData) {
                for (let p of grid.points) {
                  p.customData[cd_orig].value.load(p);
                }
              }

              grid.recalcFlag |= QRecalcFlags.MIRROR | QRecalcFlags.NORMALS;
              grid.update(mesh, l, cd_grid);

              bvh.updateGridLoops.add(l);

              let gridcpy = new grid.constructor();
              grid.copyTo(gridcpy, true);

              gmap.set(l, gridcpy)
              grid.update(mesh, l, cd_grid);
              grid.relinkCustomData();
            } else {
              //grid.recalcFlag |= QRecalcFlags.MIRROR|QRecalcFlags.NORMALS;
              //bvh.updateGridLoops.add(l);
            }
          }
        }
      } else if (haveGrids) {
        let id = v.loopEid*gdimen*gdimen + v.index;

        if (!gset.has(id)) {
          if (haveOrigData) {
            v.customData[cd_orig].value.load(v);
          }

          gset.add(id);

          let gi = gdata.length;
          gdata.length += UGTOT;

          gdata[gi++] = v.loopEid;
          gdata[gi++] = v.index;

          if (isPaintMode) {
            let c = v.customData[cd_color].color;
            gdata[gi++] = c[0];
            gdata[gi++] = c[1];
            gdata[gi++] = c[2];
            gdata[gi++] = c[3];
          } else if (isMaskMode) {
            let mask = 1.0;

            if (cd_mask >= 0) {
              mask = v.customData[cd_mask].value;
            }

            gdata[gi++] = mask;
          } else {
            gdata[gi++] = v[0];
            gdata[gi++] = v[1];
            gdata[gi++] = v[2];
            gdata[gi++] = v.no[0];
            gdata[gi++] = v.no[1];
            gdata[gi++] = v.no[2];
          }
        }
      }
    }

    function doGridBoundary(v) {
      if (v.eid < 0) {
        console.warn("eek!", v);
        return;
      }

      if (!v.bLink || !v.bLink.v1) {
        return;
      }

      if (v.bLink.v1.eid < 0) {
        console.warn("eek2!", v.bLink.v1);
        return;
      }

      if (v.bLink.v2 && v.bLink.v2.eid < 0) {
        console.warn("eek3!", v.bLink.v2);
        return;
      }

      //return;
      doUndo(v.bLink.v1);

      if (v.bLink.v2) {
        doUndo(v.bLink.v2);
      }

      if (isPaintMode && have_color) {
        let c1 = v.customData[cd_color].color;
        let c2 = v.bLink.getColor(cd_color);

        c1.interp(c2, 0.5);

        //if (isNaN(c1.dot(c1))) {
        //  c1.load(c2);
        //}

        if (!v.bLink.v2) {
          let c2 = v.bLink.v1.customData[cd_color].color;
          c2.load(c1);
        }
      } else if (!isPaintMode) {
        let co = v.bLink.get();

        if (!v.bLink.v2) {
          v.interp(co, 0.5);
          v.bLink.v1.load(v);
        } else {
          v.load(co);
        }
      }


      let node = v.bLink.v1.customData[cd_node].node;
      if (node) {
        node.setUpdateFlag(updateflag);
      }

      if (v.bLink.v2) {
        node = v.bLink.v2.customData[cd_node].node;

        if (node) {
          node.setUpdateFlag(updateflag)
        }
      }
    }

    let colorfilter;
    if (bvh.cd_grid >= 0) {
      cd_color = mesh.loops.customData.getLayerIndex("color");
    } else {
      cd_color = mesh.verts.customData.getLayerIndex("color");
    }
    have_color = cd_color >= 0;

    let smoothmap = new Map();

    let _gridVertStitch = (v) => {
      if (v.eid < 0) {
        console.warn("eek!", v);
        return;
      }

      let first = true;

      let update = false;
      let co = v;

      for (let vr of v.bRing) {
        if (vr.eid < 0) {
          console.warn("eek!", v, vr);
          continue;
        }

        if (vr.bLink && vr.bLink.v1 && vr.bLink.v2) {
          co = vr;
        }
      }

      for (let vr of v.bRing) {//v.neighbors) {
        if (vr.eid < 0) {
          continue;
        }

        doUndo(vr);
        //continue;

        let update = first || vr.vectorDistanceSqr(co) > 0.00001;

        if (first) {
          vr.interp(v, 0.5);
          co.load(vr, true);
          doGridBoundary(co);

          first = false;
        } else {
          vr.load(co, true);
        }

        if (1 || update) {
          let node = vr.customData[cd_node].node;

          if (node) {
            node.setUpdateFlag(updateflag);
          }

          doGridBoundary(vr);
        }
      }

      doGridBoundary(v);
    }

    let gridVertStitch = (v) => {
      //return;

      _gridVertStitch(v);

      return;
      for (let v2 of v.neighbors) {
        _gridVertStitch(v2);
      }

      doGridBoundary(v);

      for (let v2 of v.bRing) {
        if (v2.eid >= 0) {
          doGridBoundary(v2);
        }
      }
    }

    let vsharp;

    if (haveGrids) {
      colorfilter = colorfilterfuncs[1];

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        gdimen = grid.dimen;
        break;
      }

      let _tmp4 = new Vector3();

      vsharp = (v, fac) => {
        //implement me!
      }

      vsmooth = (v, fac) => {
        _tmp.zero();
        let totw = 0.0;

        /*
        for (let vr of v.bRing) {//v.neighbors) {
          doUndo(vr);
          vr.interp(v, 0.5);
          v.load(vr, true);
        }

        for (let vr of v.bRing) {
          for (let v2 of vr.neighbors) {
            if (v2 === vr || v2.loopEid !== vr.loopEid) {
              continue;
            }

            let w = 1.0;

            if (smoothProj !== 0.0) {
              let w2 = v2.vectorDistanceSqr(v);
              w += (w2 - w)*smoothProj;

              let t = _tmp4.load(v2).sub(v);
              let d = t.dot(v.no);

              t.addFac(v.no, -d).add(v);

              _tmp.addFac(t, smoothProj*w);
              _tmp.addFac(v2, (1.0 - smoothProj)*w);
            } else {
              _tmp.addFac(v2, w);
            }

            totw += w;
          }
        }//*/

        for (let v2 of v.neighbors) {
          let w = 1.0;

          if (v2.loopEid !== v.loopEid) {
            continue;
          }

          if (smoothProj !== 0.0) {
            let w2 = v2.vectorDistanceSqr(v);
            w += (w2 - w)*smoothProj;

            let t = _tmp4.load(v2).sub(v);
            let d = t.dot(v.no);

            t.addFac(v.no, -d).add(v);

            _tmp.addFac(t, smoothProj*w);
            _tmp.addFac(v2, (1.0 - smoothProj)*w);
          } else {
            _tmp.addFac(v2, w);
          }

          totw += w;
        }

        if (totw !== 0.0) {
          _tmp.mulScalar(1.0/totw);
          v.interp(_tmp, fac);
        }

        gridVertStitch(v);

        /*
        for (let v2 of v.bRing) {
          v2[0] = v[0];
          v2[1] = v[1];
          v2[2] = v[2];
        }//*/
      };
    } else if (ps.autosmoothInflate === 0.0 && smoothProj === 0.0 && !(brush.flag & BrushFlags.MULTIGRID_SMOOTH)) {
      colorfilter = colorfilterfuncs[0];
      let _tmp2 = new Vector3();
      let _tmp3 = new Vector3();
      let _tmp4 = new Vector3();

      let velfac; // = window.dd !== undefined ? window.dd : 0.75;
      if (mode !== GRAB) {
        if (mode === SMOOTH) {
          velfac = (strength*0.5 + 0.5);
        } else {
          velfac = (ps.autosmooth*0.5 + 0.5);
        }

        velfac *= 0.5;
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      } else {
        velfac = 0.5;
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      }

      const quadedge = haveQuadEdges ? MeshFlags.QUAD_EDGE : 0;

      const velfac2 = velfac*0.05;

      vsmooth = function (v, fac) {
        if (mode === SMOOTH && ps.invert) {
          vsharp(v, fac);
          return;
        }

        let vel = v.customData[cd_node].vel;

        _tmp2.zero();
        let count = 0;
        let totw = 0.0;

        for (let e of v.edges) {
          if (e.flag & quadedge) {
            continue;
          }

          //let v2 = e.otherVertex(v);
          let v2 = v === e.v1 ? e.v2 : e.v1;

          _tmp2[0] += v2[0];
          _tmp2[1] += v2[1];
          _tmp2[2] += v2[2];

          let vel2 = v2.customData[cd_node].vel;

          //vel2.addFac(vel, velfac2*0.1);

          vel2[0] += (vel[0] - vel2[0])*velfac2;
          vel2[1] += (vel[1] - vel2[1])*velfac2;
          vel2[2] += (vel[2] - vel2[2])*velfac2;

          totw += 1.0;
          count++;
        }

        if (count === 0.0) {
          return;
        }

        _tmp2.mulScalar(1.0/totw);
        _tmp3.load(v);

        v.interp(_tmp2, fac);
        v.addFac(vel, velfac);

        _tmp3.sub(v).negate();
        //vel.interp(_tmp3, 0.5);
        vel.load(_tmp3);
      }
    } else if (!(brush.flag & BrushFlags.MULTIGRID_SMOOTH)) {
      colorfilter = colorfilterfuncs[0];
      let _tmp2 = new Vector3();
      let _tmp3 = new Vector3();
      let _tmp4 = new Vector3();

      let velfac;

      if (mode !== GRAB) {
        if (mode === SMOOTH) {
          velfac = (strength*0.5 + 0.5);
        } else {
          velfac = (ps.autosmooth*0.5 + 0.5);
        }

        velfac *= 0.5;
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      } else {
        velfac = 0.5;
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      }

      const velfac2 = velfac*0.05;

      const quadedge = haveQuadEdges ? MeshFlags.QUAD_EDGE : 0;
      const inflate = ps.autosmoothInflate;

      vsmooth = (v, fac) => {
        if (mode === SMOOTH && ps.invert) {
          vsharp(v, fac);
          return;
        }

        let vel = v.customData[cd_node].vel;

        _tmp2.zero();
        let count = 0;
        let totw = 0.0;
        let avglen = 0.0;

        for (let e of v.edges) {
          if (e.flag & quadedge) {
            continue;
          }

          let v2 = e.otherVertex(v);
          let w = 1.0;
          //w = Math.sqrt(w);
          //w *= w;

          if (smoothProj !== 0.0) {
            let w2 = v2.vectorDistanceSqr(v);
            avglen += w2;

            w += (w2 - w)*smoothProj;

            let t = _tmp4.load(v2).sub(v);
            let d = t.dot(v.no);

            t.addFac(v.no, -d).add(v);

            _tmp2.addFac(t, smoothProj*w);
            _tmp2.addFac(v2, (1.0 - smoothProj)*w);
          } else {
            avglen += v2.vectorDistanceSqr(v);
            _tmp2.addFac(v2, w);
          }

          let vel2 = v2.customData[cd_node].vel;

          vel2.interp(vel, velfac2);
          //vel2.addFac(vel, 0.1*velfac);

          totw += w;
          count++;
        }

        if (count === 0.0) {
          return;
        }

        //let w2 = totw/count*0.1;
        //_tmp2.addFac(v, w2);
        //totw += w2;
        //count++;

        avglen /= count;

        _tmp2.mulScalar(1.0/totw);
        //_tmp2.sub(v);
        //let d = -_tmp2.dot(v.no);
        //let d = _tmp2.vectorLength();
        //_tmp2.add(v);
        _tmp2.addFac(v.no, avglen*inflate*4.0);

        _tmp3.load(v);

        v.interp(_tmp2, fac);
        v.addFac(vel, velfac);

        _tmp3.sub(v).negate();
        vel.interp(_tmp3, 0.5);
      }
    } else {
      colorfilter = colorfilterfuncs[0];

      vsmooth = (v, fac = 0.5) => {
        this.ensureSmoother(mesh);
        smoothmap.set(v, fac/vsw);
      }
    }

    let mat1 = new Matrix4();
    let _tmp4 = new Vector3();
    let _tmp5 = new Vector3();

    let vsmooth_median = (v, fac = 0.5) => {
      let nmat = mat1;

      mat1.makeIdentity();
      mat1.makeNormalMatrix(v.no);
      mat1.transpose();

      let co = _tmp.zero();
      let co2 = _tmp4.zero();
      let co3 = _tmp5.zero();

      let totw = 0.0;

      let val = v.valence;
      if (val < 2) {
        return;
      }

      let list1 = getArrayTemp(val + 1, false);
      let list2 = getArrayTemp(val + 1, false);
      let list3 = getArrayTemp(val + 1, false);

      let vi = 1;

      list1[0] = 0;
      list2[0] = 0;
      list3[0] = 0;

      for (let v2 of v.neighbors) {
        co2.load(v2).sub(v).multVecMatrix(nmat);
        //co2.load(v2).sub(v);

        list1[vi] = co2[0];
        list2[vi] = co2[1];
        list3[vi] = co2[2];
        vi++;

        co3.add(v2);
        totw++;
      }

      list1.sort();
      list2.sort();
      list3.sort();

      let len = list1.length;
      let idx = (len - 1)>>1;

      if (len > 2 && (len & 1) === 0) {
        co[0] = list1[idx]*0.5 + list1[idx + 1]*0.5;
        co[1] = list2[idx]*0.5 + list2[idx + 1]*0.5;
        co[2] = list3[idx]*0.5 + list3[idx + 1]*0.5;
      } else {
        co[0] = list1[idx];
        co[1] = list2[idx];
        co[2] = list3[idx];
      }

      mat1.transpose();

      co.multVecMatrix(mat1);
      co.add(v);

      co3.mulScalar(1.0/totw);
      co.interp(co3, 0.5);

      v.interp(co, fac);
    }

    //vsmooth = vsmooth_median;

    if (!haveGrids) {
      let _tmp0 = new Vector3();
      let _tmp1 = new Vector3();
      let _tmp2 = new Vector3();
      let _tmp3 = new Vector3();
      let _tmp4 = new Vector3();

      vsharp = (v, fac) => {
        let cv = v.customData[cd_curv];
        cv.check(v, cd_cotan, undefined, cd_fset);

        let maxedge = 0, minedge = 1e17;

        for (let v2 of v.neighbors) {
          let dist = v2.vectorDistance(v);
          maxedge = Math.max(maxedge, dist);
          minedge = Math.min(minedge, dist);
        }

        let flag = MeshFlags.NOAPI_TEMP2;

        //go over two vert rings
        for (let v1 of v.neighbors) {
          let cv1 = v1.customData[cd_curv];
          cv1.check(v1);
          v1.flag &= ~flag;

          for (let v2 of v1.neighbors) {
            let cv2 = v2.customData[cd_curv];
            cv2.check(v2);

            v2.flag &= ~flag;
            maxedge = Math.max(maxedge, v2.vectorDistanceSqr(v));
          }
        }

        maxedge = Math.sqrt(maxedge);

        let totw = 0, co = _tmp2.zero();
        let proj = smoothProj;

        function add(v2) {
          let cv2 = v2.customData[cd_curv];

          v2.flag |= flag;
          let w = 1.0;

          let dist;
          let co2 = _tmp4;

          if (smoothProj > 0.0) {
            co2.load(v2).sub(v);
            let d = co2.dot(v.no);

            co2.addFac(v.no, -d*smoothProj).add(v);
            dist = co2.vectorDistance(v);
          } else {
            co2.load(v2);
            dist = v2.vectorDistance(v);
          }

          let w2 = 1.0 - dist/maxedge;
          //w2 *= w2*w2;

          let d = 0.1;
          //w2 = (w2 - d) / (1.0 - d);

          w *= w2;

          //w = 1.0;
          w = cv2.k1;

          co.addFac(co2, w);
          totw += w;
        }

        for (let v1 of v.neighbors) {
          if (!(v1.flag & flag)) {
            add(v1);
          }

          continue;
          for (let v2 of v1.neighbors) {
            if (!(v2.flag & flag)) {
              add(v2);
            }
          }
        }

        let ratio = minedge/maxedge;

        if (totw !== 0.0 && ratio !== 0.0) {
          co.mulScalar(1.0/totw);

          let co2 = _tmp4.load(co).sub(v);
          let d = co2.dot(v.no);
          co2.addFac(v.no, -d);

          //subtract horizontal movement
          let dfac = 1.0 - ratio;
          co.addFac(co2, -dfac);

          v.interp(co, fac);
          v.flag |= MeshFlags.UPDATE;
        }
      }
    }

    let _rtmp = new Vector3();
    let _rtmp2 = new Vector3();
    let _rdir = new Vector3();
    _rdir.load(ps.dp).normalize();

    let rakefac = ps.rake*0.5;

    let rtmps = util.cachering.fromConstructor(Vector3, 64);

    function rerror(v) {
      let d1 = rtmps.next();
      let d2 = rtmps.next();
      let err = 0.0;

      d1.load(ps.dp).normalize();
      let d = d1.dot(v.no);

      d1.addFac(v.no, -d).normalize();

      if (Math.random() > 0.999) {
        console.log("d1", d1.dot(v.no));
      }
      for (let v2 of v.neighbors) {
        d2.load(v2).sub(v);

        let d = d2.dot(v.no);
        d2.addFac(v.no, -d).normalize();

        let w = d1.dot(d2);

        w = Math.abs(w);
        w = 1.0 - Math.abs(w - 0.5)*2.0;
        w = 1.0 - Math.abs(w - 0.5)*2.0;

        err += w*w;
      }

      return err;
    }

    let rake2 = (v, fac = 0.5) => {
      let co = _rtmp.zero();
      let g = _rtmp2.zero();

      let df = 0.0001;

      let r1 = rerror(v);
      let totg = 0.0;

      for (let i = 0; i < 3; i++) {
        let orig = v[i];

        v[i] += df;
        let r2 = rerror(v);
        v[i] = orig;

        g[i] = (r2 - r1)/df;
        totg += g[i]*g[i];
      }

      if (totg === 0.0) {
        return;
      }

      r1 /= totg;
      g.mulScalar(-r1);

      //co.load(v).add(g);

      if (Math.random() > 0.999) {
        console.log(co, v[0], v[1], v[2]);
      }

      v.addFac(g, 0.25*fac);
    }

    if (useSmoothMemo) {
      //console.log("USING SMOOTH MEMO");

      vsmooth = (v, fac = 0.5) => {
        smemo.fac = fac;
        let co = smemo.smoothco(v);

        v.interp(co, fac);
      }
    }

    let _rtmp3 = new Vector3();

    let _dir2 = new Vector3();
    const skipflag = 0; //haveQuadEdges ? MeshFlags.QUAD_EDGE : 0;
    const _rtmp4 = new Vector3();

    /*
      on factor;

      f1 := x*x1 + y*y1 + z*z1 + w*w1;
      f2 := x*x2 + y*y2 + z*z2 + w*w2;
      f3 := x*x3 + y*y3 + z*z3 + w*w3;
      f4 := x**2+y**2+z**2+w**2 - 1.0;

      ff := solve({f1, f2, f3, f4}, {x, y, z, w});
      part(ff, 1, 1);
      part(ff, 1, 2);
      part(ff, 1, 3);
      part(ff, 1, 4);

      f1 := w1*a + w2*b + w3*c + w4*d;
     */

    const CD_DYNTOPO = doTopo && cd_color >= 0;

    function makeDummyCData() {
      let cdata = {
        customData: [],
        reset() {
          for (let cd of this.customData) {
            cd.mulScalar(0.0);
          }

          return this
        },

        add(b) {
          for (let i = 0; i < this.customData.length; i++) {
            this.customData[i].add(b.customData[i]);
          }

          return this;
        },

        sub(b) {
          for (let i = 0; i < this.customData.length; i++) {
            this.customData[i].sub(b.customData[i]);
          }

          return this;
        },

        interpSimple(b, fac) {
          for (let i = 0; i < this.customData.length; i++) {
            let cd1 = this.customData[i];
            let cd2 = b.customData[i];

            cd1.mulScalar(1.0 - fac);
            cd1.addFac(cd2, fac);
          }

          return this;
        },

        interp(srcs, ws, tmp = undefined) {
          if (!tmp) {
            tmp = getArrayTemp(srcs.length);
          }

          for (let i = 0; i < this.customData.length; i++) {
            let cd = this.customData[i];

            for (let j = 0; j < srcs.length; j++) {
              tmp[j] = srcs[j].customData[i];
            }

            cd.interp(cd, tmp, ws);
          }

          return this;
        },

        load(b) {
          for (let i = 0; i < this.customData.length; i++) {
            b.customData[i].copyTo(this.customData[i]);
          }

          return this;
        },

        addFac(b, fac) {
          for (let i = 0; i < this.customData.length; i++) {
            this.customData[i].addFac(b.customData[i], fac);
          }

          return this;
        },

        copyTo(b) {
          for (let i = 0; i < this.customData.length; i++) {
            this.customData[i].copyTo(b.customData[i]);
          }
        },

        mulScalar(fac) {
          for (let i = 0; i < this.customData.length; i++) {
            this.customData[i].mulScalar(fac);
          }

          return this;

        }
      }

      let clayout = haveGrids ? mesh.loops.customData : mesh.verts.customData;

      for (let layer of clayout.flatlist) {
        let cls = CustomDataElem.getTypeClass(layer.typeName);
        cdata.customData.push(new cls());
      }

      return cdata;
    }

    let cdata1 = makeDummyCData();
    let cdata2 = makeDummyCData();
    let cdata3 = makeDummyCData();

    let cornerflag = getCornerFlag();

    let rake = (v, fac = 0.5, sdis = 1.0) => {
      let mv = v.customData[cd_dyn_vert];

      if (mv.flag & cornerflag) {
        return;
      }

      let smoothboundflag = getSmoothBoundFlag();
      let boundflag = mv.flag & BVHVertFlags.BOUNDARY_ALL;

      if (v.valence === 4) {
        //return; //done do 4-valence verts
        fac *= 0.15;
      }

      if (!ENABLE_RAKE) {
        return;
      }

      //XXX
      if (doCurvRake && rakeCurvePosXOnly && v[0] < 0.0) {
        return;
      }

      let val = v.valence;
      if (fac === 0.0 || val === 0.0) {
        return;
      }

      let co = _rtmp.zero();

      let d1 = _rdir;
      let d2 = _rtmp2;
      //let d3 = _rtmp3;

      d1.load(ps.dp);
      let d = d1.dot(v.no);
      d1.addFac(v.no, -d).normalize();

      if (Math.abs(ps.angle) > Math.PI) {
        //d1.negate();
      }

      if (doCurvRake && (!rakeCurvePosXOnly || v[0] >= 0.0)) {
        let cv = v.customData[cd_curv];
        cv.check(v, cd_cotan, undefined, cd_fset);

        d1.interp(cv.tan, rakeCurveFac).normalize();
      }

      let pad = 0.02;
      let tot = 0.0;

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);
        let mv2 = v2.customData[cd_dyn_vert];

        if (boundflag && (mv2.flag & BVHVertFlags.BOUNDARY_ALL) !== boundflag) {
          continue;
        }

        if (e.flag & skipflag) {
          continue;
        }

        d2.load(v2).sub(v);

        let nfac = -d2.dot(v.no)*0.99;

        d2.addFac(v.no, nfac);
        d2.normalize();

        let w;

        let dot = d1.dot(d2);

        dot = Math.acos(dot*0.999999)/Math.PI;
        dot = Math.tent(dot*2.0 - 0.5);

        w = dot**2;

        w = w*(1.0 - pad) + pad;

        co.addFac(v2, w);
        co.addFac(v.no, nfac*w);
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);
      v.interp(co, fac);

      if (haveGrids) {
        gridVertStitch(v);
      }
    }

    //disabled for tet meshes
    let oldrake = (v, fac = 0.5, sdis = 1.0) => {
      if (v.valence === 4) {
        //return; //done do 4-valence verts
        fac *= 0.15;
      }

      if (!ENABLE_RAKE) {
        return;
      }

      //XXX
      if (doCurvRake && rakeCurvePosXOnly && v[0] < 0.0) {
        return;
      }

      //return rake2(v, fac);

      let val = v.valence;
      let cdvs, cdws;

      if (fac === 0.0 || val === 0.0) {
        return;
      }

      if (CD_DYNTOPO) {
        cdvs = getArrayTemp(val + 1);
        cdws = getArrayTemp(val + 1);

        cdvs[0] = v;
        cdws[0] = 1.0 - fac;
        let vi = 1;

        for (let v2 of v.neighbors) {
          cdvs[vi] = v2;
          cdws[vi] = fac/val;
          vi++;
        }

        cdata1.interp(cdvs, cdws);
      }


      //attempt to tweak rake falloff
      /*
      fac *= 1.0 - (1.0 - sdis)*(1.0 - sdis);

      //approximate square root with newton-raphson
      let fac0 = fac;
      fac = (fac0/fac + fac)*0.5;
      //*/

      //fac = 1.0 - (1.0 - fac)*(1.0 - fac);

      let co = _rtmp.zero();
      let tot = 0.0;

      let d1 = _rdir;
      let d2 = _rtmp2;
      //let d3 = _rtmp3;

      d1.load(ps.dp);
      let d = d1.dot(v.no);
      d1.addFac(v.no, -d).normalize();

      if (Math.abs(ps.angle) > Math.PI) {
        d1.negate();
      }

      if (doCurvRake && (!rakeCurvePosXOnly || v[0] >= 0.0)) {
        let cv = v.customData[cd_curv];
        cv.check(v, cd_cotan, undefined, cd_fset);

        d1.interp(cv.tan, rakeCurveFac).normalize();
      }

      let pad = 0.025;//5*(1.35 - fac);

      if (0 && val < 5) {
        let flag = MeshFlags.TEMP1;

        for (let e of v.edges) {
          for (let l of e.loops) {
            for (let l2 of l.f.loops) {
              l2.e.flag &= ~flag;
              l2.v.flag &= ~flag;
            }
          }
        }

        for (let e of v.edges) {
          e.flag |= flag;
        }

        for (let e of v.edges) {
          for (let l0 of e.loops) {
            for (let l of l0.f.loops) {
              if (l.v === v || (l.e.flag & skipflag) || (l.v.flag & flag)) {
                continue;
              }

              l.v.flag |= flag;

              let v2 = l.v;
              d2.load(v2).sub(v);

              let nfac = -d2.dot(v.no);
              d2.addFac(v.no, nfac);
              let len = d2.vectorLength();

              let d3 = _rtmp4.load(d2);
              /*
              on factor;

              operator tent;

              forall s let df(tent(s), s) = -2;

              f1 := x1*x2 + y1*y2 + z1*z2;
              f1 := tent(f1);
              f2 := x1*x1 + y1*y1 + z1*z2 - 1.0;
              f3 := f1**2 + f2**2;

              dx1 := df(f3, x1);
              dy1 := df(f3, y1);
              dz1 := df(f3, z1);

              on fort;
              dx1;
              dy1;
              dz1;
              off fort;

              */

              if (len > 0.00001) {
                d2.mulScalar(1.0/len);
              }

              if (l.e.flag & flag) {
                let x1 = d2[0];
                let y1 = d2[1];
                let z1 = d2[2];
                let x2 = d1[0];
                let y2 = d1[1];
                let z2 = d1[2];

                let dx1 = 2.0*(2.0*(z1*z2 - 1.0 + y1**2 + x1**2)*x1 + (y1*y2 + z1*z2 + x1*x2)*x2);
                let dy1 = 2.0*(2.0*(z1*z2 - 1.0 + y1**2 + x1**2)*y1 + (y1*y2 + z1*z2 + x1*x2)*y2);
                let dz1 = 2.0*(x1**2 + x1*x2 + y1**2 + y1*y2 + 2.0*z1*z2 - 1.0)*z2;

                let pi = Math.PI, sin = Math.sin, cos = Math.cos;//, tent = Math.tent;

                function tent(f) {
                  let f2 = Math.fract(f);

                  return 1.0 - Math.tent(f);
                }

                dx1 = 4.0*(z1*z2 - 1.0 + y1**2 + x1**2)*x1 - (cos(2.0*(z1*z2 - 1.0 + y1*y2 + x1*x2)*pi) + 1.0)
                  *sin(2.0*(z1*z2 - 1.0 + y1*y2 + x1*x2)*pi)*pi*x2;
                dy1 = 4.0*(z1*z2 - 1.0 + y1**2 + x1**2)*y1 - (cos(2.0*(z1*z2 - 1.0 + y1*y2 + x1
                  *x2)*pi) + 1.0)*sin(2.0*(z1*z2 - 1.0 + y1*y2 + x1*x2)*pi)*pi*y2;
                dz1 = (2.0*(z1*z2 - 1.0 + y1**2 + x1**2) - (cos(2.0*(z1*z2 - 1.0 + y1*y2 + x1*
                  x2)*pi) + 1.0)*sin(2.0*(z1*z2 - 1.0 + y1*y2 + x1*x2)*pi)*pi)*z2;

                dx1 = 4.0*((z1*z2 - 1.0 + y1**2 + x1**2)*x1 - tent(y1*y2 + z1*z2 + x1*x2)*x2);
                dy1 = 4.0*((z1*z2 - 1.0 + y1**2 + x1**2)*y1 - tent(y1*y2 + z1*z2 + x1*x2)*y2);
                dz1 = 2.0*(z1*z2 - 1.0 + y1**2 + x1**2 - 2.0*tent(y1*y2 + z1*z2 + x1*x2))*z2;

                let nfac2 = nfac;

                /*if (len > 0.00001) {
                  nfac2 /= len;
                }

                dx1 += v.no[0]*-nfac2;
                dy1 += v.no[1]*-nfac2;
                dz1 += v.no[2]*-nfac2;
                //*/

                let glen = Math.sqrt(dx1**2 + dy1**2 + dz1**2);
                if (glen > 0.00001) {
                  glen = 1.0/glen;
                  glen *= -len*0.05;

                  dx1 *= glen;
                  dy1 *= glen;
                  dz1 *= glen;
                }

                //v2.sub(v);
                //let len2 = v2.vectorLength();
                let len2 = v2.vectorDistance(v);

                v2[0] += dx1;
                v2[1] += dy1;
                v2[2] += dz1;

                v2.sub(v).normalize().mulScalar(len2).add(v);

                //util.console.log(dx1, dy1, dz1);
              }


              w = d1.dot(d2);
              w = Math.acos(w*0.99999)/Math.PI;
              w = 1.0 - Math.tent(w);
              //w = Math.abs(w);

              //if (val > 4) {
              if (1 || !(l.e.flag & flag)) {
                w = Math.tent(w - 0.5);
              } else {
                //w = 1.0 - w;
              }
              //}

              w *= w;
              w = w*(1.0 - pad) + pad;
              co.addFac(v2, w);
              co.addFac(v.no, nfac*w);
              tot += w;
            }
          }
        }

        return;
      } else {
        let vi = 1;

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);

          if (e.flag & skipflag) {
            continue;
          }

          d2.load(v2).sub(v);

          let nfac = -d2.dot(v.no)*0.95;

          d2.addFac(v.no, nfac);
          d2.normalize();

          let w;

          if (0) {
            let w2 = d1.dot(d2);
            w = d2.cross(d1).vectorLength();
            //let w = d1.dot(d2);
            //w = 1.0 - Math.abs(w-0.5)*2.0;

            w = 1.0 - w;
            w *= w*w*w;

            w2 = 1.0 - Math.abs(w2);
            w2 *= w2*w2*w2;

            w = w*0.5 + w2*0.5;
          } else {
            w = d1.dot(d2);
            if (0) {
              w = 1.0 - Math.tent(Math.tent(w));
              w = w*w*(3.0 - 2.0*w);
            } else if (val !== 4) {
              w = Math.acos(w*0.99999)/Math.PI;
              w = 1.0 - Math.tent((w - 0.5)*2.0);
              w = w*w*(3.0 - 2.0*w);
            } else {
              w = Math.acos(w*0.99999)/Math.PI;
              w = Math.tent((w - 0.5));
              w = w*w*(3.0 - 2.0*w);
            }

            //if (val > 4) {
            //w += 0.5;
            //w = Math.tent(w - 0.5);
            //}
          }

          w = w*(1.0 - pad) + pad;

          if (CD_DYNTOPO) {
            cdws[vi++] = w;
          }

          co.addFac(v2, w);
          co.addFac(v.no, nfac*w);
          tot += w;
        }
      }

      if (tot === 0.0) {
        return;
      }

      if (CD_DYNTOPO) {
        for (let i = 1; i < cdws.length; i++) {
          cdws[i] *= fac/tot;
        }

        cdata2.interp(cdvs, cdws);
        cdata2.interpSimple(v, 0.85);

        //cdata2.sub(cdata1);
        //cdata2.mulScalar(-1.0);
        //cdata2.add(v);

        cdata2.copyTo(v);
      }

      co.mulScalar(1.0/tot);
      v.interp(co, fac);

      if (haveGrids) {
        gridVertStitch(v);
      }
    }

    if (mesh instanceof TetMesh) {
      rake = () => {
      };
    }

    let dopinch = (v, f) => {
      f = Math.pow(f, pinchpower)*2.0;

      let f3 = f*Math.abs(strength);

      let height = radius*2.0;

      let oco = v.customData[cd_orig].value;

      conetmp.load(ps.p).addFac(nvec, planeoff*radius*0.25 + 0.5);
      planetmp.load(conetmp).addFac(nvec, height);

      let r = closest_point_on_line(v, conetmp, planetmp, false);

      let origdis = v.vectorDistance(oco);
      let fac = 1.0 - Math.min(2.0*origdis/radius, 1.0);

      planetmp.load(v).sub(r[0]).mulScalar(0.5).add(r[0]);
      v.interp(planetmp, pinchmul*f3*pinch*fac);

      if (haveGrids) {
        gridVertStitch(v);
      }
    }

    let _ctmp = new Vector3();
    let abs = Math.abs;

    let colorboundary = (v, fac) => {
      let co = _ctmp.zero();
      let c1 = v.customData[cd_color].color;

      co.add(v);
      let tot = 1.0;

      for (let v2 of v.neighbors) {
        let c2 = v2.customData[cd_color].color;

        let dr = abs(c1[0] - c2[0]);
        let dg = abs(c1[1] - c2[1]);
        let db = abs(c1[2] - c2[2]);

        let w = (dr*1.25 + dg*1.5 + db)*0.25;
        //w *= w;

        co.addFac(v2, w);
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);

      v.interp(co, fac);
    };

    let cd_node = bvh.cd_node;
    let ws = new Array(vs.size);

    if (isPaintMode && !have_color) {
      cd_color = mesh.verts.addCustomDataLayer("color").index;

      if (bvh.cd_grid >= 0) {
        GridBase.syncVertexLayers(mesh);
        cd_color = mesh.loops.customData.getLayerIndex("color");
      }

      have_color = true;
    }

    let color, concaveFilter = ps.concaveFilter;
    let invertConcave = brush.flag & BrushFlags.INVERT_CONCAVE_FILTER;

    if (have_color) {
      color = new Vector4(this.inputs.brush.getValue().color);
    }

    if (mode === COLOR_BOUNDARY && !have_color) {
      return;
    }

    let wi = 0;

    let planetmp = new Vector3();
    let conetmp = new Vector3();
    let planetmp2 = new Vector3();
    let planetmp3 = new Vector3();

    if (isPaintMode && !have_color) {
      return;
    }

    let astrength = Math.abs(strength);
    let bLinks = new Set();

    let gdists = this.grabDists, idis = 0;

    const WF = 0, WDIS = 1, WF2 = 2, WTOT = 3;

    wi = 0;
    let vi = 0;

    //propegate undo since smooth propegates
    //velocities to vertex ring neighborhoods now
    if (vsw !== 0.0 || ps.rake !== 0.0 || mode === DIRECTIONAL_FAIR) {
      let flag = MeshFlags.TEMP1;

      for (let v of vs) {
        v.flag &= ~flag;

        for (let e of v.edges) {
          let v2 = v === e.v1 ? e.v2 : e.v1;
          v2.flag &= ~flag;
        }
        //for (let v2 of v.neighbors) {
        //  v2.flag &= ~flag;
        //}
      }

      let log;
      if (doTopo) {
        log = this._undo.log;
        log.checkStart(mesh);
      }

      for (let v of vs) {
        if (!(v.flag & flag)) {
          let node = v.customData[cd_node].node;
          if (node) {
            node.setUpdateFlag(BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW);
          }

          doUndo(v);

          if (doTopo && log) {
            log.ensure(v);
          }

          v.flag |= flag;
        }

        for (let e of v.edges) {
          let v2 = v === e.v1 ? e.v2 : e.v1;

          //for (let v2 of v.neighbors) {
          if (!(v2.flag & flag)) {
            v2.flag |= flag;

            let node = v2.customData[cd_node].node;

            if (node) {
              node.setUpdateFlag(BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW);
            }

            if (doTopo && log && v2) {
              log.ensure(v2);
            }

            doUndo(v2);
          }
        }
      }
    } else {
      for (let v of vs) {
        doUndo(v);
      }
    }


    if (1) {
      //this.calcNormalVariance(mesh, bvh, ps.p, radius);
    }

    let texco = new Vector3();
    let irendermat = new Matrix4(ps.rendermat);
    let viewportSize = this.inputs.viewportSize.getValue();
    let aspect = viewportSize[0]/viewportSize[1];

    irendermat.invert();
    let texco2 = new Vector3();
    let texdsp = new Vector3();

    let console1 = util.console.context("console1");
    let console2 = util.console.context("console2");

    let needTexDv = brush.texUser.pinch !== 0.0;
    let texDv = needTexDv ? new Vector3() : undefined;

    let rendermat2 = new Matrix4(ps.rendermat);
    let tmat = new Matrix4();

    let ba = new Vector2();
    let bb = new Vector2();
    let bc = new Vector2();
    let bp = new Vector2();
    let distmp = new Vector3();

    let okflag = MeshFlags.NOAPI_TEMP2;

    for (let v of vs) {
      let pco = p3;
      if (mode === SHARP) {// || (mode === SMOOTH && (brush.flag & BrushFlags.MULTIGRID_SMOOTH))) {
        //vco = v.customData[cd_orig].value;
        pco = ps.origp || ps.p;
      }

      let dis, f;

      if (mode === GRAB) {
        dis = gdists[idis++];

        if (dis > radius) {
          v.flag &= ~okflag;
        } else {
          v.flag |= okflag;
        }

        f = Math.max(1.0 - dis/radius, 0.0);
        f = falloff.evaluate(f);
      } else if (useLinePlane) {
        distmp.load(v).sub(pco);

        dis = Math.abs(distmp.dot(linePlane));
        let dis2 = Math.abs(distmp.dot(linePlane2));

        if (dis > radius) {
          v.flag &= ~okflag;
        } else {
          v.flag |= okflag;
        }

        //

        if (1) {
          f = Math.max(1.0 - dis/radius, 0.0);
          f = falloff.evaluate(f);

          let f2 = Math.max(1.0 - dis2/radius, 0.0);
          f2 = falloff2.evaluate(f2);

          let dis3 = Math.abs(distmp.dot(ps.viewPlane));
          let f3 = Math.max(1.0 - dis3/radius, 0.0);
          f3 = falloff2.evaluate(f3);

          //f = Math.min(f, f2);
          //f = (f + f2)*0.5;
          //f = Math.sqrt(f*f2);
          f = Math.pow(f*f2*f3, 1.0/3.0);

          //f *= Math.abs(v.no.dot(ps.viewPlane));
        } else {
          let curve = falloff;

          if (dis2 > dis) {
            //  dis = dis2;
            //  curve = falloff2;
          }
          dis = Math.abs(dis + dis2)*0.5; //Math.sqrt(dis*dis + dis2*dis2) / Math.sqrt(2.0);

          f = Math.max(1.0 - dis/radius, 0.0);
          f = curve.evaluate(f);
        }
      } else {
        dis = v.vectorDistance(pco);

        if (dis > radius) {
          v.flag &= ~okflag;
        } else {
          v.flag |= okflag;
        }

        f = Math.max(1.0 - dis/radius, 0.0);
        f = falloff.evaluate(f);
      }

      if (!(v.flag & okflag)) {
        let wdis = dis;
        let wf = Math.max(1.0 - wdis/bvhRadius, 0.0);
        wf = falloff.evaluate(wf);

        ws[wi++] = wf;
        ws[wi++] = wdis;
        ws[wi++] = wf;

        vi++;
        continue;
      }

      let w1 = f;
      let f2 = f;

      let texf = 1.0;

      if (haveTex) {
        if (texUser.flag & TexUserFlags.ORIGINAL_CO) {
          texco.load(v.customData[cd_orig].value);
        } else {
          texco.load(v);
        }

        let scale = 1.0;
        let texco3;

        if (texUser.mode === TexUserModes.VIEW_REPEAT) {
          texco3 = texco2.load(texco);
          texco3.multVecMatrix(ps.rendermat);

          texco3[0] = (texco3[0]*0.5 + 0.5)*viewportSize[0];
          texco3[1] = (1.0 - (texco3[1]*0.5 + 0.5))*viewportSize[1];
          texco3[2] = ps.sp[2];

          if (texUser.flag & TexUserFlags.CONSTANT_SIZE) {
            scale = viewportSize[1]/100.0;
          } else {
            scale = viewportSize[1]/(brush.radius*2.0);
          }
        }

        let th = ps.angle;

        if ((texUser.flag & TexUserFlags.FANCY_RAKE) && lastps) {
          if (1 || !texco3) {
            texco3 = texco2.load(texco);
            texco3.multVecMatrix(ps.rendermat);
            texco3[0] = (texco3[0]*0.5 + 0.5)*viewportSize[0];
            texco3[1] = (1.0 - (texco3[1]*0.5 + 0.5))*viewportSize[1];
          }

          //console1.log("texco", texco3);

          let n = texdsp.load(ps.dsp);
          n[2] = texco3[2] = 0.0;
          n.normalize();

          texco3.sub(ps.sp);

          //let tt = n[0];
          //n[0] = n[1];
          //n[1] = -tt;

          let dx = ps.sp[0] - lastps.sp[0];
          let dy = ps.sp[1] - lastps.sp[1];

          let t = texco3.dot(n)/(0.5*Math.sqrt(dx*dx + dy*dy));
          t /= brush.spacing;

          t = t*0.5 + 0.5;
          //t *= 2.0;
          t = Math.min(Math.max(t, 0.0), 1.0);

          ba.load(lastps.sp);
          bb.load(lastps.dsp).add(ps.dsp).mulScalar(0.25).add(ba);
          bc.load(ps.sp);

          //let ret = closest_bez3_v2(texco3, ba, bb, bc);
          //util.console.log(ret, texco3, ba, bb, bc);
          //if (Math.random() > 0.995) {
          //texf = ret.t;
          //console.log(ret);
          //}

          if (0) {//ret) {
            let dv = dbez3_v2(ba, bb, bc, ret.t);
            th = Math.atan2(dv[1], dv[0]);
            texf = 0.015*Math.sqrt(ret.distSqr)/radius;
            texf = Math.min(Math.max(texf, 0.0), 1.0);
          } else {
            //th = 0;
          }

          //console2.log(t, dx.toFixed(3), dy.toFixed(3), lastps.sp, ps.sp, viewportSize);

          if (isNaN(t)) {
            //throw new Error("NaN");
            t = 0.5;
          }

          texf = t;

          let th1 = ps.angle;
          let th2 = ps.futureAngle;

          if (th1 > th2 + Math.PI) {
            th1 -= Math.PI;
          } else if (this < th2 - Math.PI) {
            th1 += Math.PI;
          }

          th = th1 + (th2 - th1)*t;

          //util.console.log(lastps.angle, ps.angle, t, th, ps.angle);

          if (isNaN(th)) {
            throw new Error("NaN");
          }
        }

        texco2.load(ps.sp);
        texco2[0] = (texco2[0]/viewportSize[0])*2.0 - 1.0;
        texco2[1] = (1.0 - texco2[1]/viewportSize[1])*2.0 - 1.0;

        th = Math.PI*0.5 - th;
        texf = texUser.sample(texco, scale*2.0, th, ps.rendermat, texco2, aspect, texDv);
        //texf = Math.min(Math.max(texco.vectorLength()/radius, 0.0), 1.0);

        if (texDv) {
          texDv.normalize();
          let d = texDv.dot(v.no);
          texDv.addFac(v.no, -d).normalize();
          texDv.mulScalar(radius*0.25);

          v.addFac(texDv, 0.1*texUser.pinch);
        }
        if (isplane) {
          let sign = ps.invert ? -1 : 1;
          if (planeoff) {
            sign = Math.sign(planeoff);
          }

          let planeoff2 = planeoff + (texf - 0.5)*sign;
          planep.load(ps.p).addFac(nvec, planeoff2*radius*0.5);
        } else {
          f *= texf;
        }
      }

      if (mode !== MASK_PAINT && cd_mask >= 0) {
        f *= v.customData[cd_mask].value;
      }

      /*if (mode === SHARP) {
        let d = 1.0 - Math.max(v.no.dot(nvec), 0.0);

        //d = 1.0 - d;
        //d *= d*d*d*d;
        d *= d;
        //d = 1.0 - d;

        f2 *= f2;

        //v.addFac(v.no, -vlen*d*f2*0.5*strength);
        v.addFac(vec, f);//
      } else */

      if (mode === DIRECTIONAL_FAIR) {
        let dir = wtmp1;

        dir.load(ps.dvec);
        let d = dir.dot(v.no);

        dir.addFac(v.no, -d);
        dir.normalize();

        dirCurveSmooth(v, dir, f*strength, cd_curv);
      } else if (0 && mode === PINCH) {
        let d2 = wtmp0.load(ps.dp);

        let f3 = f;

        if (doCurvRake) {// && (!rakeCurvePosXOnly || v[0] >= 0.0)) {
          let cv = v.customData[cd_curv];
          cv.check(v, cd_cotan, undefined, cd_fset);

          let tan = wtmp1.load(cv.tan);
          let neg = false;

          if (tan.dot(d2) < 0) {
            //tan.negate();
            neg = true;
          }

          d2.load(tan);

          if (Math.abs(cv.k1) > 0.0001) {
            f3 /= 1.0 + cv.k1; //Math.abs(cv.k1);
          }

          //d2.interp(tan, rakeCurveFac).normalize();
          if (neg) {
            //d2.negate();
          }
        }
        let d;

        d2.cross(v.no).normalize();
        let sign = ps.invert ? -1 : 1;

        f3 *= astrength*sign*radius*0.1;

        v.addFac(v.no, -f3);
        v.addFac(d2, f3);

        //v.addFac(d2, f3);

        /*

        //d = d2.dot(v.no);
        //d2.addFac(v.no, -d).normalize();

        let p = wtmp2.load(ps.p);
        let co = wtmp3.load(v).sub(p);

        d = co.dot(d2);

        let sign = ps.invert ? -1 : 1;
        v.addFac(co, -d*f*astrength*sign);

         */
      } else if (mode === WING_SCRAPE) {
        f2 = f*strength;

        let t = wtmp1.load(v).sub(ps.p);
        let d = t.dot(wno);
        t.addFac(wno, -d).normalize();

        let wtan2 = wtan;

        let nvec;

        t.cross(wtan2);

        t.normalize();
        let th = t.dot(wno);
        let doboth = false;

        //let d2 = wtmp2.load(v).sub(ps.p).dot(t);

        f2 *= 0.3;

        if (th < 0.0 || doboth) {
          nvec = wvec1;

          let co = planetmp.load(v);
          co.sub(wplanep1);

          d = co.dot(nvec);
          v.addFac(nvec, -d*f2);
        }

        if (th >= 0.0 || doboth) {
          nvec = wvec2;

          let co = planetmp.load(v);
          co.sub(wplanep2);

          d = co.dot(nvec);
          v.addFac(nvec, -d*f2);
        }
      } else if (mode === MASK_PAINT) {
        let f2 = ps.invert ? astrength*0.5 : -astrength*0.5;

        let mask = v.customData[cd_mask];
        let val = mask.value;

        val += f2;
        val = Math.min(Math.max(val, 0.0), 1.0);

        val = mask.value + (val - mask.value)*f;
        mask.value = val;

        v.flag |= MeshFlags.UPDATE;

        let node = v.customData[cd_node].node;
        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK);
        }
      } else if (mode === SHARP) {
        v.addFac(vec, f);
      } else if (mode === SMOOTH && isplane) {
        planetmp.load(v);
        vsmooth(v, f*strength);
        let dist = planetmp.vectorDistance(v);

        f2 = w1*w1*(3.0 - 2.0*w1)*w1;
        f2 *= strength*0.25;

        let co = planetmp.load(v);
        co.sub(planep);

        let n = planetmp2.load(nvec);

        let nco = planetmp3.load(co);
        nco.normalize();

        if (n.dot(co) < -0.5) {
          f2 = -f2;
        }

        let d = co.dot(n);

        let s1 = Math.sign(d);
        d = Math.max((Math.abs(d) - dist), 0)*s1;

        v.addFac(n, -d*f2);
      } else if (isplane) {
        f2 = f*strength;

        let co = planetmp.load(v);
        co.sub(planep);
        co.addFac(nvec, -f*radius*0.25*(ps.invert ? -1 : 1));

        let d = co.dot(nvec);

        v.addFac(nvec2, -d*f2*0.2);
      } else if (mode === DRAW) {
        v.addFac(vec, f);//
      } else if (have_color && mode === PAINT) {
        if (concaveFilter !== 0.0) {
          let cf = calcConcave(v);

          if (invertConcave) {
            cf = 1.0 - cf;
          }

          cf = Math.pow(cf*1.25, (concaveFilter + 1.0)*4.0);
          cf = cf < 0.0 ? 0.0 : cf;
          cf = cf > 1.0 ? 1.0 : cf;

          f *= cf;
        }
        let c = v.customData[cd_color];

        c.color.interp(color, f*strength);
      } else if (mode === INFLATE) {
        v.addFac(v.no, f*strength*0.1);
      } else if (mode === SLIDE_RELAX) {
        let co = _tmp4.load(v);

        co.interp(v.customData[cd_orig].value, 0.1*f);
        co.addFac(vec, f*strength);

        _tmp.load(co).multVecMatrix(rmat);
        co.interp(_tmp, f*strength);

        co.sub(v);
        let d = co.dot(v.no);
        co.addFac(v.no, -d);

        v.addFac(co, 0.25);
      } else if (mode === SNAKE) {
        v.interp(v.customData[cd_orig].value, 0.1*f);
        v.addFac(vec, f*strength);

        _tmp.load(v).multVecMatrix(rmat);
        v.interp(_tmp, f*strength);
      } else if (mode === GRAB) {
        //v.load(v.customData[cd_orig].value);

        let i = vi*3;
        let gi = gidxs[vi];

        let gx = goffs[i];
        let gy = goffs[i + 1];
        let gz = goffs[i + 2];

        let disx = (dis + gx)*Math.abs(signs[i]);
        let disy = (dis + gy)*Math.abs(signs[i + 1]);
        let disz = (dis + gz)*Math.abs(signs[i + 2]);

        //disx = disy = disz = dis;

        let fx = Math.max(1.0 - disx/radius, 0.0);
        let fy = Math.max(1.0 - disy/radius, 0.0);
        let fz = Math.max(1.0 - disz/radius, 0.0);

        fx = falloff.evaluate(fx)*texf;
        fy = falloff.evaluate(fy)*texf;
        fz = falloff.evaluate(fz)*texf;

        if (0) { //purely delta mode
          v[0] += vec[0]*fx*Math.sign(signs[i]);
          v[1] += vec[1]*fy*Math.sign(signs[i + 1]);
          v[2] += vec[2]*fz*Math.sign(signs[i + 2]);
        } else { //accumulated delta mode
          v.load(v.customData[cd_orig].value);

          //_tmp.zero();
          _tmp.load(vec).multVecMatrix(rmat);
          //_tmp.sub(v);
          //_tmp.add(vec);

          let vec2 = _tmp;

          //fx = fy = fz = 1.0;

          //v[0] += vec2[0]*fx*Math.sign(signs[i]);
          //v[1] += vec2[1]*fy*Math.sign(signs[i+1]);
          //v[2] += vec2[2]*fz*Math.sign(signs[i+2]);

          //*
          gd[gi + GOFFX] += vec2[0];
          gd[gi + GOFFY] += vec2[1];
          gd[gi + GOFFZ] += vec2[2];

          v[0] += gd[gi + GOFFX]*fx*Math.sign(signs[i]);
          v[1] += gd[gi + GOFFY]*fy*Math.sign(signs[i + 1]);
          v[2] += gd[gi + GOFFZ]*fz*Math.sign(signs[i + 2]);
          //*/
        }

        f = 1.0 - f; //make sure smooth uses inverse falloff
        f = Math.sqrt(f);
        //f = 1.0;

        //v.addFac(vec, f);
      } else if (mode === COLOR_BOUNDARY) {
        colorboundary(v, f*strength);
      } else if (mode === FACE_SET_DRAW) {
        for (let f of v.faces) {
          f.customData[cd_fset].value = drawFaceSet;

          for (let v2 of f.verts) {
            let mv = v2.customData[cd_dyn_vert];

            let node = v2.customData[cd_node].node;
            node.setUpdateFlag(BVHFlags.UPDATE_INDEX_VERTS|BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_MASK);

            mv.flag |= BVHVertFlags.NEED_BOUNDARY;
          }
        }

        v.flag |= MeshFlags.UPDATE;
      }

      if (haveGrids) {
        v.flag |= MeshFlags.UPDATE;

        let l = v.loopEid;
        l = l !== undefined ? mesh.eidMap.get(l) : undefined;

        if (l) {
          let grid = l.customData[cd_grid];
          grid.flagNormalsUpdate();
          grid.recalcFlag |= QRecalcFlags.NORMALS;
          bvh.updateGridLoops.add(l);
        }

        let node = v.customData[cd_node].node;
        if (node) {
          node.setUpdateFlag(updateflag);
        }

        gridVertStitch(v);

        if (v.bLink && v.bLink.v1.eid >= 0) {
          bLinks.add(v);
        }
      }

      ws[wi++] = f;
      ws[wi++] = dis;
      ws[wi++] = w1;

      v.flag |= MeshFlags.UPDATE;
      vi++;
    }

    //let es = new Set();
    wi = 0;

    let smoothvs = vs;

    if (mode === SNAKE) {
      smoothvs = new Set(vs);

      if (haveGrids) {
        /*
        for (let v of vs) {
          for (let v2 of v.neighbors) {
            smoothvs.add(v2);
          }
        }
        //*/
      } else {
        let vs2 = vs;

        for (let i = 0; i < 4; i++) {
          let boundary = new Set();

          for (let v of vs2) {
            for (let e of v.edges) {
              let v2 = e.otherVertex(v);

              if (!smoothvs.has(v2)) {
                boundary.add(v2);
                doUndo(v2);
              }

              smoothvs.add(v2);
            }
          }

          vs2 = boundary;
        }

        console.log("smoothvs", smoothvs.size, vs.size);
      }
    }

    /*
    if (mode === GRAB) {
      let vs2 = bvh.closestVerts(ps.origp, radius*4);

      for (let v of vs2) {
        doUndo(v);

        vsmooth(v, vsw);
        let node = v.customData[cd_node].node;
        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_NORMALS);
        }
      }
    }//*/

    let origVs = [];
    let origNs = [];

    for (let v of vs) {
      origVs.push(new Vector3(v));
      origNs.push(new Vector3(v));
    }

    let reproject = false;

    for (let v of vs) {
      let node = v.customData[cd_node].node;

      if (node) {
        node.setUpdateFlag(updateflag);
      }

      //for (let e of v.edges) {
      //  es.add(e);
      //}

      if (!isPaintMode && rakefac > 0.0) {
        reproject = true;
        rake(v, rakefac*ws[wi + WF], ws[wi + WF2]);
      }

      if (vsw > 0) {
        if (isPaintMode) {
          v.customData[cd_color].color.load(colorfilter(v, cd_color, vsw*ws[wi]));
        } else {
          if (vsw*ws[wi] > 0.0) {
            reproject = true;
          }

          vsmooth(v, vsw*ws[wi]);
        }
      }

      if (!isPaintMode && sharp !== 0.0) {
        reproject = true;
        vsharp(v, ws[wi]*sharp);
      }

      if (!isPaintMode && pinch !== 0.0) {
        reproject = true;
        dopinch(v, ws[wi]);
      }

      wi += 3;

      if ((v.flag & MeshFlags.MIRRORED) && (v.flag & MeshFlags.MIRROR_BOUNDARY)) {
        if (v.flag & MeshFlags.MIRROREDX) {
          v[0] = 0.0;
        }
        if (v.flag & MeshFlags.MIRROREDY) {
          v[1] = 0.0;
        }
        if (v.flag & MeshFlags.MIRROREDZ) {
          v[2] = 0.0;
        }
      }

      v.flag |= MeshFlags.UPDATE;
    }

    if (haveGrids && vsw > 0.0) {
      let steps = ~~(vsw*4.0);
      steps = Math.min(Math.max(steps, 2), 4);

      for (let i = 0; i < steps; i++) {
        for (let v of bLinks) {
          //doGridBoundary(v);
          gridVertStitch(v);
        }
      }
    }

    if (reproject && !haveGrids && this.inputs.reprojectCustomData.getValue()) {
      function swap3(a, b) {
        for (let i = 0; i < 3; i++) {
          let t = a[i];
          a[i] = b[i];
          b[i] = t;
        }
      }

      let ls = new Set();

      let i = 0, li = 0;

      for (let v of vs) {
        let node = v.customData[cd_node].node;

        for (let l of v.loops) {
          if (l.v !== v) {
            l = l.next;
          }

          if (!ls.has(l)) {
            l.index = li++;
          }
          ls.add(l);
        }

        node.setUpdateFlag(BVHFlags.UPDATE_BOUNDS);

        //XXX
        //origVs[i].load(v);
        //origNs[i].load(v.no);

        swap3(v, origVs[i]);
        swap3(v.no, origNs[i]);

        i++;
      }

      bvh.update();

      let cdblocks_loop = new Map();
      let cdblocks = [];
      let dummy = new Vertex();

      let vlist = [0, 0, 0];
      let wlist = [0, 0, 0];

      i = 0;
      for (let v of vs) {
        let origco = origVs[i];
        let origno = origNs[i];

        origco.addFac(origno, -0.00001);

        let r1 = bvh.castRay(origco, origno);
        origno.negate();
        let r2 = bvh.castRay(origco, origno);

        let r;

        if (r1 && r2) {
          if (Math.abs(r1.dist) < Math.abs(r2.dist)) {
            r = r1;
          } else {
            r = r2;
          }
        } else if (r1) {
          r = r1;
        } else if (r2) {
          r = r2;
        }

        if (!r) {// || (r.tri.v1 !== v && r.tri.v2 !== v && r.tri.v3 !== v)) {
          console.warn("Cast error", v, origco, origno);
          cdblocks.push(undefined);
        }

        let tri = r.tri;
        vlist[0] = tri.v1;
        vlist[1] = tri.v2;
        vlist[2] = tri.v3;

        //let t = r.uv[0];
        //r.uv[0] = r.uv[1];
        //r.uv[1] = t;

        wlist[0] = r.uv[0];
        wlist[1] = r.uv[1];
        wlist[2] = 1.0 - r.uv[0] - r.uv[1];

        dummy.customData = [];
        for (let cd of v.customData) {
          dummy.customData.push(cd.copy());
        }

        mesh.verts.customDataInterp(dummy, vlist, wlist);
        cdblocks.push(dummy.customData);

        for (let l of v.loops) {
          if (l.v !== v) {
            l = l.next;
          }

          dummy.customData = [];
          for (let cd of l.customData) {
            dummy.customData.push(cd.copy());
          }

          vlist[0] = r.tri.l1;
          vlist[1] = r.tri.l2;
          vlist[2] = r.tri.l3;

          mesh.loops.customDataInterp(dummy, vlist, wlist);
          cdblocks_loop.set(l, dummy.customData);
        }
        i++;
      }

      //console.log("CDBLOCKS_LOOP", cdblocks_loop);

      for (let l of cdblocks_loop.keys()) {
        let block = cdblocks_loop.get(l);

        for (let i = 0; i < l.customData.length; i++) {
          block[i].copyTo(l.customData[i]);
        }
      }

      i = 0;
      for (let v of vs) {
        if (cdblocks[i] !== undefined) {
          let block = cdblocks[i];

          for (let j = 0; j < v.customData.length; j++) {
            block[j].copyTo(v.customData[j]);
          }
        }

        swap3(v, origVs[i]);
        swap3(v.no, origNs[i]);

        let node = v.customData[cd_node].node;
        node.setUpdateFlag(BVHFlags.UPDATE_COLORS | BVHFlags.UPDATE_BOUNDS | BVHFlags.UPDATE_DRAW);

        i++;
      }
    }

    if (!this.smoother && vsw > 0.7) {
      let fac = 0.3;
      let repeat = 1; //vsw > 0.95 ? 2 : 1;

      for (let i = 0; i < repeat; i++) {
        let wi = 0;
        for (let v of vs) {
          vsmooth(v, fac*ws[wi]);

          wi += WTOT;
        }
      }
    }

    if (this.smoother && vsw > 0.0) {
      let update = false;
      let smoother = this.smoother;

      for (let v of vs) {
        update |= smoother.ensureVert(v);
      }

      if (update) {
        smoother.update();
      }

      let wfunc = function (v) {
        let w = smoothmap.get(v);

        if (w === undefined) {
          return 0.0;
        }

        return w;
      }

      let wfac = vsw;

      let sverts = smoother.getSuperVerts(vs);
      smoother.smooth(sverts, wfunc, wfac, smoothProj);
    }

    if (useSmoothMemo) {
      //console.log("steps:", smemo.steps);
    }

    if (cd_disp >= 0) {
      let dctx = new DispContext();

      dctx.reset(mesh, cd_disp);

      dctx.settings.smoothGen++;
      dctx.settings.initGen++;

      let smemo = getSmoothMemo(mesh, cd_disp);
      dctx.smemo = smemo;

      for (let v of vs) {
        if (v.eid < 0) {
          continue;
        }

        dctx.v = v;
        let dv = v.customData[cd_disp];

        dv.flushUpdateCo(dctx, true);
      }
    }


    let this2 = this;
    let doDynTopo = function* (vs) {
      let repeat = brush.dynTopo.repeat;
      if (mode === SNAKE) {
        repeat += 3;
      }

      if (haveGrids && haveQuadTreeGrids) {
        for (let step = 0; step < repeat; step++) {
          let vs2 = bvh.closestVerts(ps.p, bvhRadius);

          if (!(vs2 instanceof Set)) {
            vs2 = new Set(vs2);
          }

          for (let v of vs) {
            for (let v2 of v.neighbors) {
              vs2.add(v2);
            }
          }

          this2.doQuadTopo(mesh, bvh, esize, vs2, p3, radius, brush);
        }
      } else if (!haveGrids) {
        let es = new Set();

        let log = this2._undo.log;
        log.checkStart(mesh);

        for (let step = 0; step < repeat; step++) {
          if (1) {
            if (step > 0) {
              vs = bvh.closestVerts(ps.p, bvhRadius);
            }

            const emin = (esize*0.5)*(esize*0.5);
            const emax = (esize*2.0)*(esize*2.0);

            for (let v of vs) {
              for (let e of v.edges) {
                es.add(e);

                let distsqr = e.v1.vectorDistanceSqr(e.v2);

                //include surrounding geometry if edge size is
                //within esize/2, esize*2

                if (0 && distsqr > emin && distsqr < emax) {
                  for (let l of e.loops) {
                    for (let l2 of l.f.loops) {
                      es.add(l2.e);
                    }
                  }

                  let v2 = e.otherVertex(v);
                  for (let e2 of v2.edges) {
                    es.add(e2);
                  }
                }

                /*
                let v2 = e.otherVertex(v);

                //*
                for (let e2 of v2.edges) {
                  //let v3 = e2.otherVertex(v2);
                  //log.ensure(v3);

                  es.add(e2);
                }//*/
              }
            }
          } else {
            let tris = bvh.closestTris(ps.p, bvhRadius);
            for (let tri of tris) {
              for (let e of tri.v1.edges) {
                es.add(e);
              }
              for (let e of tri.v2.edges) {
                es.add(e);
              }
              for (let e of tri.v3.edges) {
                es.add(e);
              }
            }
          }

          let maxedges = brush.dynTopo.edgeCount;

          /*
          //try to subdivide long edges extra
          let eratio = (e) => {
            let mindis = 1e17;
            let tot = 0;

            for (let i=0; i<2; i++) {
              let v = i ? e.v2 : e.v1;

              for (let e2 of v.edges) {
                mindis = Math.min(mindis, e2.v1.vectorDistanceSqr(e2.v2));
                tot++;
              }
            }

            if (!tot) {
              return 1.0;
            }

            let ret = e.v1.vectorDistance(e.v2) / Math.sqrt(mindis + 0.000001);

            if (ret < 1.0) {
              return 1.0 / ret;
            }

            return ret;
          }

          let rec = (e, depth = 0) => {
            if (depth > 3) {
              return;
            }

            //let len = e.v1.vectorDistanceSqr(e.v2);
            if (eratio(e) > 4.0) {//len > (esize*8.0)**2) {
              es.add(e);

              for (let i = 0; i < 2; i++) {
                let v = i ? e.v2 : e.v1;

                for (let e2 of v.edges) {
                  if (!es.has(e2)) {
                    maxedges++;
                    rec(e2, depth + 1);
                  }
                }
              }
            } else if (depth > 0) {
              //add leaves to es anyway
              for (let i = 0; i < 2; i++) {
                let v = i ? e.v2 : e.v1;

                for (let e2 of v.edges) {
                  es.add(e2);
                }
              }
            }
          }

          if (0) {
            let vs2 = bvh.closestVerts(ps.p, radius*2);
            let evisit = new WeakSet();

            for (let e of es) {
              evisit.add(e);
            }

            for (let v of vs2) {
              for (let e of v.edges) {
                if (!evisit.has(e)) {
                  evisit.add(e);
                  rec(e);
                }
              }
            }
          }

          for (let e of new Set(es)) {
            rec(e);
          }

          //*/

          for (let e of es) {
            vs.add(e.v1);
            vs.add(e.v2);
          }

          for (let v of vs) {
            if (v) {
              log.ensure(v);
            }
          }

          for (let step2 of this2.doTopology(mesh, maxedges, bvh, esize, vs, es, radius, brush)) {
            yield;
          }

          for (let j = 0; j < 2; j++) {
            if (brush.dynTopo.flag & DynTopoFlags.COLLAPSE) {
              this2.doTopologyCollapse(mesh, maxedges, bvh, esize, vs, es, radius, brush);
              yield;
            }
          }

          yield;

          if (step !== repeat - 1) {
            bvh.update();
            yield;
          }
        }
      }
    }

    yield;

    if (doTopo) {
      for (let iter of doDynTopo(vs)) {
        yield;
      }
    }

    if (mesh instanceof TetMesh) {
      if (mode === GRAB) {
        let radius3 = radius*4.0;
        let vs2 = bvh.closestVerts(ps.origp, radius3);
        for (let v of vs) {
          vs2.add(v);
        }
        //let vs2 = new Set(mesh.verts);

        for (let v of vs2) {
          doUndo(v);

          let dis = v.vectorDistance(ps.origp);
          //*
          let w = Math.max(1.0 - dis/(radius3), 0);

          if (w > 0.75) {
            w = 0.0;
          } else {
            w = falloff.evaluate(w);
          }//*/

          v.w = w;
        }

        tetSolve(mesh, vs2);

        let updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_BOUNDS;

        for (let v of vs2) {
          let node = v.customData[cd_node].node;
          if (!node) {
            continue;
          }

          node.setUpdateFlag(updateflag);
        }
      }
    }
    //*/

    bvh.update();

    if (cd_disp >= 0) {
      let dctx = new DispContext();
      dctx.reset(mesh, cd_disp);

      dctx.settings.smoothGen++;
      dctx.settings.initGen++;

      let smemo = getSmoothMemo(mesh, cd_disp);
      dctx.smemo = smemo;

      vs = bvh.closestVerts(ps.p, bvhRadius);
      for (let v of vs) {
        dctx.v = v;

        let i = 0;
        for (let cd of v.customData) {
          if (cd instanceof DispLayerVert) {
            dctx.pushDisp(i);
            cd.checkInterpNew(dctx);
            dctx.popDisp();
          }

          i++;
        }
      }

      for (let v of vs) {
        if (v.eid < 0) {
          continue;
        }

        dctx.v = v;
        let dv = v.customData[cd_disp];

        dv.flushUpdateCo(dctx, true);
      }
    }

    if (mres && oldmres) {
      oldmres.copyTo(mres);

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.recalcFlag |= QRecalcFlags.NORMALS | QRecalcFlags.TOPO | QRecalcFlags.NEIGHBORS;
        grid.update(mesh, l, cd_grid);
      }

      mesh.regenBVH();
      this.getBVH(mesh).update();
    }

    if (!this.modalRunning) {
      mesh.regenTessellation();
    }

    //flag mesh to upload to gpu after exiting pbvh toolmode
    mesh.regenRender();
  }

  _checkcurv(v, cd_curv, cd_cotan, force = false, cd_fset) {
    if (cd_curv >= 0) {
      v.customData[cd_curv].check(v, cd_cotan, force, cd_fset);
    }
  }

  hasCurveVerts(brush) {
    let ok = brush.dynTopo.flag & DynTopoFlags.ADAPTIVE;
    ok = ok || (brush.rake > 0 && brush.rakeCurvatureFactor > 0);
    ok = ok || (brush.sharp > 0);
    ok = ok || (brush.tool === SculptTools.DIRECTIONAL_FAIR);

    return ok;
  }

  * doTopology(mesh, maxedges, bvh, esize, vs, es, radius, brush) {
    DYNTOPO_T_GOAL = brush.dynTopo.valenceGoal;
    ENABLE_DYNTOPO_EDGE_WEIGHTS = brush.dynTopo.flag & DynTopoFlags.FANCY_EDGE_WEIGHTS;

    if (brush.dynTopo.flag & DynTopoFlags.ADAPTIVE) {
      this.edist_scale = this.edist_curvmul;
    }


    let cd_fset = getFaceSets(mesh, false);
    let cd_curv = this.hasCurveVerts(brush) ? getCurveVerts(mesh) : -1;
    //let cd_curv = -1;
    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    if (cd_curv >= 0) {
      let flag = MeshFlags.TEMP1;
      for (let e of es) {
        e.v1.flag &= ~flag;
        e.v2.flag &= ~flag;
      }

      for (let e of es) {
        if (!(e.v1.flag & flag)) {
          e.v1.flag |= flag;
          let cv = e.v1.customData[cd_curv];
          cv.check(e.v1, cd_cotan, undefined, cd_fset);
        }

        if (!(e.v2.flag & flag)) {
          e.v2.flag |= flag;
          let cv = e.v2.customData[cd_curv];
          cv.check(e.v2, cd_cotan, undefined, cd_fset);
        }
      }
    }

    let origes;

    if (brush.dynTopo.flag & DynTopoFlags.DRAW_TRIS_AS_QUADS) {
      origes = new Set(es);
    }

    let log = this._undo.log;
    log.checkStart(mesh);

    es = es.filter(e => e.eid >= 0);

    for (let e of es) {
      if (!e || !e.v1 || !e.v2 || e.eid < 0) {
        console.warn("Bad edge in doTopology:", e);
        es.delete(e);
        continue;
      }

      log.ensure(e.v1);
      log.ensure(e.v2);

      for (let v of e.verts) {
        for (let v2 of v.neighbors) {
          log.ensure(v2);
        }
      }
    }

    let filter4 = !(brush.dynTopo.flag & DynTopoFlags.ALLOW_VALENCE4);
    //filter4 = filter4 && (brush.dynTopo.flag & (DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE));

    if (filter4) {
      this.doTopologyValence4(mesh, maxedges, bvh, esize, vs, es, radius, brush);
      es = es.filter(e => e.eid >= 0);

      yield;
    }

    //let chunksize = 20;
    //let steps = Math.ceil(maxedges / 50);
    //maxedges = Math.min(maxedges, chunksize);

    if (1) { //for (let si=0; si<steps; si++) {
      //if (util.time_ms() - this._last_time < 50) {
      //  return;
      //}
      this._last_time = util.time_ms();

      let elen = 0, tot = 0;
      for (let e of es) {
        elen += e.v2.vectorDistance(e.v1);
        tot++;
      }

      if (elen === 0.0) {
        return;
      }

      let ratio = elen/esize;
      ratio = Math.min(Math.max(ratio, 0.05), 20.0);

      let dflag = brush.dynTopo.flag & (DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE);
      if (dflag !== DynTopoFlags.SUBDIVIDE | DynTopoFlags.COLLAPSE) {
        ratio = 1.0;
      }

      let max1 = Math.ceil(maxedges/ratio), max2 = Math.ceil(maxedges*ratio);

      const nosmooth = 1;

      let dosmooth = (vs, fac = 0.5) => {
        if (nosmooth) {
          return;
        }

        let co = new Vector3();
        let co2 = new Vector3();
        let g = new Vector3();

        for (let v of vs) {
          let tot = 0;
          co.zero();

          log.ensure(v);

          for (let v2 of v.neighbors) {
            co2.load(v2).sub(v);
            let d = co2.dot(v.no);

            co2.addFac(v.no, -d).add(v);
            co.add(co2);

            //co.add(v2);
            tot++;
          }

          if (tot > 0) {
            co.mulScalar(1.0/tot);
            v.interp(co, fac);
            v.flag |= MeshFlags.UPDATE;
          }
        }
      }

      let co = new Vector3();
      let co2 = new Vector3();

      let dosmooth2 = (v, fac = 0.5) => {
        if (nosmooth) {
          return;
        }

        let tot = 0;
        co.zero();

        log.ensure(v);

        for (let v2 of v.neighbors) {
          co2.load(v2).sub(v);
          let d = co2.dot(v.no);

          co2.addFac(v.no, -d).add(v);
          co.add(co2);

          //co.add(v2);
          tot++;
        }

        if (tot > 0) {
          co.mulScalar(1.0/tot);
          v.interp(co, fac);
          v.flag |= MeshFlags.UPDATE;
        }
      }

      //this._runLogUndo(mesh, bvh);

      let newes = new Set();

      //if (brush.dynTopo.flag & DynTopoFlags.COLLAPSE) {
      //  this.doTopologyCollapse(mesh, max2, bvh, esize, vs, es, radius, brush);
      //  es = es.filter(e => e.eid >= 0);
      //}

      if (brush.dynTopo.flag & DynTopoFlags.SUBDIVIDE) {
        let es_out = [0];

        for (let i = 0; i < 1; i++) {
          let gen = this.doTopologySubdivide(mesh, max1, bvh, esize, vs, es, radius, brush, newes, dosmooth2, cd_curv, es_out);
          for (let iter of gen) {
            yield;
          }

          es = es_out[0];
          es = es.filter(e => e.eid >= 0);

          for (let e of new Set(es)) {
            for (let i = 0; i < 2; i++) {
              let v = i ? e.v2 : e.v1;
              for (let e2 of v.edges) {
                es.add(e2);
              }
            }
          }

          yield;
        }
      }

      //dosmooth(vs);

      if (brush.dynTopo.flag & DynTopoFlags.QUAD_COLLAPSE) {
        this.doTopologyCollapseTris2Quads(mesh, max2, bvh, esize, vs, es, radius, brush, false, cd_curv);
        es = es.filter(e => e.eid >= 0);
        yield;
      }

      if (brush.dynTopo.flag & DynTopoFlags.COLLAPSE) {
        this.doTopologyCollapse(mesh, max2, bvh, esize, vs, es, radius, brush, cd_curv);
        yield;
      } else if (0) {
        newes = newes.filter(e => e.eid >= 0);
        let newvs = new Set();

        let esize2 = 0;
        let tot = 0;

        for (let e of new Set(newes)) {
          esize2 += e.v1.vectorDistance(e.v2);
          tot++;

          for (let i = 0; i < 2; i++) {
            let v = i ? e.v2 : e.v1;

            for (let e2 of v.edges) {
              newes.add(e2);

              let v2 = e2.otherVertex(v);
              newvs.add(v2);

              for (let e3 of v2.edges) {
                //  newes.add(e3);
              }
            }
          }

          newvs.add(e.v1);
          newvs.add(e.v2);
        }

        if (tot) {
          esize2 /= tot;
        } else {
          esize2 = esize;
        }

        //esize *= 2.0;

        this.doTopologyCollapse(mesh, max2, bvh, esize2, newvs, newes, radius, brush, cd_curv);
        for (let e of newes) {
          if (e.eid >= 0) {
            es.add(e);
          }
        }

        yield;
      }

      es = es.filter(e => e.eid >= 0);

      for (let e of es) {
        vs.add(e.v1);
        vs.add(e.v2);
      }

      dosmooth(vs, 0.15*(1.0 - brush.rake));

      if (brush.dynTopo.flag & DynTopoFlags.DRAW_TRIS_AS_QUADS) {
        for (let e of origes) {
          if (e.eid >= 0) {
            es.add(e);
          }
        }

        for (let e of new Set(es)) {
          for (let v of e.verts) {
            for (let e2 of v.edges) {
              //*
              let v2 = e2.otherVertex(v);

              for (let e3 of v2.edges) {
                es.add(e3);
              }
              //*/

              es.add(e2);
            }
          }
        }

        this.doTopologyCollapseTris2Quads(mesh, max2, bvh, esize, vs, es, radius, brush, true, cd_curv);
        yield;
      }
    }

    //mark tessellation as bad, will happen on switching to another mode
    mesh.regenTessellation();
  }

  edist_simple(e, v1, v2, eset, cd_curv) {
    return v1.vectorDistanceSqr(v2);
  }

  val(v) {
    let tot = 0;

    for (let e of v.edges) {
      if (!(e.flag & MeshFlags.QUAD_EDGE)) {
        tot++;
      }
    }

    return tot;
  }

  edist_subd(e, v1, v2, eset, cd_curv) {
    let dis = v1.vectorDistanceSqr(v2)*this.edist_scale(e, cd_curv);

    let val1 = this.val(v1); //v1.valence;
    let val2 = this.val(v2); //v2.valence;

    if (val1 === 4) {
      dis /= 1.5;
    }

    if (val2 === 4) {
      dis /= 1.5;
    }

    return dis;

    //return dis; //XXX

    let val = (v1.valence + v2.valence)*0.5;
    //let mul = Math.max(Math.abs(val - 5.0)**3, 1.0);
    let mul = Math.max((val - 5.0), 1.0);

    dis /= mul**0.5;

    return dis*FANCY_MUL;

    //let dis = v1.vectorDistanceSqr(v2);

    //return dis;
    //*
    if (dis === 0.0) {
      return 0.0;
    }

    //let val = (v1.valence + v2.valence) * 0.5;
    let d = Math.max(val - 5, 1)*0.5;

    d = Math.abs(val - 6) + 1.0;
    return dis/d;
    //*/

    /*
    let rtot = 0, ratio = 0;
    for (let l of e.loops) {
      l = l.next.next;

      let co = midtmp.load(v1).interp(v2, 0.5);

      let ratio2 = l.v.vectorDistanceSqr(co)/dis;

      if (ratio2 < 0.000001) {
        continue;
        //eek
        //return 0.0;
      }

      ratio2 = Math.max(ratio2, 0.001);

      //if (ratio2 > 1.0) {
      //  ratio2 = 1.0 / ratio2;
      //}
      ratio2 = 1.0 + Math.abs(ratio2 - 1.0);

      ratio += ratio2;
      rtot++;
    }

    if (rtot > 0) {
      ratio /= rtot;

      dis /= ratio;
    }

    if (cd_curv >= 0) {
      let cv1 = v1.customData[cd_curv];
      let cv2 = v2.customData[cd_curv];
      let tan = edist_coll_tmp1;

      cv1.check(v1);
      cv2.check(v2);

      tan.load(cv1.tan);
      if (cv1.tan.dot(cv2.tan) < 0) {
        tan.negate();
      }

      tan.add(cv2.tan).normalize();

      let vec = edist_coll_tmp2.load(v2).sub(v1).normalize();

      if (vec.dot(tan) < 0) {
        vec.negate();
      }

      let d = tan.dot(vec);
      d *= d;

      dis /= 1.0 + d*3.0;
    }*/

    return dis*this.edist_scale(e, cd_curv);
  }

  edist_curvmul(e, cd_curv) {
    if (cd_curv >= 0) {
      let cv1 = e.v1.customData[cd_curv];
      let cv2 = e.v2.customData[cd_curv];

      //cv1.check(e.v1);
      //cv2.check(e.v2);

      let k1 = Math.abs(cv1.k1 + cv2.k1)*0.5;

      /*
      const pw = window.dd7 || 0.5;
      const add = window.dd8 || 1.0;
      const mul = window.dd9 || 1.0;
      //*/

      //*
      const pw = 0.5;
      const add = 1.0;
      const mul = 1.0;
      //*/

      k1 = add + Math.pow(k1, pw)*mul;
      return k1*k1;
      //return window.dd7 || 1.0;
    }
    return 1.0;
    //return window.dd8 || 1.0;
  }

  edist_coll(e, v1, v2, eset, cd_curv) {
    let dis = v1.vectorDistanceSqr(v2);

    let val1 = this.val(v1); //v1.valence;
    let val2 = this.val(v2); //v2.valence;

    if (val1 === 4) {
      dis *= 1.5;
    }

    if (val2 === 4) {
      dis *= 1.5;
    }

    return dis;

    let d = (val1 + val2)*0.5;

    //goal is six-valence verts
    d = Math.max(d - 5.0, 1.0);
    //d = Math.abs(d - 6.0) + 1.0;
    //d *= 0.5;

    dis *= d;

    return dis*FANCY_MUL;

    /*
    if (cd_curv >= 0) {
      let cv1 = v1.customData[cd_curv];
      let cv2 = v2.customData[cd_curv];
      let tan = edist_coll_tmp1;

      cv1.check(v1);
      cv2.check(v2);

      tan.load(cv1.tan);
      if (cv1.tan.dot(cv2.tan) < 0) {
        tan.negate();
      }

      tan.add(cv2.tan).normalize();

      let vec = edist_coll_tmp2.load(v2).sub(v1).normalize();

      if (vec.dot(tan) < 0) {
        vec.negate();
      }

      let d = tan.dot(vec);
      d *= d;

      dis *= 1.0 + d*3.0;
    }*/

    return dis*this.edist_scale(e, cd_curv)*FANCY_MUL;
  }

  edist_old(e, v1, v2, mode = 0) {
    let dis = v1.vectorDistanceSqr(v2);
    //return dis;

    let val1 = v1.valence;
    let val2 = v2.valence;

    let d = val1 + val2;

    if (0) {
      //d = (val1+val2)*0.5;
      d = Math.max(val1, val2);

      let t = DYNTOPO_T_GOAL;

      let dis2 = dis;

      if (mode) {//collapse
        dis2 /= 1.0 + Math.max((d - t)*this.dynTopoRand.random(), -0.75);

        if (d > t) {
          // dis2 /= 1.0 + (d - t)*Math.random();
        }
      } else { //subdivide
        dis2 /= 1.0 + Math.max((t - d)*this.dynTopoRand.random(), -0.75);

        if (d < t) {
          //dis2 /= 1.0 + (t - d)*Math.random();
        }
      }

      dis += (dis2 - dis)*0.5;
      return dis;
    }

    d = 0.5 + d*0.25;

    d += -2.0;
    d = Math.pow(Math.max(d, 0.0), 2);
    d *= 0.5;

    //let fac = window.dd1 || 0.5; //0.3;
    //d += window.dd2 || -2.0;
    //d = Math.pow(d, window.dd3 || 0.5);

    if (d !== 0.0) {
      if (!mode) {
        //d = 1.0 / d;
        //d = (val1 + val2)*0.5 - 6;
        //d = Math.max(d, 0.0) + 1.0;
        //d = 1.0;
      }

      dis *= d;
    }

    //try to avoid four-valence verts with all triangles
    //if (mode && (val1 === 4 || val2 === 4) && Math.random() > 0.8) {
    //dis /= 3.0;
    //}

    if (0) {//!mode) {
      let minsize = 1e17;
      for (let i = 0; i < 2; i++) {
        let v = i ? v2 : v1;
        for (let e of v.edges) {
          minsize = Math.min(minsize, e.v1.vectorDistance(e.v2));
        }
      }
      let dist = v1.vectorDistance(v2);

      minsize = Math.min(minsize, dist);
      let ratio = dist/(minsize + 0.00001);

      ratio = Math.max(ratio, 1.0);

      let p = 1.0 - 1.0/ratio;

      p *= p;

      if (this.dynTopoRand.random() < p) {
        return dis*0.5;
      }
    }

    //dihedral angle
    /*
    if (e.l) {
      let th = Math.abs(e.l.f.no.dot(e.l.radial_next.f.no));
      th *= th;
      th = 1.0 - th;
      //th *= th;

      dis += (dis*9.0 - dis)*th;
    }//*/

    return dis//*1.5;
  }

  //calculates edge size from density and radius
  calcESize2(totedge, radius) {
    if (totedge === 0) {
      return 0.0;
    }

    let area = Math.PI*radius**2;

    //let density1 = area / ((k*esize)**2);
    //esize2 is density1 solved for esize

    return Math.sqrt(area/totedge);
  }

  doTopologyCollapseTris2Quads(mesh, max, bvh, esize, vs, es, radius, brush, mark_only, cd_curv) {
    let log = this._undo.log;
    log.checkStart(mesh);

    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    let fs = new Set();

    for (let e of es) {
      for (let l of e.loops) {
        if (l.f.lists.length === 1 && l.f.lists[0].length === 3) {
          fs.add(l.f);
        }
      }
    }

    let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_COLORS;
    updateflag = updateflag | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_INDEX_VERTS;
    updateflag = updateflag | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_OTHER_VERTS;

    let cd_node = bvh.cd_node;

    if (!mark_only) {
      for (let f of fs) {
        for (let l of f.loops) {
          let node = l.v.customData[cd_node].node;
          if (node) {
            node.setUpdateFlag(updateflag);
          }
        }

        bvh.removeFace(f.eid);
      }
    }

    let newfs = new Set(fs);

    let cd_fset = getFaceSets(mesh, false);

    let lctx = new LogContext();
    lctx.onnew = (e, tag) => {
      if (e.type === MeshTypes.VERTEX) {
        this._checkcurv(e, cd_curv, cd_cotan, true, cd_fset);
      }

      log.logAdd(e, tag);

      if (e.type === MeshTypes.FACE) {
        newfs.add(e);
      }
    }

    lctx.onkill = (e, tag) => {
      log.logKill(e, tag);
    }

    let splitflag = TriQuadFlags.DEFAULT;

    if (mark_only) {
      splitflag |= TriQuadFlags.MARK_ONLY;

      let flag = MeshFlags.NOAPI_TEMP2;

      for (let f of fs) {
        for (let e of f.edges) {
          e.flag &= ~flag;
        }
      }

      lctx.onchange = (e) => {
        if (e.flag & flag) {
          return;
        }

        e.flag |= flag;

        for (let l of e.loops) {
          let f = l.f;
          let tris = bvh.getFaceTris(f._old_eid);

          if (!tris) {
            continue;
          }

          for (let t of tris) {
            if (!t.node) {
              continue;
            }

            t.node.setUpdateFlag(BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_DRAW);
          }
        }

      }
    }

    trianglesToQuads(mesh, fs, splitflag, lctx);

    newfs = newfs.filter(f => f.eid >= 0);

    if (mark_only) {
      for (let f of newfs) {
        let tris = bvh.getFaceTris(f._old_eid);
        if (!tris) {
          continue;
        }

        for (let t of tris) {
          if (t.node) {
            t.node.flag |= BVHFlags.UPDATE_INDEX_VERTS;
          }
        }
      }
      return;
    }

    let looptris = [];

    for (let f of newfs) {
      triangulateFace(f, looptris);
    }

    for (let i = 0; i < looptris.length; i += 3) {
      let l1 = looptris[i], l2 = looptris[i + 1], l3 = looptris[i + 2];
      let f = l1.f;

      let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, true, l1, l2, l3);
      tri.flag |= BVHTriFlags.LOOPTRI_INVALID;
    }
  }

  doTopologyValence4(mesh, max, bvh, esize, vs, es, radius, brush, lctx) {
    let addfaces = false;
    let newfaces = [];

    if (!lctx) {
      addfaces = true;

      let log = this._undo.log;
      log.checkStart(mesh);

      lctx = new LogContext();
      //lctx callback for deleting 4-valence verts
      lctx.onnew = (e, tag) => {
        log.logAdd(e, tag);

        if (e.type === MeshTypes.FACE) {
          newfaces.push(e);
        }
      }

      let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_UNIQUE_VERTS;
      updateflag |= BVHFlags.UPDATE_OTHER_VERTS | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_INDEX_VERTS;

      lctx.onkill = (e, tag) => {
        log.logKill(e, tag);

        if (e.type === MeshTypes.FACE) {
          let tris = bvh.getFaceTris(e._old_eid);

          if (tris) {
            for (let t of tris) {
              for (let node of t.nodes) {
                if (node) {
                  node.setUpdateFlag(updateflag);
                }
              }
            }
          }

          bvh.removeFace(e._old_eid);
        }
      }
    }

    //filter out 4-valence verts that are surrounded by
    //all triangles

    for (let e of es) {
      if (e.eid < 0) {
        continue;
      }


      let v1 = e.v1;
      let v2 = e.v2;

      for (let i = 0; i < 2; i++) {
        let v = i ? v2 : v1;
        let val = v.valence;

        if (val !== 4 && val !== 3) {
          continue;
        }

        let bad = false;
        let flag = MeshFlags.TEMP1;

        for (let e2 of v.edges) {
          if (!e2.l) {
            bad = true;
            break;
          }

          for (let l of e2.loops) {
            l.f.flag &= ~flag;

            if (!l.f.isTri()) {
              bad = true;
              break;
            }
          }
        }

        if (bad) {
          continue;
        }

        let node = v.customData[bvh.cd_node].node;
        if (node) {
          node.setUpdateFlag(BVHFlags.UPDATE_INDEX_VERTS);

          if (node.uniqueVerts) {
            node.uniqueVerts.delete(v);
          }
        }

        let f;
        f = mesh.dissolveVertex(v, lctx);

        if (f && !(brush.dynTopo.flag & DynTopoFlags.QUAD_COLLAPSE)) {
          if (f.isNgon()) { //should never happen
            console.warn("Something bad happened!");
            f.calcNormal();
            applyTriangulation(mesh, f, undefined, undefined, lctx);
          } else if (f.isQuad()) {
            triangulateQuad(mesh, f, lctx);
          }
        } else if (f) {
          //lctx.onnew(f);
        }

        break;
      }
    }

    if (addfaces) {
      for (let f of newfaces) {
        if (f.eid < 0) {
          continue;
        }

        let l1 = f.lists[0].l;
        let l2 = l1.next;
        let l3 = l2.next;
        let l4;
        let tri;

        if (f.isQuad()) {
          l4 = l3.next;

          tri = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, true, l1, l2, l3);
          tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

          bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l3.v, l4.v, true, l1, l3, l4);
          tri.flag |= BVHTriFlags.LOOPTRI_INVALID;
        } else {
          tri = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, true, l1, l2, l3);
          tri.flag |= BVHTriFlags.LOOPTRI_INVALID;
        }
      }
    }
  }

  _calcEsizeScale(esize, factor) {
    return 1.5 + factor;
  }

  doTopologyCollapse(mesh, max, bvh, esize, vs, es, radius, brush, cd_curv) {
    let lctx = new LogContext();

    let rand = this.dynTopoRand;

    //return;
    let es2 = [];

    esize /= this._calcEsizeScale(esize, brush.dynTopo.decimateFactor);

    const fancyWeights = brush.dynTopo.flag & DynTopoFlags.FANCY_EDGE_WEIGHTS;

    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");

    let edist = fancyWeights ? this.edist_coll : this.edist_simple;

    let log = this._undo.log;
    log.checkStart(mesh);

    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    if (es.size === 0) {
      return;
    }


    let esize2;

    if (0) {
      esize2 = this.calcESize2(es.size, radius);
      if (esize2 < esize) {
        esize += (esize2 - esize)*0.75;
      }
    } else {
      esize2 = esize;
    }

    let esqr = esize*esize;

    let es0 = [];
    for (let e of es) {
      if (e.eid >= 0) {
        es0.push(e);
      }
    }
    es = es0;

    for (let e of es) {
      let ri = ~~(rand.random()*es.length*0.9999);
      e = es[ri];

      if (es2.length >= max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = edist(e, e.v1, e.v2, undefined, cd_curv);

      if (rand.random() > lensqr/esqr) {
        continue;
      }

      if (lensqr <= esqr) {
        let l = e.l;
        let _i = 0;

        do {
          fs.add(l.f);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        es2.push(e);
      }
    }

    let fs2 = new Set();
    let es3 = new Set();

    for (let e1 of es2) {
      es3.add(e1);

      log.ensure(e1.v1);
      log.ensure(e1.v2);
      log.ensure(e1);

      for (let i = 0; i < 2; i++) {
        let v = i ? e1.v2 : e1.v1;

        for (let e of v.edges) {
          es3.add(e);

          if (!e.l) {
            continue;
          }

          let l = e.l;
          let _i = 0;

          do {
            fs2.add(l.f);

            //let node = l.f.customData[cd_face_node].node;
            //if (node) {
            //  fmap.set(l.f, node);
            //}

            bvh.removeFace(l.f.eid);
            l = l.radial_next;
          } while (l !== e.l && _i++ < 10);
        }
      }
    }

    let kills = new Map();
    for (let f of fs2) {
      if (f.eid >= 0) {
        kills.set(f, log.logKillFace(f));
      }
    }

    for (let e of es3) {
      if (e.eid >= 0) {
        kills.set(e, log.logKillEdge(e));
      }
    }

    //console.log("es2", es2);

    let typemask = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE;

    lctx.onkill = (elem, tag) => {
      if (!(elem.type & typemask)) {
        return;
      }
      if (kills.has(elem)) {
        return;
      }

      if (elem.type === MeshTypes.VERTEX) {
        let node = elem.customData[bvh.cd_node].node;

        if (node && node.uniqueVerts) {
          node.uniqueVerts.delete(elem);
          elem.customData[bvh.cd_node].node = undefined;
        }
      } else if (elem.type === MeshTypes.FACE) {
        bvh.removeFace(elem._old_eid);
      }

      log.logKill(elem, tag);
    }

    let cd_fset = getFaceSets(mesh, false);

    lctx.onnew = (elem, tag) => {
      if (cd_curv >= 0 && elem.type === MeshTypes.VERTEX) {
        this._checkcurv(elem, cd_curv, cd_cotan, true, cd_fset);
      }

      if (elem.type & typemask) {
        //if (kills.has(elem)) {
        //  kills.delete(elem);
        //}

        log.logAdd(elem, tag);
      }
    }

    /*
    let flag = MeshFlags.TEMP2;

    function logStart(v) {
      v.flag |= flag;

      log.ensure(v);

      for (let v2 of v.neighbors) {
        if (!(v2.flag & flag)) {
          v2.flag |= flag;

          log.ensure(v2);
        }
      }
    }

    for (let e of es2) {
      for (let i=0; i<2; i++) {
        let v = i ? e.v2 : e.v1;

        v.flag &= ~flag;

        for (let v2 of v.neighbors) {
          v2.flag &= ~flag;
        }
      }
    }

    for (let e of es2) {
      if (!(e.v1.flag & flag)) {
        logStart(e.v1);
      }
      if (!(e.v2.flag & flag)) {
        logStart(e.v2);
      }
    }//*/

    for (let e of es2) {
      if (e.eid < 0) {
        continue;
      }

      mesh.collapseEdge(e, undefined, lctx);
    }

    for (let e of es3) {
      if (e.eid >= 0) {
        let le = kills.get(e);

        if (le) {
          //log.cancelEntry(le);
          log.logAddEdge(e);
        }
      }
    }

    for (let f of fs2) {
      if (f.eid >= 0) {
        //log.cancelEntry(kills.get(f));
        log.logAddFace(f);
      }
    }

    let cd_node = bvh.cd_node;
    let updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_INDEX_VERTS;

    for (let f of fs2) {
      if (f.eid < 0) {
        continue; //face was deleted
      }

      let startl = f.lists[0].l;
      let l = startl.next;
      let _i = 0;

      //cleanup wire edges
      do {
        let v1 = startl.v;
        let v2 = l.v;
        let v3 = l.next.v;

        for (let i = 0; i < l.v.edges.length; i++) {
          let e = l.v.edges[i];

          let node = l.v.customData[cd_node];

          if (node && node.node && !node.node.bvh.dead) {
            if ((node.node.flag & updateflag) !== updateflag) {
              node.node.bvh.updateNodes.add(node.node);
            }

            node.node.flag |= updateflag;
          }

          if (!e.l) {
            mesh.killEdge(e, lctx);
            i--;
          }
        }

        //let tri = bvh.getTrackById(f.eid, bvh._nextTriIdx(), v1, v2, v3);

        let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, true, startl, l, l.next);
        tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

        l = l.next;
      } while (l !== f.lists[0].l.prev && _i++ < 1000);
    }

    for (let v of vs) {
      if (!v) {
        console.warn("Eek, undefined in vs!");
        vs.delete(v);
        continue;
      }

      if (v.eid < 0) {
        continue;
      }

      let count = 0;

      let ok;

      do {
        ok = false;
        count = 0;

        for (let e of v.edges) {
          if (!e.l) {
            mesh.killEdge(e, lctx);
            ok = true;
          }

          count++;
        }
      } while (ok);

      if (!count) {
        mesh.killVertex(v, undefined, lctx);
      }
    }
  }

  /*

  on factor;

  m := mat((m11, m12, m13), (m21, m22, m23), (m31, m32, m33));

  m := mat((n1x*n1x, n1x*n1y, n1x*n1z), (n1y*n1x, n1y*n1y, n1y*n1z), (n1z*n1x, n1z*n1y, n1z*n1z));
  m2 := mat((n2x*n2x, n2x*n2y, n2x*n2z), (n2y*n2x, n2y*n2y, n2y*n2z), (n2z*n2x, n2z*n2y, n2z*n2z));
  m3 := mat((n3x*n3x, n3x*n3y, n3x*n3z), (n3y*n3x, n3y*n3y, n3y*n3z), (n3z*n3x, n3z*n3y, n3z*n3z));
  m := m + m2 + m3;

  eg := mateigen(m, x);

  tm := mat((x, 0, 0), (0, x, 0), (0, 0, x));

  f1 := det (tm - m);
  solve(f1, x);

  l1 := part(eg, 1, 1);
  l2 := part(eg, 2, 1);

  * */

  doQuadTopo(mesh, bvh, esize, vs, brushco, brushradius, brush) {
    //console.log("quadtree topo!")
    //if (util.time_ms() - this._last_time < 15) {
    //  return;
    //}

    //ensure bounds are correct
    bvh.update();

    let docol = brush.dynTopo.flag & DynTopoFlags.COLLAPSE;
    let dosub = brush.dynTopo.flag & DynTopoFlags.SUBDIVIDE;

    let cd_grid = bvh.cd_grid;
    let cd_node = bvh.cd_node;

    const esize1 = esize*(1.0 + 0.75*brush.dynTopo.subdivideFactor);
    const esize2 = esize*(1.0 - 0.75*brush.dynTopo.decimateFactor);

    const esqr1 = esize1*esize1;
    const esqr2 = esize2*esize2;

    let haveKdTree = false;
    let layer = mesh.loops.customData.flatlist[bvh.cd_grid];
    if (layer.typeName === "KdTreeGrid") {
      haveKdTree = true;
    }

    let MAXCHILD = haveKdTree ? 2 : 4;
    let data = [];
    const DGRID = 0, DNODE = 1, DLOOP = 2, DMODE = 3, DTOT = 4;

    const SUBDIVIDE = 0, COLLAPSE = 1;

    let QFLAG   = QuadTreeFields.QFLAG,
        QDEPTH  = QuadTreeFields.QDEPTH,
        QPARENT = QuadTreeFields.QPARENT,
        QPOINT1 = QuadTreeFields.QPOINT1;

    let LEAF = QuadTreeFlags.LEAF,
        DEAD = QuadTreeFlags.DEAD;

    if (haveKdTree) {
      QFLAG = KdTreeFields.QFLAG;
      QDEPTH = KdTreeFields.QDEPTH;
      QPARENT = KdTreeFields.QPARENT;
      QPOINT1 = KdTreeFields.QPOINT1;
      LEAF = KdTreeFlags.LEAF;
      DEAD = KdTreeFlags.DEAD;
    }

    const updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;

    let {VTOT, VTOTE, VTOTN, VINDEX, VV, VU} = VMapFields;
    let {ETOT, ETOTN, EINDEX, EID, EV1, EV2} = EMapFields;

    let vs2 = new Set();
    let grids = new Set();
    let gridmap = new Map();

    let visit = new Set();
    let updateloops = new Set();
    let bnodes = new Set();

    let maxDepth = brush.dynTopo.maxDepth; //this.inputs.dynTopoDepth.getValue();

    if (haveKdTree) {
      maxDepth *= 2;
    }

    let visits = new Map();
    let tot = 0;

    let vs3 = [];
    for (let v of vs) {
      vs3.push(v);
    }
    vs = vs3;

    let dn1 = new Vector3();
    let dn2 = new Vector3();
    let dn3 = new Vector3();
    let dn4 = new Vector3();
    let dn5 = new Vector3();

    let rsqr = brushradius*brushradius;

    //vs.sort((a, b) => a.vectorDistanceSqr(brushco) - b.vectorDistanceSqr(brushco));

    let limit = brush.dynTopo.edgeCount;

    for (let _i = 0; _i < vs.length; _i++) {
      let ri = ~~(this.dynTopoRand.random()*vs.length*0.99999);
      let v = vs[ri];

      //for (let v of vs) {
      if (tot >= limit) {
        break;
      }

      let l = v.loopEid;
      l = mesh.eidMap.get(l);

      if (l === undefined || !(l instanceof Loop)) {
        continue;
      }

      let ok = false;
      let dtot = 0, ntot = 0;
      let etot = 0;
      let maxlen = 0;
      let minlen = 1e17;

      for (let v2 of v.neighbors) {
        if (v2.bLink && v2.loopEid !== v.loopEid) {
          continue;
        }

        let distsqr = v.vectorDistanceSqr(v2);

        maxlen = Math.max(maxlen, distsqr);
        minlen = Math.min(minlen, distsqr);

        if (distsqr > esqr1) {
          dtot++;
        } else if (distsqr < esqr2) {
          etot++;
        }

        ntot++;
      }

      etot = maxlen < esqr2 ? 1 : 0;

      if (dtot > 0 || etot > 0) {//>= ntot*0.5) {
        ok = true;
      }


      if (ok) {
        vs2.add(v);

        let grid = l.customData[cd_grid];

        if (!grids.has(grid)) {
          grid.recalcPointIndices();
          visits.set(grid, new Set());
          gridmap.set(grid, l);

          grids.add(grid);
          grid.update(mesh, l, cd_grid);
        }

        let visit2 = visits.get(grid);

        let topo = grid.getTopo(mesh, cd_grid);
        let ns = grid.nodes;

        let vi2 = v.index2*VTOT;

        /*
        let v2 = topo.vmap[v.index];
        if (!v2) {
          v.index = grid.points.indexOf(v);
          vi2 = v.index*VTOT;
          v2 = topo.vmap[v.index];

          if (!v2) {
            throw new Error("index error!");
          }
          //console.log("error", v.index);
          //continue;
        }*/

        let ok = false;

        let vmap2 = topo.vmap2;
        let totn = vmap2[vi2 + VTOTN];

        for (let vni = 0; vni < totn; vni++) {
          let ni = vi2 + VTOTN + 1 + vni;
          ni = vmap2[ni];

          //for (let ni of v2.nodes) {
          if (tot >= limit) {
            break;
          }

          let found = false;
          for (let i = 0; i < 4; i++) {
            let p = grid.points[ns[ni + QPOINT1 + i]];
            let p2 = grid.points[ns[ni + QPOINT1 + ((i + 1)%4)]];

            if (!p2 || !p) {
              console.warn("eek!", ni);
              continue;
            }

            let dist = p.vectorDistanceSqr(brushco);

            if (dist <= rsqr) {
              found = true;
              break;
            }

            let t = dn1.load(p2).sub(p);
            let len = t.vectorLength();

            if (len > 0.000001) {
              t.mulScalar(1.0/len);
            }

            let co = dn2.load(brushco).sub(p);

            let dt = t.dot(co)/len;

            dt = Math.min(Math.max(dt, 0.0), 1.0);

            co.load(p).interp(p2, dt);
            dist = p.vectorDistanceSqr(co);

            if (dist < rsqr) {
              found = true;
              break;
            }
          }

          if (!found) {
            continue;
          }

          if (!visit2.has(ni) && (ns[ni + QFLAG] & LEAF) && !(ns[ni + QFLAG] & DEAD)) {
            let mode;

            mode = etot < dtot ? SUBDIVIDE : COLLAPSE;

            if (this.dynTopoRand.random() > 0.9) {
              mode = COLLAPSE;
            } else if (!etot && !dtot) {
              continue;
            }

            if (mode === SUBDIVIDE && !dosub) {
              continue;
            }
            if (mode === COLLAPSE && !docol) {
              continue;
            }

            /*
            if (Math.random() > 0.97) {
              etot = 1;
            }

            if (etot) {
              mode = COLLAPSE;
            } else if (dtot) {
              mode = SUBDIVIDE;
            } else {
              continue;
            }
            //*/

            //let mode = dtot > etot ? SUBDIVIDE : COLLAPSE;

            if (maxDepth > 0 && (mode === SUBDIVIDE && ns[ni + QDEPTH] >= maxDepth)) {
              continue;
            }

            if (mode === COLLAPSE) {
              if (!ni || visit2.has(grid.nodes[ni + QPARENT])) {
                continue;
              }

              ni = grid.nodes[ni + QPARENT];
            }

            updateloops.add(l);

            data.push(grid);
            data.push(ni);
            data.push(l);
            //data.push(COLLAPSE);
            data.push(mode);

            visit2.add(ni);

            ok = true;
            tot++;
          }
        }

        if (ok) {
          let node = v.customData[cd_node].node;

          if (node) {
            node.setUpdateFlag(updateflag);
            bnodes.add(node);
          }
        }
      }
    }

    /*
    for (let n of bvh.nodes) {//bnodes) {
      if (n.id < 0) {
        continue;
      }

      //bvh.checkJoin(n);
    }*/

    //console.log(data);
    //updateloops = new Set(mesh.loops);

    cd_node = mesh.loops.customData.getLayerIndex("bvh");

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      //forcibly unlink vert node refs
      for (let p of grid.points) {
        let node = p.customData[cd_node];

        if (node.node && node.node.uniqueVerts) {
          node.node.uniqueVerts.delete(p);
        }

        node.node = undefined;
      }

      bvh.removeFace(l.eid, true, false);
    }

    /*
    for (let grid of visits.keys()) {
      let qnodes = visits.get(grid);
      let idmul = grid.idmul;
      let l = gridmap.get(grid);

      let id = l.eid*idmul;
      for (let ni of qnodes) {
        bvh.removeFace(id + ni);
      }
    }
    //*/

    for (let node of bnodes) {
      if (node.id < 0) { //node died at some point?
        continue;
      }
    }
    bvh.updateTriCounts();

    let maxdimen = 1;
    for (let grid of grids) {
      maxdimen = Math.max(maxdimen, grid.dimen);
    }

    let idmul = (maxdimen + 2)*(maxdimen + 2)*128;

    //console.log(data.length / DTOT);
    for (let grid of grids) {
      grid.recalcFlag |= QRecalcFlags.TOPO;

      //grid._rebuildHash();
      //grid.checkCustomDataLayout(mesh);
      //grid.relinkCustomData();
    }

    let compactgrids = new Set();

    for (let di = 0; di < data.length; di += DTOT) {
      let grid = data[di], ni = data[di + 1], l = data[di + 2];
      let mode = data[di + 3];

      let ns = grid.nodes, ps = grid.points;

      let key = l.eid*idmul + ni;
      if (visit.has(key) || (grid.nodes[ni + QFLAG] & DEAD)) {
        continue;
      }

      visit.add(key);
      if (mode === SUBDIVIDE && grid.points.length < 512*512) {// && (ns[ni + QFLAG] & LEAF)) {
        grid.subdivide(ni, l.eid, mesh);
      } else if (mode === COLLAPSE) {
        //continue;
        grid.collapse(ni);
        bvh.updateGridLoops.add(l);
      }

      grid.recalcFlag |= QRecalcFlags.NODE_DEPTH_DELTA;

      if (grid.freelist.length > 16) {
        compactgrids.add(grid);
      }
      //console.log(ni, "depth:", ns[ni+QDEPTH], "key", key);
    }

    if (compactgrids.size > 0) {
      //console.log("COMPACT", compactgrids);
    }

    for (let grid of compactgrids) {
      grid.compactNodes();
    }

    //console.log(bvh.nodes.length, bvh.root.tottri);

    let trisout = [];

    let visit2 = new Set();

    let updateloops2 = new Set();

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      let l2 = l.radial_next;
      updateloops2.add(l2);

      l2 = l.prev.radial_next;
      updateloops2.add(l2);

      l2 = l.next.radial_next;
      updateloops2.add(l2);

      l2 = l.radial_next.next;
      updateloops2.add(l2);

      l2 = l.radial_next.prev;
      updateloops2.add(l2);

      l2 = l.next;
      updateloops2.add(l2);

      l2 = l.prev;
      updateloops2.add(l2);

      updateloops2.add(l);
    }

    //let uflag = QRecalcFlags.LEAVES|QRecalcFlags.ALL|QRecalcFlags.NEIGHBORS|QRecalcFlags.TOPO|QRecalcFlags.POINTHASH;
    //uflag = (1<<20)-1;
    let uflag = QRecalcFlags.NORMALS;//|QRecalcFlags.NEIGHBORS|QRecalcFlags.TOPO|QRecalcFlags.POLYS;
    let updateflag2 = QRecalcFlags.NEIGHBORS | QRecalcFlags.TOPO | QRecalcFlags.INDICES
      | QRecalcFlags.LEAVES | QRecalcFlags.POLYS | QRecalcFlags.MIRROR | QRecalcFlags.POINTHASH;

    for (let l of updateloops2) {
      let grid = l.customData[cd_grid];

      grid.recalcFlag |= updateflag2;// | QRecalcFlags.ALL;
    }

    for (let grid of grids) {
      grid.recalcFlag |= uflag;
    }

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];
      grid.update(mesh, l, cd_grid);
    }

    for (let l of updateloops2) {
      let grid = l.customData[cd_grid];
      grid.update(mesh, l, cd_grid);
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];
      //if (grids.has(grid)) {
      grid.update(mesh, l, cd_grid);
      //}
    }

    //XXX

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      if (visit2.has(grid)) {
        throw new Error("eek!");
      }
      visit2.add(grid);

      let a = trisout.length;

      grid.makeBVHTris(mesh, bvh, l, cd_grid, trisout);
      //console.log("tris", (trisout.length-a)/5);
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      //if (grids.has(grid)) {
      //grid.update(mesh, l, cd_grid);
      //}
    }

    //console.log("bnodes", bnodes);
    //console.log("trisout", trisout.length/5, updateloops, updateloops.size);

    let _tmp = [0, 0, 0];

    function sort3(a, b, c) {
      _tmp[0] = a;
      _tmp[1] = b;
      _tmp[2] = c;
      _tmp.sort();

      return _tmp;
    }

    let _i = 0;
    while (trisout.length > 0) {
      let ri = (~~(this.rand.random()*trisout.length/5*0.999999))*5;
      //let ri = 0;

      let feid = trisout[ri];
      let id = trisout[ri + 1];
      let v1 = trisout[ri + 2];
      let v2 = trisout[ri + 3];
      let v3 = trisout[ri + 4];

      //let sort = sort3(v1.index, v2.index, v3.index);
      //let key = `${feid}:${id}:${sort[0]}:${sort[1]}:${sort[2]}`
      //if (visit2.has(key)) {
      //throw new Error("eek2");
      //} else {

      //console.log("feid", feid);
      //if (!bvh.hasTri(id)) {

      if (!bvh.hasTri(feid, id)) {
        bvh.addTri(feid, id, v1, v2, v3);
      }
      //}
      //}

      //swap with last for fast pop
      let ri2 = trisout.length - 5;

      for (let j = 0; j < 5; j++) {
        trisout[ri + j] = trisout[ri2 + j];
      }

      trisout.length -= 5;

      if (_i++ >= 97) {
        //  break;
      }
    }

    for (let i = 0; i < 3; i++) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.updateFlag = QRecalcFlags.EVERYTHING & ~QRecalcFlags.NODE_DEPTH_DELTA;
        grid.updateFlag |= QRecalcFlags.FIX_NEIGHBORS | QRecalcFlags.POINT_PRUNE;
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.update(mesh, l, cd_grid);
      }
    }


    /*

        update_grid(l); //will do l.prev/.next too
        update_grid(l.radial_next);


    * */
  }

  _runLogUndo(mesh, bvh) {
    let log = this._undo.log;

    if (!log.checkStart(mesh)) {
      log.undo(mesh, (f) => {
        if (f.lists[0].length === 3 && f.lists.length === 1) {
          let l = f.lists[0].l;
          let tri2 = bvh.addTri(f.eid, bvh._nextTriIdx(), l.v, l.next.v, l.prev.v, undefined, l, l.next, l.prev);
          tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
        } else {
          let ltris = triangulateFace(f);
          for (let i = 0; i < ltris.length; i += 3) {
            let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

            let tri2 = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, undefined, l1, l2, l3);
            tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
          }
        }
      }, (f) => {
        bvh.removeFace(f.eid);
      });

      log.reset();
      log.start(mesh);
    }
  }

  * doTopologySubdivide(mesh, max, bvh, esize, vs, es, radius, brush, newes_out, dosmooth, cd_curv, es_out) {
    let esetin = es;

    es_out[0] = es;

    const useSmart = brush.dynTopo.subdivMode === SubdivModes.SMART;

    let esize1 = esize;
    let emin = (esize1*0.5)*(esize1*0.5);
    let emax = (esize1*2.0)*(esize1*2.0);

    esize *= this._calcEsizeScale(esize, brush.dynTopo.subdivideFactor);

    let esize2;

    if (0) {
      esize2 = this.calcESize2(es.size, radius);
      if (esize2 < esize) {
        esize += (esize2 - esize)*0.35;
      }
    } else {
      esize2 = esize;
    }

    //console.log(esize, esize2);

    //esize = esize2;

    const fancyWeights = brush.dynTopo.flag & DynTopoFlags.FANCY_EDGE_WEIGHTS;

    let edist0 = fancyWeights ? this.edist_subd : this.edist_simple;

    //*
    function edist(e, v1, v2, eset, cd_curv) {
      let dis = v1.vectorDistance(v2);
      let w = edist0(e, v1, v2, eset, cd_curv);

      if (e.l && e.l.next.e && e.l.prev.e) {
        let e2 = e.l.next.e;
        let e3 = e.l.prev.e;

        let dis2 = e2.v1.vectorDistance(e2.v2);
        let dis3 = e3.v1.vectorDistance(e3.v2);
        let ratio1, ratio2;

        if (dis2 !== 0.0) {
          ratio1 = dis > dis2 ? dis/dis2 : dis2/dis;
        }
        if (dis3 !== 0.0) {
          ratio2 = dis > dis3 ? dis/dis3 : dis3/dis;
        }

        let ratio;
        if (dis2 !== 0.0 && dis3 !== 0.0) {
          ratio = Math.max(ratio1, ratio2);
        } else if (dis2 !== 0.0) {
          ratio = ratio1;
        } else if (dis3 !== 0.0) {
          ratio = ratio2;
        } else {
          return dis*dis;
        }

        //ratio = Math.cbrt(ratio);
        w = (Math.sqrt(w)/ratio)**2;
      }

      return w;
    }//*/


    let eset = es;

    let es2 = [];

    let es0 = [];
    for (let e of es) {
      es0.push(e);
    }
    es = es0;


    let log = this._undo.log;

    log.checkStart(mesh);

    let esqr = esize*esize;
    let fs = new Set();
    let fmap = new Map();

    //let cd_face_node = bvh.cd_face_node;

    let max2 = max;

    //let rand = Math;
    let rand = this.dynTopoRand;

    if (max2 < 10) {
      max2 = 64;
    } else {
      max2 *= 8;
    }

    let lens = [];

    let esqr2 = (esize*0.5)**2;

    function weight_fancy(e, lensqr) {
      lensqr += -(e.v1.valence + e.v2.valence);
      //lensqr += countNewSplitEdges(e, eset);

      return lensqr;
    }

    function weight_simple(e, lensqr) {
      return lensqr;
    }

    let weight;

    if (!fancyWeights) {
      weight = weight_simple;
    } else {
      weight = weight_fancy;
    }

    for (let e of es) {
      let ri = ~~(rand.random()*0.9999*es.length);
      e = es[ri];

      if (es2.length >= max2) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = edist(e, e.v1, e.v2, eset, cd_curv);

      if (lensqr >= esqr) {
        let ok = true;

        //if (window.dd1) {
        lensqr = weight(e, lensqr);

        let l = e.l;
        let _i = 0;
        //let esqr3 = (esize*1.75)**2;

        do {
          fs.add(l.f);

          /*
          for (let l2 of l.f.loops) {
            let dis2 = l2.e.v1.vectorDistanceSqr(l2.e.v2);

            if (dis2 < esqr2) {
              ok = false;
              break;
            }
          }//*/

          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        if (ok) {
          e.index = es2.length;

          es2.push(e);
          lens.push(lensqr);
        }
      }
    }

    if (es2.length === 0) {
      es_out[0] = new Set(es);
      return;
    }

    es2.sort((a, b) => (lens[b.index] - lens[a.index]));
    if (es2.length > max) {
      es2 = es2.slice(0, ~~(max));
    }

    let ws = [];
    for (let e of es2) {
      ws.push(-lens[e.index]);
    }

    //let heap = new util.MinHeapQueue(es2, ws);

    es2 = new Set(es2);

    let flag2 = MeshFlags.TEMP2;

    //expand
    if (0) {
      for (let e of es2) {
        e.flag &= ~flag2;
      }

      for (let e of es2) {
        if (e.flag & flag2) {
          continue;
        }

        e.flag |= flag2;

        for (let l of e.loops) {
          for (let l2 of l.f.loops) {
            l2.e.flag |= flag2;
            es2.add(l2.e);
          }
        }
      }
    }

    let test = (e) => {
      let dis = edist(e, e.v1, e.v2, eset, cd_curv);
      return dis >= esqr;
    }

    let lctx = new LogContext();
    let cd_node = bvh.cd_node;

    let es3 = new Set(es);
    let newvs = new Set(), newfs = new Set(), killfs = new Set(), newes = new Set();

    let updateflag = BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_OTHER_VERTS;
    updateflag = updateflag | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_TOTTRI;
    updateflag = updateflag | BVHFlags.UPDATE_INDEX_VERTS;

    lctx.onkill = (e, tag) => {
      log.logKill(e, tag);

      if (e.type === MeshTypes.FACE) {
        newfs.delete(e);

        let tris = bvh.getFaceTris(e._old_eid);
        if (tris) {
          for (let t of tris) {
            if (t.node) {
              t.node.setUpdateFlag(updateflag);
            }
          }
        }

        bvh.removeFace(e._old_eid);
      } else if (e.type === MeshTypes.VERTEX) {
        newvs.delete(e);
      } else if (e.type === MeshTypes.EDGE) {
        newes.delete(e);
      }
    }

    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");
    let cd_fset = getFaceSets(mesh, false);

    lctx.onnew = (e, tag) => {
      log.logAdd(e, tag);

      if (cd_curv >= 0 && e.type === MeshTypes.VERTEX) {
        this._checkcurv(e, cd_curv, cd_cotan, true, cd_fset);
      }

      if (e.type === MeshTypes.EDGE) {
        es3.add(e);
        newes.add(e);
      } else if (e.type === MeshTypes.FACE) {
        newfs.add(e);

        for (let l of e.loops) {
          newes.add(l.e);
          es3.add(l.e);

          let node = l.v.customData[cd_node].node;
          if (node) {
            node.setUpdateFlag(updateflag);
          }
        }
      } else if (e.type === MeshTypes.VERTEX) {
        let node = e.customData[cd_node].node;
        if (node) {
          node.setUpdateFlag(updateflag);
        }

        newvs.add(e);
      }
    }

    let es4 = es2;

    let oldnew = lctx.onnew;
    let oldkill = lctx.onkill;

    let esize3 = esize;

    for (let step = 0; step < 4; step++) {
      if (es4.size === 0) {
        break;
      }

      let newes2 = new Set();

      let flag = MeshFlags.TEMP2;

      for (let e of es4) {
        for (let l of e.loops) {
          l.f.flag &= ~flag;
        }
      }

      esize3 *= 0.2;
      let esqr3 = esize3*esize3;

      lctx.onkill = (e, tag) => {
        oldkill(e, tag);

        if (e.type === MeshTypes.VERTEX) {
          let node = e.customData[cd_node].node;
          if (node) {
            node.setUpdateFlag(updateflag);
          }
        } else if (e.type === MeshTypes.EDGE) {
          newes2.delete(e);
          newes_out.delete(e);
        } else if (e.type === MeshTypes.FACE) {
          for (let l of e.loops) {
            let node = l.v.customData[cd_node].node;
            if (node) {
              node.setUpdateFlag(updateflag);
            }

            newes2.delete(l.e);
            newes_out.delete(l.e);
          }
        }
      }

      lctx.onnew = (e, tag) => {
        oldnew(e, tag);

        if (cd_curv >= 0 && e.type === MeshTypes.VERTEX) {
          this._checkcurv(e, cd_curv, cd_cotan, true, cd_fset);
        }

        if (e.type === MeshTypes.EDGE) {
          let ok = newes2.size < max;

          let val = e.v1.valence + e.v2.valence;
          let ok2 = val > 16;

          ok2 = ok2 || edist(e, e.v1, e.v2, eset) >= esqr3;
          ok = ok && ok2;

          if (ok) {
            newes2.add(e);
          } else {
            newes_out.add(e);
          }
        } else if (e.type === MeshTypes.FACE) {
          for (let l of e.loops) {
            if (edist(l.e, l.e.v1, l.e.v2, undefined, cd_curv) >= esqr) {
              newes2.add(l.e);
            } else {
              newes_out.add(l.e);
            }
          }
        } else if (e.type === MeshTypes.VERTEX) {
          let node = e.customData[cd_node].node;

          if (node) {
            node.setUpdateFlag(updateflag);
          }
        }
      }

      //set edge set reference used to feed edist_subd
      eset = es4;

      //try to avoid 4-valence verts by preventing isolated edge splits
      for (let e of new Set(es4)) {
        if (e.l) {
          es4.add(e.l.next.e);
          es4.add(e.l.prev.e);
        }
      }

      const splitSmoothFac = 0.0;

      //pattern based subdivision algo
      if (useSmart) {
        splitEdgesSmart2(mesh, es4, test, lctx, splitSmoothFac);
      } else {
        splitEdgesSimple2(mesh, es4, test, lctx);
      }

      //yield;

      //this.doTopologyValence4(mesh, max, bvh, esize, vs, es, radius, brush, lctx);
      //es = es.filter(e => e.eid >= 0);

      let lens = [];
      let es5 = [];
      for (let i = 0; i < 2; i++) {
        let list = i ? es4 : newes2;

        for (let e of list) {
          if (e.eid < 0) {
            continue;
          }

          let dist = edist(e, e.v1, e.v2, undefined, cd_curv);
          let step2 = Math.min(step, 3)*2;
          let limit = esqr*(step2 + 1)*(step2 + 1);

          if (dist >= limit) {
            let lensqr = weight(e, dist);
            lens.push(lensqr);
            es5.push(e);
          }
          //if (dist >= esqr*(step + 1)*(step + 1)) {

          //}
        }
      }

      es5.sort((a, b) => lens[b.index] - lens[a.index]);
      es4 = new Set(es5);

      /*es4 = es4.filter(e => {
        return edist(e, e.v1, e.v2, undefined, cd_curv) >= esqr*(step + 1)*(step + 1);
      });//*/

      for (let e of es4) {
        e.flag &= ~flag2;
        e.v1.flag &= ~flag2;
        e.v2.flag &= ~flag2;
      }

      for (let e of es4) {
        if (!(e.v1.flag & flag2)) {
          e.v1.flag |= flag2;
          dosmooth(e.v1, 0.25);
        }
        if (!(e.v2.flag & flag2)) {
          e.v2.flag |= flag2;
          dosmooth(e.v2, 0.25);
        }
      }
    }

    newfs = newfs.filter(f => f.eid >= 0);

    for (let e of newes) {
      if (e.eid >= 0) {
        newes_out.add(e);
      }
    }

    for (let v of newvs) {
      for (let e of v.edges) {
        es3.add(e);
      }
    }

    /*
    for (let v of newvs) {
      log.logAddVertex(v);
    }

    for (let e of es2) {
      log.logAddEdge(e);
    }

    for (let e of newes) {
      log.logAddEdge(e);
    }

    for (let f of newfs) {
      if (f.eid < 0) {
        console.warn(f);
        throw new Error("newfs error");
      }

      log.logAddFace(f);
    }*/

    //let newvs = new Set();
    //let newfs = new Set();
    //let killfs = new Set();

    let fs2 = new Set();

    fs = fs.filter(f => f.eid >= 0);
    newfs = newfs.filter(f => f.eid >= 0);

    for (let f of fs) {
      fs2.add(f);
    }

    //console.log("NEW", newvs, newfs, es2, esize);
    //return;
    //let newvs = new Set(), newfs = fs;

    //console.log("new", newvs.size, newes.size, newfs.size, killfs.size);

    //mesh.regenTessellation();

    for (let i = 0; i < 2; i++) {
      let fsiter = i ? fs2 : newfs;

      for (let f of fsiter) {
        if (f.eid < 0) {
          console.warn("eek!", f);
          continue;
        }

        if (0 && f.lists[0].length > 3) {
          let newfaces = new Set();
          let newedges = new Set();

          //log.logKillFace(f);

          f.calcNormal();
          applyTriangulation(mesh, f, newfaces, newedges, lctx);

          for (let e of newedges) {
            newes_out.add(e);
            //log.logAddEdge(e);
          }

          for (let tri of newfaces) {
            //log.logAddFace(tri);

            tri.calcNormal();
            let l = tri.lists[0].l;
            let v1 = l.v, v2 = l.next.v, v3 = l.prev.v;

            let tri2 = bvh.addTri(tri.eid, bvh._nextTriIdx(), v1, v2, v3, undefined, l, l.next, l.prev);
            tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
          }

          continue;
        }

        f.calcNormal();

        let l = f.lists[0].l;
        let firstl = l;
        let _i = 0;

        l = l.next;

        do {
          let v1 = firstl.v;
          let v2 = l.v;
          let v3 = l.next.v;

          if (isNaN(v1.dot(v1))) {
            v1.zero();
            console.log("v1 NaN", v1);
          }
          if (isNaN(v2.dot(v2))) {
            v2.zero();
            console.log("v2 NaN", v2);
          }
          if (isNaN(v3.dot(v1))) {
            v3.zero();
            console.log("v3 NaN", v3);
          }

          //v1[0] += (Math.random()-0.5)*esize*0.2;
          //v1[1] += (Math.random()-0.5)*esize*0.2;
          //v1[2] += (Math.random()-0.5)*esize*0.2;

          let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, undefined, firstl, l, l.next);
          tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

          if (_i++ > 1000) {
            console.error("infinite loop detected!");
            break;
          }

          l = l.next;
        } while (l !== firstl.prev);
      }
    }


    bvh.update();

    if (0) {
      for (let e of new Set(es3)) {
        if (e.eid < 0) {
          continue;
        }

        for (let step = 0; step < 2; step++) {
          let v = step ? e.v2 : e.v1;
          for (let e2 of v.edges) {
            es3.add(e2);
          }
        }
      }
    }

    es_out[0] = es3;
    return;
  }

  _checkOrig(ctx) {
    let brush = this.inputs.brush.getValue();
    let mesh = ctx.mesh;

    if (PaintOpBase.needOrig(brush)) {
      let cd_orig = this.initOrigData(mesh);

      let bvh = this.getBVH(mesh);
      bvh.origCoStart(cd_orig);
    }
  }

  modalStart(ctx) {
    this._checkOrig(ctx);

    this.lastps1 = this.lastps2 = undefined;
    this.dynTopoRand.seed(0);
    this.rand.seed(0);

    this._first2 = true;
    return super.modalStart(ctx);
  }


  modalEnd(was_cancelled) {
    if (!this.modalRunning) {
      return;
    }

    if (this.task) {
      //can't end modal
      console.log("Waiting for task to finish");
      this.taskNext();

      window.setTimeout(() => {
        this.modalEnd(was_cancelled);
      }, 150);

      return;
    }

    let ctx = this.modal_ctx;

    //prevent reference leaks
    this.grabEidMap = undefined;
    if (this.smoother) {
      //this.smoother.finish();
      this.smoother = undefined;
    }

    let ret = super.modalEnd(...arguments);

    if (ctx.toolmode) {
      //stop custom radius drawing for brush circle
      ctx.toolmode._radius = undefined;
    }

    return ret;
  }

  on_mouseup(e) {
    this.mfinished = true;

    let ob = this.modal_ctx.object;
    let mesh = ob ? ob.data : undefined;

    this.modal_ctx.view3d.resetDrawLines();
    this.modalEnd();

    //auto-rebuild bvh if topology changed?
    //if (mesh instanceof Mesh) {
    //mesh.getBVH(true);
    //}
  }
}

ToolOp.register(PaintOp);
