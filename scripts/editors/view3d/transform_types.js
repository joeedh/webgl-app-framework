import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';
import {MeshFlags, MeshTypes} from '../../core/mesh.js';
import {PropModes, TransDataType, TransDataElem} from './transform_base.js';
import * as util from '../../util/util.js';

export class MeshTransType extends TransDataType {
  static genData(ctx, selectmode, propmode, propradius) {
    let mesh = ctx.mesh;
    
    if (propmode != PropModes.NONE) {
      let i = 0;
      let tdata = [];
      let unset_w = 100000.0;
      
      for (let v of mesh.verts.editable) {
        v.index = i;
        
        let td = new TransDataElem();
        td.data1 = v;
        td.data2 = new Vector3(v);
        
        tdata.push(td);
        
        td.w = v.flag & MeshFlags.SELECT ? 0.0 : unset_w;
        i++;
      }
      
      //let visit = new util.set();
      let visit = new Array(tdata.length);
      let limit = 2;
      
      for (let i=0; i<visit.length; i++) {
        visit[i] = 0;
      }
      
      let stack = new Array(1024);
      stack.cur = 0;
      
      for (let v of mesh.verts.selected.editable) {
        stack.cur = 0;
        stack[0] = v;
        let startv = v;
        
        while (stack.cur >= 0) {
          let v = stack[stack.cur--];
          let td1 = tdata[v.index];
          
          for (let e of v.edges) {
            let v2 = e.otherVertex(v);
            
            if (visit[v2.index]>limit || (v2.flag & MeshFlags.HIDE) || (v2.flag & MeshFlags.SELECT)) {
              continue;
            }
            
            let td2 = tdata[v2.index];
            let dis = td1.w + e.v2.vectorDistance(e.v1);
            td2.w = Math.min(td2.w, dis);
            
            if (td2.w < propradius) {
              stack[stack.cur++] = v2;
            }
          }
          
          if (stack.cur >= stack.length-50) {
            stack.length = ~~(stack.length*1.5);
            console.log("reallocation in proportional edit mode recursion stack", stack.length);
          }
        }
      }
      
      for (let v of mesh.verts.editable) {
        if (v.flag & MeshFlags.SELECT) {
          tdata[v.index].w = 1;
        } else if (tdata[v.index].w == unset_w) {
          tdata[v.index].w = 0;
        } else {
          tdata[v.index].w = TransDataType.calcPropCurve(tdata[v.index].w);
        }
      }
    } else {
      for (let v of mesh.verts.selected.editable) {
        let td = new TransDataElem();
        td.data1 = v;
        td.data2 = new Vector3(v);
        td.w = 1.0;
      }
    }

    return tdata;
  }
  
  static applyTransform(ctx, elem, do_prop, matrix) {
    let td = elem;
    
    td.data1.load(td.data2).multVecMatrix(matrix);
  }
  
  static undoPre(ctx, elemlist) {
    let cos = {};
    let nos = {};
    let fnos = {};
    let fcos = {};
    
    for (let td of elemlist) {
      let v = td.data1;
      
      for (let f of v.faces) {
        if (f.eid in fnos) 
          continue;
        
        fnos[f.eid] = new Vector3(f.no);
        fcos[f.eid] = new Vector3(f.cent);
      }
      
      cos[v.eid] = new Vector3(v);
      nos[v.eid] = new Vector3(v.no);
    }
    
    return {
      cos : cos,
      nos : nos,
      fnos : fnos,
      fcos : fcos
    };
  }
  
  static undo(ctx, undodata) {
    let cos = undodata.cos;
    let nos = undodata.nos;
    let fcos = undodata.fcos;
    let fnos = undodata.fnos;
    let mesh = ctx.mesh;
    
    for (let k in cos) {
      let v = mesh.eidmap[k];
      
      if (v === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }
      
      v.load(cos[k]);
      v.no.load(nos[k]);
    }
    
    for (let k in fcos) {
      let f = mesh.eidmap[k];
      
      if (f === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }
      
      f.no.load(fnos[k]);
      f.cent.load(fcos[k]);
    }
    
    mesh.regenRender();
  }
  
  static getCenter(ctx, elemlist) {
    let c = new Vector3();
    let tot = 0.0;
    
    for (let td of elemlist) {
      c.add(td.data2);
      tot += 1.0;
    }
    
    if (tot > 0) {
      c.mulScalar(1.0 / tot);
    }
    
    return c;
  }
  
  static calcAABB(ctx, elemlist) {
    let d = 1e17;
    let min = new Vector3([d, d, d]), max = new Vector3([-d, -d, -d]);
    let ok = false;
    
    for (let td of elemlist) {
      min.min(td.data2);
      max.max(td.data2);
      ok = true;
    }
    
    if (!ok) {
      min.zero();
      max.zero();
    }
    
    return [min, max];
  }
  
  static update(ctx, elemlist) {
    ctx.mesh.regenRender();
  }
}
TransDataType.register(MeshTransType);
