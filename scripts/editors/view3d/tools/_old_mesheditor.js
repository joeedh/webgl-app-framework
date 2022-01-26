import {ExtrudeRegionsOp} from '../../../mesh/mesh_ops.js';
import {ToolMode} from '../view3d_toolmode.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../selectmode.js';
import {Mesh, MeshTypes, MeshFlags, MeshModifierFlags} from '../../../mesh/mesh.js';
import * as util from '../../../util/util.js';
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from '../../../core/simplemesh.js';
import {Shaders} from '../../../shaders/shaders.js'
import {FindNearestRet} from "../findnearest.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import * as math from '../../../util/math.js';
import {SelectOneOp} from '../../../mesh/select_ops.js';
import {KeyMap, HotKey} from "../../editor_base.js";
import {keymap} from '../../../path.ux/scripts/util/simple_events.js';
import {ToolOp, ToolFlags, UndoFlags, ToolMacro} from '../../../path.ux/scripts/toolsys/simple_toolsys.js';
import {BasicMeshDrawer} from '../view3d_draw.js';
import {MeshCache} from '../view3d_toolmode.js';
import {SubsurfDrawer} from '../../../subsurf/subsurf_draw.js';
let STRUCT = nstructjs.STRUCT;

//each subeditor should fill in these tools
export const MeshTools = {
  SELECTONE         : SelectOneOp,
  TOGGLE_SELECT_ALL : undefined,
  CIRCLE_SELECT     : undefined,
  BOX_SELECT        : undefined,
  SELECT_LINKED     : undefined,
  DELETE            : undefined,
  DUPLICATE         : undefined
};

import {Colors, elemColor} from '../view3d_draw.js';

export class MeshEditor extends ToolMode {
  constructor(manager) {
    super(manager);

    this._findnearest_rets = util.cachering.fromConstructor(FindNearestRet, 64);

    this.drawvisit = new util.set();
    this.meshcache = new util.hashtable();

    this.defineKeyMap();
  }

  static define() {return {
    apiname  : "mesh",
    uiname   : "Mesh",
    icon     : -1,
    selmask  : SelMask.VERTEX|SelMask.FACE|SelMask.EDGE,
    stdtools : MeshTools //see StandardTools
  }}

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("D", [], "mesh.subdivide_smooth()")
    ]);

    return this.keymap;
  }

  clickselect(evt, x, y, selmask) {
    let ret = this.findnearest(this.ctx, x, y, selmask);

    if (ret !== undefined) {
      console.log("click select", ret);

      let ob = ret.object;
      let mesh = ob.data;
      let e = ret.data;

      let tool = new SelectOneOp();
      tool.inputs.object.setValue(ob);
      tool.inputs.eid.setValue(e.eid);
      tool.inputs.selmask.setValue(selmask);

      let mode;

      if (evt.shiftKey) {
        mode = (e.flag & MeshFlags.SELECT) ? SelOneToolModes.SUB : SelOneToolModes.ADD;
      } else {
        mode = SelOneToolModes.UNIQUE;
      }

      tool.inputs.mode.setValue(mode);
      this.ctx.toolstack.execTool(this.ctx, tool);

      window.redraw_viewport();
      return true;
    }

    return undefined;
  }

  clearHighlight(ctx) {
    window.redraw_viewport();

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let k in mesh.elists) {
        let list = mesh.elists[k];

        if (list.highlight !== undefined) {
          list.highlight = undefined;
          window.redraw_viewport();
        }
      }
    }
  }

  on_mousemove(ctx, x, y, was_touch) {
    /*
    if (this.view3d.gl !== undefined) {
      let sbuf = this.view3d.getSelectBuffer(ctx);
      let dpi = devicePixelRatio;
      console.log(sbuf.sampleBlock(ctx, this.view3d.gl, this.view3d, x, y, 2, 2));
    }
    //*/

    let ret = this.findnearest(ctx, x, y);

    if (ret !== undefined) {
      let ob = ret.object;
      let mesh = ob.data;
      let list = mesh.getElemList(ret.data.type);

      if (list.highlight !== ret.data) {
        this.clearHighlight(ctx);

        list.highlight = ret.data;
        window.redraw_viewport();
      }

      //console.log(ret.data.eid, ret.data);
    } else {
      this.clearHighlight(ctx);
    }
  }

  on_drawstart(gl) {
    this.drawvisit.clear();
  }

  resyncMeshCache(gl, object, mesh) {
    console.log("syncing");
    let mc = this.meshcache.get(mesh.lib_id);

    mc.partialGen = mesh.partialUpdateGen;
    mc.drawer.sync(this.view3d, gl, object);
  }

  getMeshCache(gl, object, mesh) {
    let regen = !this.meshcache.has(mesh.lib_id);
    regen = regen || this.meshcache.get(mesh.lib_id).gen != mesh.updateGen;

    if (!regen) {
      let mc = this.meshcache.get(mesh.lib_id);

      if (!!(mesh.flag & MeshModifierFlags.SUBSURF) != !!(mc.drawer instanceof SubsurfDrawer)) {
        regen = true;
        console.log("REGEN");
      }
    }

    let resync = !regen && (this.meshcache.get(mesh.lib_id).partialGen != mesh.partialUpdateGen);

    if (regen) {
      this.rebuildMeshCache(gl, object, mesh);
    } else if (resync) {
      this.resyncMeshCache(gl, object, mesh);
    }

    return this.meshcache.get(mesh.lib_id);
  }

  rebuildMeshCache(gl, object, mesh) {
    let mc;

    console.log("rebuilding mesh cache");

    if (!this.meshcache.has(mesh.lib_id)) {
      mc = new MeshCache(mesh.lib_id);
      this.meshcache.set(mesh.lib_id, mc);
    } else {
      this.meshcache.get(mesh.lib_id).destroy(gl);

      mc = new MeshCache(mesh.lib_id);
      this.meshcache.set(mesh.lib_id, mc);
    }

    if (mesh.flag & MeshModifierFlags.SUBSURF) {
      mc.drawer = new SubsurfDrawer(mesh, mc);
    } else {
      mc.drawer = new BasicMeshDrawer(mesh, mc);
    }

    mc.gen = mesh.updateGen;

    return;
    let layerTypes = LayerTypes.LOC|LayerTypes.COLOR|LayerTypes.ID;

    let vm = mc.makeChunkedMesh("verts", layerTypes);

    for (let v of mesh.verts) {
      if (v.flag & MeshFlags.HIDE)
        continue;

      let p = vm.point(v.eid, v);

      p.ids(v.eid);
      p.colors(elemColor(v));
    }

    let em = mc.makeChunkedMesh("edges", layerTypes);
    for (let e of mesh.edges) {
      if (e.flag & MeshFlags.HIDE)
        continue;

      let l = em.line(e.eid, e.v1, e.v2);

      let c = elemColor(e);

      l.ids(e.eid, e.eid);
      l.colors(c, c);
    }

    let fm = mc.makeChunkedMesh("faces", layerTypes);

    let ltris = mesh.loopTris;

    for (let i=0; i<ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];
      let f = l1.f;

      if (f.flag & MeshFlags.HIDE) {
        continue;
      }

      let c = elemColor(f);
      if (!(f.flag & MeshFlags.SELECT)) {
        c = Colors.FACE_UNSEL;
      }

      let tri = fm.tri(i, l1.v, l2.v, l3.v);

      tri.colors(c, c, c);
      tri.ids(f.eid, f.eid, f.eid);
    }
    return mc;
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)*/
  draw(gl, uniforms, program, object, mesh) {
    if (object.data === undefined || !(object.data instanceof Mesh))
      return false;

    this.drawvisit.add(mesh);

    let mc = this.getMeshCache(gl, object, mesh);
    mc.drawer.draw(this.view3d, gl, object, uniforms, program);
  }

  on_drawend(gl) {
    let drawvisit = this.drawvisit;

    for (let mesh_id of list(this.meshcache)) {
      let mesh = this.ctx.datalib.get(mesh_id);
      if (mesh === undefined) {
        console.log("mesh was deleted: " + mesh_id);
        continue;
      }

      if (!drawvisit.has(mesh)) {
        console.log("pruning unneeded mesh cache for", mesh.name);

        let val = this.meshcache.get(mesh_id);
        console.log(mesh);
        this.meshcache.remove(mesh_id);

        val.destroy(gl);
      }
    }
  }

  destroy() {
    let gl = this.view3d.gl;

    for (let key of this.meshcache) {
      let val = this.meshcache.get(key);
      val.destroy(gl);
    }

    this.meshcache = new util.hashtable();
  }

  findnearestVertex(ctx, x, y, limit) {
    let p = new Vector2();
    let p2 = new Vector3();

    let view3d = this.view3d;

    p[0] = x;
    p[1] = y;

    let mindis, minob, minv;
    let minp2 = new Vector2(), minp3 = new Vector3();

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let v of mesh.verts.editable) {
        p2.load(v);
        view3d.project(p2);

        let dis = p.vectorDistance(p2);
        if (dis < limit && (mindis === undefined || dis < mindis)) {
          mindis = dis;
          minv = v;
          minob = ob;

          minp3.load(v);
          minp2.load(p2);
        }
      }
    }

    if (mindis !== undefined) {
      let ret = this._findnearest_rets.next();

      ret.dis = mindis;
      ret.data = minv;
      ret.object = minob;
      ret.p2d.load(minp2);
      ret.p3d.load(minp3);

      return ret;
    }
  }

  findnearestEdge(ctx, x, y, limit) {
    let p = new Vector2();
    let p1 = new Vector3();
    let p2 = new Vector3();

    let view3d = this.view3d;

    p[0] = x;
    p[1] = y;

    let mindis, minob, mine;
    let minp2 = new Vector2(), minp3 = new Vector3();

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let e of mesh.edges.editable) {
        p1.load(e.v1);
        p2.load(e.v2);

        view3d.project(p1);
        view3d.project(p2);

        let dis = math.default.dist_to_line_2d(p, p1, p2, true);
        //let dis = 1000.0;

        if (dis < limit && (mindis === undefined || dis < mindis)) {
          mindis = dis;
          mine = e;
          minob = ob;

          minp2.load(p1).interp(p2, 0.5);
          minp3.load(e.v1).interp(e.v2, 0.5);
        }
      }
    }

    if (mindis !== undefined) {
      let ret = this._findnearest_rets.next();

      ret.dis = mindis;
      ret.data = mine;
      ret.object = minob;
      ret.p2d.load(minp2);
      ret.p3d.load(minp3);

      return ret;
    }
  }

  findnearestFace(ctx, x, y, limit) {
    let p = new Vector2();
    let p2 = new Vector3();

    let view3d = this.view3d;

    p[0] = x;
    p[1] = y;

    let mindis, minob, minf;
    let minp2 = new Vector2(), minp3 = new Vector3();

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let f of mesh.faces.editable) {
        p2.load(f.cent);
        view3d.project(p2);

        let dis = p.vectorDistance(p2);
        if (dis < limit && (mindis === undefined || dis < mindis)) {
          mindis = dis;
          minf = f;
          minob = ob;

          minp3.load(f.cent);
          minp2.load(p2);
        }
      }
    }

    if (mindis !== undefined) {
      let ret = this._findnearest_rets.next();

      ret.dis = mindis;
      ret.data = minf;
      ret.object = minob;
      ret.p2d.load(minp2);
      ret.p3d.load(minp3);

      return ret;
    }
  }

  findnearestSolid(ctx, x, y, selmask, limit=75) {
    let view3d = this.view3d;
    let sbuf = view3d.selectbuf;

    limit = Math.max(~~limit, 1);

    x = ~~x;
    y = ~~y;

    x -= limit >> 1;
    y -= limit >> 1;

    let sample = sbuf.sampleBlock(ctx, this.view3d.gl, this.view3d, x, y, limit, limit);
    if (sample === undefined) {
      return;
    }

    //console.log(sample.data);

    let block = sample.data;
    let order = sample.order;

    for (let i of order) {
      let x2 = i % limit, y2 = ~~(i / limit);
      i *= 4;

      let idx = ~~(block[i]+0.5), ob = ~~(block[i+1]+0.5);
      idx--;

      if (idx < 0)
        continue;

      let id = ob;
      ob = ctx.datalib.get(ob);

      if (ob === undefined || ob.data === undefined || !(ob.data instanceof Mesh)) {
        //console.warn("warning, invalid object", id);
        continue;
      }

      let mesh = ob.data;
      let e = mesh.eidmap[idx];

      if (e === undefined) {
        //console.warn("warning, invalid eid", idx);
        continue;
      }

      if (selmask & e.type) {
        let ret = this._findnearest_rets.next();

        //x2 -= limit*0.5;
        //y2 -= limit*0.5;

        ret.object = ob;
        ret.data = e;
        ret.dis = Math.sqrt(x2*x2 + y2*y2);
        ret.p2d.zero();
        ret.p2d[0] = y + y2;
        ret.p2d[1] = y + y2;

        //console.log(ret.data);
        return ret;
      }
    }
  }

  findnearest(ctx, x, y, selmask=undefined, limit=75) {
    if (selmask === undefined) {
      selmask = this.view3d.ctx.selectMask;
    }

    if (!this.view3d.select_transparent) {
      return this.findnearestSolid(ctx, x, y, selmask, limit);
    }
    //console.log(sbuf.sampleBlock(ctx, this.view3d.gl, this.view3d, x, y, 2, 2));

    let ret = undefined;

    if (selmask & SelMask.VERTEX) {
      ret = this.findnearestVertex(ctx, x, y, limit);
    }

    if (selmask & SelMask.EDGE) {
      let ret2 = this.findnearestEdge(ctx, x, y, limit);
      if (ret !== undefined && ret2 !== undefined) {
        ret = ret2.dis < ret.dis ? ret2 : ret;
      } else if (ret === undefined) {
        ret = ret2;
      }
    }

    if (selmask & SelMask.FACE) {
      let ret2 = this.findnearestFace(ctx, x, y, limit);
      if (ret !== undefined && ret2 !== undefined) {
        ret = ret2.dis < ret.dis ? ret2 : ret;
      } else if (ret === undefined) {
        ret = ret2;
      }
    }

    return ret;
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)
  *
  * id_offset offsets the ids.  note that I might not need it.
  * since if I use 16-bit textures I can pack a source object id
  * along with the element id
  * */
  drawIDs(gl, uniforms, object, mesh, id_offset) {
    if (!(this.view3d.ctx.selectMask & SelMask.GEOM)) {
      return;
    }

    if (object.data === undefined || !(object.data instanceof Mesh))
      return false;

    let mc = this.getMeshCache(gl, object, mesh);

    return mc.drawer.drawIDs(this.view3d, gl, object, uniforms);
  }
}

MeshEditor.STRUCT = STRUCT.inherit(MeshEditor, ToolMode) + `
}
`;
nstructjs.register(MeshEditor);

ToolMode.register(MeshEditor);
