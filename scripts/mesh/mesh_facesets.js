import {CustomDataElem} from './customdata.js';
import {util, Vector4} from '../path.ux/scripts/pathux.js';
import {BVHVertFlags} from '../util/bvh.js';

export function getFaceSets(mesh, autoCreate=true) {
  let added = false;

  if (autoCreate && !mesh.faces.customData.hasNamedLayer("face_sets", "int")) {
    mesh.faces.addCustomDataLayer("int", "face_sets");
    added = true;
  }

  const cd_fset = mesh.faces.customData.getNamedLayerIndex("face_sets", "int");

  if (added) {
    for (let f of mesh.faces) {
      f.customData[cd_fset].value = 1; //base face set
    }
  }

  return cd_fset;
}

export function getNextFaceSet(mesh) {
  let cd_fset = getFaceSets(mesh);

  let maxf = 1;

  for (let f of mesh.faces) {
    maxf = Math.max(maxf, Math.abs(f.customData[cd_fset].value));
  }

  console.log("getNextFaceSet", cd_fset, maxf+1);

  return maxf + 1;
}

let clr_rets = util.cachering.fromConstructor(Vector4, 64);

export function getFaceSetColor(fset) {
  fset = Math.abs(fset);

  let ret = clr_rets.next();

  if (fset === 0) {
    ret[0] = ret[1] = ret[2] = 0.0;
    ret[3] = 1.0;

    return ret;
  } else if (fset === 1) {
    ret[0] = ret[1] = ret[2] = 1.0;
    ret[3] = 1.0;

    return ret;
  }

  let f = fset*0.2123432423;

  ret[0] = Math.fract(f);
  ret[1] = Math.fract(f*2.32423 + 0.32423);
  ret[2] = Math.fract(f*5.23423 + 0.534324);
  ret[3] = 1.0;

  return ret;
}

export function getCornerFlag() {
  return BVHVertFlags.CORNER_MESH;
}

export function getSmoothBoundFlag() {
  return BVHVertFlags.BOUNDARY_FSET;
}
