export const CursorModes = {
  TRANSFORM_CENTER  : 0,
  DEPTH_TEST        : 1,
  LOCKED            : 2
};

export const OrbitTargetModes = {
  FIXED  : 0,
  CURSOR : 1
};

import * as util from '../../path.ux/scripts/util/util.js';

let thehash = new util.HashDigest();

export function calcUpdateHash(view3d, do_objects=true) {
  thehash.reset();

  if (do_objects) {
    for (let ob of view3d.sortedObjects) {
      thehash.add(ob.lib_id);

      if (ob.updateGen !== undefined) {
        thehash.add(ob.updateGen);
      }

      //console.log("UPDATEGEN:", ob.updateGen, ob.data.updateGen);

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
