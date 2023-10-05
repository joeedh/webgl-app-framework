import {isect_ray_plane, Matrix4, ToolOp, Vector2, Vector3, Vector4} from '../../../path.ux/scripts/pathux.js';
import {castViewRay} from '../findnearest.js';
import {SelMask} from '../selectmode.js';
import {SnapModes, TransformOp} from './transform_ops.js';
import {MeshFlags, MeshTypes} from '../../../mesh/mesh_base.js';

class Region {
  constructor() {
    this.faces = new Set();
    this.verts = new Set();
    this.edges = new Set();

    this.outervs = new Set();
    this.outeres = new Set();
    this.startCos = new Map();

    this.dirmap = new Map(); /* Maps vertices to unit vectors. */
    this.no = new Vector3();
  }
}

export class InsetTransformOp extends TransformOp {
  constructor(start_mpos) {
    super();

    this.startMpos = new Vector2();
    this.scale = 1.0;
    this.plane = new Vector3();

    this.regions = undefined;

    if (start_mpos !== undefined) {
      this.startMpos.load(start_mpos);
      this.startMpos[2] = 0.0;

      this.first = false;
    } else {
      this.first = true;
    }
  }

  static tooldef() {
    return {
      uiname     : "Inset Transform",
      description: "",
      toolpath   : "view3d.transform_inset",
      is_modal   : true,
      inputs     : ToolOp.inherit({}),
      icon       : -1
    }
  }

  numericSet(val) {
    console.error("numericSet: implement me");
  }

  on_pointermove(e) {
    super.on_pointermove(e);

    const ctx = this.modal_ctx;
    const view3d = ctx.view3d;
    const mesh = ctx.mesh;

    let mpos = new Vector2(view3d.getLocalMouse(e.x, e.y));

    if (this.first) {
      this.startMpos.load(mpos);
      this.first = false;
      return;
    }

    let regions = this.getRegions(mesh);
    this.scale = 0.001; //XXX

    let offset = mpos.vectorDistance(this.startMpos)*this.scale;

    console.log("offset:", offset);
    this.inputs.value.setValue(new Vector3([offset, 0.0, 0.0]));

    this.exec(ctx);
    this.doUpdates(ctx);
    window.redraw_viewport(true);
  }

  getRegions(mesh) {
    if (this.regions) {
      return this.regions;
    }

    let regions = [];
    let stack = [];
    let visit = new WeakSet();

    for (let f of mesh.faces.selected.editable) {
      if (visit.has(f)) {
        continue;
      }

      stack.length = 0;
      stack.push(f);
      visit.add(f);

      let region = new Region();
      regions.push(region);

      while (stack.length > 0) {
        let f2 = stack.pop();
        region.faces.add(f2);

        for (let list of f2.lists) {
          for (let l of list) {
            for (let l2 of l.e.loops) {
              if (l2.f.flag & MeshFlags.HIDE) {
                continue;
              }

              if ((l2.f.flag & MeshFlags.SELECT) && !visit.has(l2.f)) {
                stack.push(l2.f);
                visit.add(l2.f);
              }
            }
          }
        }
      }

      console.log(region.faces);

      for (let f2 of region.faces) {
        for (let list of f2.lists) {
          for (let l of list) {
            region.verts.add(l.v);
            region.edges.add(l.e);
          }
        }
      }

      for (let e of region.edges) {
        let bound = false;

        for (let l of e.loops) {
          if (l.f.flag & MeshFlags.HIDE) {
            continue;
          }

          if (!region.faces.has(l.f)) {
            bound = true;
            break;
          }
        }

        if (bound) {
          region.outeres.add(e);
          region.outervs.add(e.v1);
          region.outervs.add(e.v2);
        }
      }

      console.log("boundary", region.outeres, region.outervs);

      let t1 = new Vector3();
      let t2 = new Vector3();
      let t3 = new Vector3();
      let t4 = new Vector3();
      let no = new Vector3();

      for (let v of region.outervs) {
        let e1, e2;

        region.startCos.set(v, new Vector3(v));

        for (let e of v.edges) {
          if (region.outeres.has(e)) {
            if (!e1) {
              e1 = e;
            } else if (!e2) {
              e2 = e;
              break;
            }
          }
        }

        if (!e1 || !e2) {
          console.warn("Missing edge", e1, e2);
          continue;
        }

        let l1, l2;
        for (let l of e1.loops) {
          if (region.faces.has(l.f)) {
            l1 = l;
            break;
          }
        }

        for (let l of e2.loops) {
          if (region.faces.has(l.f)) {
            l2 = l;
            break;
          }
        }

        no.load(l1.f.no);
        if (l1.f.no.dot(l2.f.no) < 0.0) {
          no.addFac(l2.f.no, -1.0).normalize();
        } else {
          no.add(l2.f.no).normalize();
        }

        let vp = e1.otherVertex(v), vn = e2.otherVertex(v);

        t1.load(v).sub(vp).normalize();
        t2.load(vn).sub(v).normalize();
        t1.add(t2).cross(no).normalize();

        /* Enforce winding. */

        if (v !== l1.v) {
          t1.negate();
        }

        region.dirmap.set(v, new Vector3(t1));
      }
    }

    this.regions = regions;
    return regions;
  }

  exec(ctx) {
    super.exec(ctx);
    let mesh = ctx.mesh;

    let regions = this.getRegions(mesh);
    let offset = this.inputs.value.getValue()[0];

    for (let region of regions) {
      for (let v of region.outervs) {
        let startco = region.startCos.get(v);
        let dir = region.dirmap.get(v);

        if (!dir) {
          console.log("no dir", v);
          continue;
        }

        v.load(startco).addFac(dir, offset);
        v.flag |= MeshFlags.UPDATE;
      }
    }

    mesh.regenTessellation();
    mesh.regenRender();
    mesh.regenBVH();
    window.redraw_viewport(true);
  }

  execPost(ctx) {
    this.regions = undefined;
  }
}

ToolOp.register(InsetTransformOp);
