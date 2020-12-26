export const CursorModes = {
  TRANSFORM_CENTER  : 0,
  DEPTH_TEST        : 1,
  LOCKED            : 2
};

export const OrbitTargetModes = {
  FIXED  : 0,
  CURSOR : 1
};

import * as util from '../../util/util.js';
import {Vector4} from '../../util/vectormath.js';

let thehash = new util.HashDigest();

let proj_temps = util.cachering.fromConstructor(Vector4, 128);

//viewSize is a copy of view3d.size, not .glSize
export function project(co, rendermat, viewSize) {
  let tmp = proj_temps.next().zero();

  tmp[0] = co[0];
  tmp[1] = co[1];

  if (co.length > 2) {
    tmp[2] = co[2];
  }

  tmp[3] = 1.0;
  tmp.multVecMatrix(rendermat);

  if (tmp[3] !== 0.0) {
    tmp[0] /= tmp[3];
    tmp[1] /= tmp[3];
    tmp[2] /= tmp[3];
  }

  let w = tmp[3];

  tmp[0] = (tmp[0]*0.5 + 0.5) * viewSize[0];
  tmp[1] = (1.0-(tmp[1]*0.5+0.5)) * viewSize[1];

  for (let i=0; i<co.length; i++) {
    co[i] = tmp[i];
  }

  return w;
}

export function calcUpdateHash(view3d, do_objects=true) {
  thehash.reset();

  if (do_objects) {
    for (let ob of view3d.sortedObjects) {
      thehash.add(ob.lib_id);

      if (ob.updateGen !== undefined) {
        thehash.add(ob.updateGen);
      }

      //console.log("UPDATEGEN:", ob.updateGen, ob.data.updateGen);

      if (ob.data instanceof Mesh) {
        let mesh = ob.data;

        thehash.add(mesh.verts.length);
        thehash.add(mesh.faces.length);
        thehash.add(mesh.edges.length);
        thehash.add(mesh.loops.length);

        if (mesh._ltris) {
          thehash.add(mesh._ltris.length);
        }
      }
      if (ob.data.updateGen !== undefined) {
        thehash.add(ob.data.updateGen);
      }
    }
  }

  for (let i=0; i<3; i++) {
    thehash.add(view3d.camera.pos[i]);
    thehash.add(view3d.camera.target[i]);
    thehash.add(view3d.camera.up[i]);
    thehash.add(view3d.camera.near);
    thehash.add(view3d.camera.far);
    thehash.add(view3d.camera.fovy);
    thehash.add(view3d.camera.aspect);
  }

  thehash.add(view3d.drawHash);

  //console.log("HASH", thehash.get());

  return thehash.get();
}
