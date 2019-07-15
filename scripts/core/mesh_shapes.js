import {MeshTypes, MeshFlags, Mesh} from './mesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';

export function makeCube(mesh) {
  mesh = mesh === undefined ? new Mesh() : mesh;
  
  function hashco(v) {
    return v[0].toFixed(5) + ":" + v[1].toFixed(5) + ":" + v[2].toFixed(5);
  }
  let map = {};
  
  function getvert(p) {
    let k = hashco(p);
    if (k in map) {
      //return map[k];
    }
    
    map[k] = mesh.makeVertex(p);
    return map[k];
  }
  
  function quad(axis, sign) {
    let i1 = (axis+1) % 3;
    let i2 = (axis+2) % 3;
    
    let vs = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
    for (let i=0; i<vs.length; i++) {
      vs[i][0] = vs[i][1] = vs[i][2] = -1;
    }
    
    vs[0][axis] = vs[1][axis] = vs[2][axis] = vs[3][axis] = sign;
    
    vs[1][i1] = 1;
    vs[2][i1] = vs[2][i2] = 1;
    vs[3][i2] = 1;
    
    for (let i=0; i<vs.length; i++) {
      vs[i] = getvert(vs[i]);
    }
    
    mesh.makeFace(vs);
  }
  
  for (let i=0; i<3; i++) {
    quad(i, 1);
    quad(i, -1);
  }
  
  mesh.recalcNormals();
  return mesh;
}
