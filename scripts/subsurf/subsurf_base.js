export const PCOS=0, PEID=PCOS+16*3, PCOLOR=PEID+1, PTOT=PCOLOR+4;

export class PatchList {
  constructor() {
    this.patchdata = [];
    this.eidmap = {};
    this.gltex = undefined;
    this.texdimen = undefined;
  }

  destroy(gl) {
    if (this.gltex !== undefined) {
      this.gltex.destroy(gl);
      this.gltex = undefined;
    }
  }
}

//export class SubSurf
export class PatchData {
  constructor() {
    this.ps = new Float64Array(16*3);
    this.ns = new Float64Array(16*3); //normals?

    this.eid = 0;
    this.i = 0;
    this.color = [1, 1, 1, 1];
    this.flag = 0;
  }
}
