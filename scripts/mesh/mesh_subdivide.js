
export function splitEdgesSmart(mesh, es) {
  let vs = new Set();

  for (let e of es) {
    vs.add(e.v1);
    vs.add(e.v2);
  }

  let newvs = new Set();
  let killfs = new Set();
  let fs = new Set();

  for (let e of es) {
    if (e.l === undefined) {
      continue;
    }

    for (let l of e.loops) {
      fs.add(l.f);
    }

    let nev = mesh.splitEdge(e, 0.5);

    newvs.add(nev[1]);
  }

  let patterns = [
    [[1, 0, 0, 0], [2, -1, -1, -1]], //triangle with one split edge
    [[1, 0, 0, 0, 0], [2, -1, -1, -1, -1]], //quad with one split edge
    [[1, 0, 1, 0, 0, 0], [2, -1, -1, 5, -1, -1]], //quad with two edges
    //[4, -1, -1, -1, -2, -1],
  ]

  let ptable = new Array(1024);
  let temps = new Array(1024);

  //mirror patterns
  for (let pat of patterns.concat([])) {
    let pat2 = [new Array(pat[0].length), new Array(pat[1].length)];

    for (let i = 0; i < pat2[1].length; i++) {
      pat2[1][i] = -1;
    }

    for (let i = 0; i < pat2[0].length; i++) {
      let i2 = (i + pat2[0].length - 1) % pat2[0].length;
      i2 = pat2[0].length - 1 - i2;

      pat2[0][i] = pat[0][i2];
      let t = pat[1][i2];

      if (t >= 0) {
        t = (t + pat2[0].length - 1) % pat2[0].length;
        t = pat2[0].length - 1 - t;

        pat2[1][i] = t;
      } else {
        pat2[1][i] = -1;
      }

    }

    //console.log(pat, pat2);
    patterns.push(pat2);
  }

  let pat = [[1, 0, 1, 0, 1, 0], [2, -1, 4, -1, 0, -1]]; //tri with three edges
  patterns.push(pat);

  for (let pat of patterns) {
    let mask = 0;

    let pmask = pat[0];
    pat = pat[1];

    for (let i = 0; i < pat.length; i++) {
      if (pmask[i]) {
        mask |= 1 << i;
      }
    }

    mask |= pat.length << 8;
    ptable[mask] = pat;
    temps[mask] = new Array(pat.length);
  }

  let newfs = new Set();

  for (let f of fs) {
    let l1;

    let tot = 0;
    for (let l of f.lists[0]) {
      tot++;
    }

    for (let l of f.lists[0]) {
      if (newvs.has(l.v)) {
        l1 = l;
        break;
      }
    }

    if (!l1) {
      continue;
    }

    let l = l1;
    let mi = 0;
    let mask = tot << 8;

    do {
      if (newvs.has(l.v)) {
        mask |= 1 << mi;
      }

      mi++;
      l = l.next;
    } while (l !== l1);

    if (mask === (1|4|16|64) + (8<<8)) {
      //console.log("quad!");
      let l2 = mesh.splitFace(f, l1, l1.next.next.next.next);

      newfs.add(l2.f);

      let olde = l2.e;
      let nev = mesh.splitEdge(l2.e, 0.5);

      let [newe, newv] = nev;

      newvs.add(newv);

      for (let step=0; step<2; step++) {
        let e2 = step ? newe : olde;

        let l3 = e2.l;
        let _i = 0;

        do {
          let l4 = l3;

          if (l4.next.v === newv) {
            l4 = l4.next;
          } else if (l4.prev.v === newv) {
            l4 = l4.prev;
          }

          //console.log("splitting", l4);

          newfs.add(mesh.splitFace(l4.f, l4, l4.next.next.next).f);

          if (_i++ > 1000) {
            console.warn("infinite loop error");
            break;
          }
          l3 = l3.radial_next;
        } while (l3 !== e2.l);

        break;
      }

      //mesh.splitFace(l3.f, l3, l3.next.next.next);

      continue;
    } else if (mask === (1|4|16) + (6<<8)) {
      let l3 = l1.next.next;
      let l4 = l1.prev;

      newfs.add(mesh.splitFace(l1.f, l1, l1.next.next).f);
      newfs.add(mesh.splitFace(l3.f, l3, l3.next.next).f);

      newfs.add(mesh.splitFace(l4.f, l4.prev, l4.next).f);

      continue;
    }

    let pat = ptable[mask];
    if (!pat) {
      //console.log("no pattern", mask);
      let ls = [];
      for (let l of f.lists[0]) {
        ls.push(l);
      }

      for (let i=1; i<ls.length-1; i++) {
        let l1 = ls[0], l2 = ls[i], l3 = ls[i+1];

        let f2 = mesh.makeFace([l1.v, l2.v, l3.v]);
        let l = f2.lists[0].l;

        mesh.copyElemData(l, l1);
        mesh.copyElemData(l.next, l2);
        mesh.copyElemData(l.prev, l3);
        mesh.copyElemData(f2, l1.f);

        newfs.add(f2);
      }

      killfs.add(f);
      mesh.killFace(f);
      continue;
    }

    let temp = temps[mask];
    l = l1;
    mi = 0;
    do {
      temp[mi++] = l;
      l = l.next;
    } while (l !== l1);

    let l2 = l1.next.next;
    if (l2 === l1 || l2.next === l1 || l2.prev === l1) {
      continue;
    }

    let f2 = f;

    for (let i = 0; i < pat.length; i++) {
      let idx = pat[i];

      if (idx < 0) {
        continue;
      }

      let l1 = temp[i];
      let l2 = temp[idx];

      f2 = l1.f;

      if (l1.f === l2.f && l1.f === f2) {
        //console.log("splitting face", l1, l2);
        newfs.add(mesh.splitFace(f2, l1, l2).f);
      } else {
        //console.log("pattern error", pat, idx);
      }
    }

    //break;
  }

  return {
    newvs : newvs,
    newfs : newfs,
    killfs : killfs
  }
}