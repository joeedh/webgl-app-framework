import * as vectormath from './vectormath.js';
import * as math from './math.js';
import * as util from './util.js';

import {Mesh} from '../core/mesh.js';

let Vector3 = vectormath.Vector3;

export function readOBJ(buf) {
  let lines = buf.split("\n");
  let lines2 = [];

  for (let l of lines) {
    l = l.trim();
    if (l.length == 0 || l.startsWith("#")) {
      continue;
    }

    lines2.push(l);
  }
  lines = lines2;

  let me = new Mesh();
  let vert_uvs = [];
  let vert_nos = [];

  for (let i=0; i<lines.length; i++) {
    let l = lines[i].split(" ");
    if (l.length == 0) {
      continue;
    }

    l[0] = l[0].toLowerCase();

    for (let j=1; l[0] != "f" && j<l.length; j++) {
      l[j] = parseFloat(l[j]);
    }

    if (l[0] == "v") {
      me.makeVertex(l.slice(1, 4));
    } else if (l[0] == "vt") {
      vert_uvs.push(l.slice(1, 3));
    } else if (l[0] == "vn") {
      vert_nos.push(new Vector3(l.slice(1, 4)));
    } else if (l[0] == "f") {
      let vs = l.slice(1, l.length);

      let fvs = [];
      let uvs = [];

      for (let s of vs) {
        let vi, vt, vn;

        if (s.match(/\/\//)) {
          s = s.split(/\/\//);
          vi = parseInt(s[0]);
          vn = parseInt(s[1]);

          vi = vi >= 0 ? vi-1 : vs.length + vi;
          vn = vn >= 0 ? vn-1 : vs.length + vn;
        } else if (s.match(/\//)) {
          s = s.split(/\//);
          vi = parseInt(s[0]);
          vt = parseInt(s[1]);
          vn = parseInt(s[2]);

          vi = vi >= 0 ? vi-1 : vs.length + vi;
          vt = vt >= 0 ? vt-1 : vs.length + vt;
          vn = vn >= 0 ? vn-1 : vs.length + vn;

          uvs.push(vert_uvs[vt]);
        } else {
          vi = parseInt(s);
          vi = vi >= 0 ? vi-1 : vs.length + vi;
        }

        fvs.push(me.verts[vi]);
      }

      let f = me.makeFace(fvs);
      for (let j=0; j<uvs.length; j++) {
        //XXX get uvs working again
        //f.uvs[j].load(uvs[j]);
      }
    }
  }

  me.recalcNormals();
  return me;
};
