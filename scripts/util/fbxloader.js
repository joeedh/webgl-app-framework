import {MeshTypes, MeshFlags} from "../mesh/mesh_base.js";
import {Mesh} from "../mesh/mesh.js";
import {Vector3, Vector4, Matrix4, Quat} from './vectormath.js';
import * as util from './util.js';
import * as parseutil from './parseutil.js';
import {BinaryReader} from './binarylib.js';
import '../extern/jszip/jszip.js';
import {UVLayerElem, FloatElem, NormalLayerElem, OrigIndexElem, IntElem} from "../mesh/mesh.js";
import {SceneObject} from "../sceneobject/sceneobject.js";
import {NullObject} from "../nullobject/nullobject.js";

export class FBXFileError extends Error {
};

//stores DataBlock's, e.g. scene objects, meshes, materials, etc
export class TempList extends Array {
  constructor(idmap, datablocks) {
    super();
    this.namemap = {};
    this.idmap = idmap;
    this.datablocks = datablocks;
  }

  push(id, item, name=item.name) {
    super.push(item);

    this.idmap[id] = item;
    this.datablocks.push(item);

    if (name) {
      this.namemap[name] = item;
    }
  }
}

export class FBXData {
  constructor(version) {
    this.version = version;
    this.root = undefined;
    this.nodes = [];

    this.nodes = [];

    this.idmap = {};
    this.datablocks = [];

    this.geometries = new TempList(this.idmap, this.datablocks);
    this.sceneobjects = new TempList(this.idmap, this.datablocks);
    this.materials = new TempList(this.idmap, this.datablocks);
  }

  add(node) {
    this.nodes.push(node);
  }

  loadGeometry(node) {
    //console.log("Found a geometry", node);
    let name = node.props[1].data
    name = name.split('\0')[0];

    const lmap = {
      ByVertex : MeshTypes.VERTEX,
      ByEdge : MeshTypes.EDGE,
      ByPolygonVertex : MeshTypes.LOOP,
      ByPolygon : MeshTypes.FACE,
    }
    let vs = node.childmap.Vertices.props[0].data;

    let mesh = new Mesh();
    mesh.name = name;

    let vtable = [];
    let etable = [];
    let ltable = [];
    let ftable = [];

    let tables =  {
      [MeshTypes.VERTEX] : vtable,
      [MeshTypes.EDGE] : etable,
      [MeshTypes.LOOP] : ltable,
      [MeshTypes.FACE] : ftable
    };

    for (let i=0; i<vs.length; i += 3) {
      let v = mesh.makeVertex();

      v[0] = vs[i];
      v[1] = vs[i+1];
      v[2] = vs[i+2];

      v.index = vtable.length;
      vtable.push(v);
    }

    let p = node.childmap.PolygonVertexIndex.props[0].data;
    let fvs = [];

    for (let i=0; i<p.length; i++) {
      let idx = p[i];

      let neg = idx < 0;

      if (neg) {
        idx ^= -1;
      }

      let v = vtable[idx];
      if (v === undefined) {
        console.warn("Missing vertex!", idx);
        continue;
      }

      fvs.push(v);

      if (neg) {
        let f = mesh.makeFace(fvs);

        f.index = ftable.length;
        ftable.push(f);

        for (let list of f.lists) {
          for (let loop of list) {
            loop.index = ltable.length;
            ltable.push(loop);
          }
        }

        fvs = [];
      }
    }

    if (node.childmap.Edges) {

      let es = node.childmap.Edges.props[0].data;

      for (let i = 0; i < es.length; i++) {
        let e = ltable[es[i]].e;

        e.index = etable.length;
        etable.push(e);
      }
    }

    function doCustomData(n, cls, key) {
      let type = "ByPolygonVertex";

      if (n.childmap.MappingInformationType) {
        type = n.childmap.MappingInformationType.props[0].data;
      }

      if (!(type in lmap)) {
        console.error("Customdata mapping error!");
        return;
      }

      type = lmap[type];
      let elist = mesh.getElemList(type);
      let table = tables[type];

      let valuesize = cls.define().valueSize;
      let name = n.childmap.Name.props[0].data;

      let arrtemp = new Array(valuesize);

      let layer = elist.addCustomDataLayer(cls, ""+name);

      let li = layer.index;

      let ref = "IndexToDirect";
      if (n.childmap.ReferenceInformationType) {
        ref = n.childmap.ReferenceInformationType.props[0].data;
      }

      if (ref === "Index") {
        ref = "IndexToDirect";
      }

      if (ref === "IndexToDirect") {
        let data = n.childmap[key].props[0].data;
        let refs = n.childmap[key + "Index"].props[0].data;

        for (let i=0; i<refs.length; i++) {
          let elem = table[i];

          let cd = elem.customData[li];

          if (valuesize > 1) {
            for (let j = 0; j < valuesize; j++) {
              arrtemp[j] = data[refs[i] * valuesize + j];
            }
            cd.setValue(arrtemp);
          } else {
            cd.setValue(data[refs[i]]);
          }
        }
      } else if (ref === "Direct") {
        let data = n.childmap[key].props[0].data;
        for (let i=0; i<table.length; i++) {
          let elem = table[i];
          let cd = elem.customData[li];

          if (valuesize > 1) {
            for (let j = 0; j < valuesize; j++) {
              arrtemp[j] = data[i * valuesize + j];
            }
            cd.setValue(arrtemp);
          } else {
            cd.setValue(data[i]);
          }
        }
      }

      return layer;
    }

    for (let n of node.children) {
      if (n.name === "LayerElementUV") {
        doCustomData(n, UVLayerElem, "UV");
      } else if (n.name === "LayerElementNormal") {
        doCustomData(n, NormalLayerElem, "Normals");
      }
    }

    return mesh;
  }

  finish() {
    let findNode = (n, name) => {
      if (n.name === name) {
        return n;
      }

      for (let c of n.children) {
        let ret = findNode(c, name);

        if (ret) {
          return ret;
        }
      }

      return undefined;
    }

    let roots = {};
    roots["root"] = this.root;
    for (let node of this.nodes) {
      roots[node.name] = node;
    }

    if (!roots.Objects) {
      console.error("FBX error");
      return;
    }

    for (let n of roots.Objects.children) {
      if (n.name === "Model") {
        let ob = new SceneObject();
        ob.name = n.props[1].data;
        ob.name = ob.name.split("\0")[0].trim();

        if (!ob.lib_userData.fbx) {
          ob.lib_userData.fbx = {};
        }

        if (n.childmap.Shading) {
          ob.lib_userData.fbx.Shading = n.childmap.Shading.props[0].data;
        }

        //console.log("Found a scene object", n, ob);

        let id = n.props[0].data; //n.addr;
        this.sceneobjects.push(id, ob);

        for (let k in n.attrs) {
          let v = n.attrs[k];

          if (k === "Lcl Rotation") {
            for (let j=0; j<3; j++) {
              v[j] = (v[j]/180)*Math.PI;
            }
            ob.inputs.rot.setValue(v);
          } else if (k === "Lcl Translation") {
            ob.inputs.loc.setValue(v);
          } else if (k === "Lcl Scale") {
            ob.inputs.scale.setValue(v);
          } else {
            let ok = true;

            //make sure our custom attr is json-compatible
            try {
              v = JSON.parse(JSON.stringify({[k] : v}));
            } catch (error) {
              ok = false;
            }

            if (ok) {
              ob.lib_userData.fbx[k] = v;
            }
          }
        }
      } else if (n.name === "Geometry") {
        //console.log("Found a geometry", n);
        let name = n.props[1].data
        name = name.split('\0')[0];

        //console.log("NAME", `'${name}'`);

        let mesh = this.loadGeometry(n);
        let id = n.props[0].data; //n.addr;

        this.geometries.push(id, mesh);

        /*
        datalib.add(mesh);

        let sob = new SceneObject(mesh);

        datalib.add(sob);

        sob.graphUpdate();
        mesh.graphUpdate();

        scene.add(sob);
        scene.objects.setSelect(sob, true);
        scene.objects.setActive(sob, true);

        window.redraw_viewport();
         */

      }
    }

    console.log("ROOTS:", roots);

    if (!roots.Connections) { //paranoia check
      roots.Connections = {children : []};
    }

    for (let conn of roots.Connections.children) {
      //console.log(conn);
      if (conn.props.length > 0 && conn.props[0].data === "OO") {
        //console.log(conn.props[1].data, this.idmap[conn.props[1].data])
        //console.log(conn.props[2].data, this.idmap[conn.props[2].data])
        let a = this.idmap[conn.props[1].data];
        let b = this.idmap[conn.props[2].data];

        if (!a || !b) {
          continue;
        }

        if (a && b) {
          if (a instanceof Mesh && b instanceof SceneObject) {
            b.data = a;
          }
        } else if (a instanceof SceneObject && b instanceof SceneObject) {
          a.inputs.matrix.connect(b.outputs.matrix);
        }
      } else {
        console.log("Unknown connection type");
      }
    }

    for (let ob of this.sceneobjects) {
      if (!ob.data) {
        ob.data = new NullObject();
        this.datablocks.push(ob.data);
      }
    }


    console.log(this.sceneobjects);
  }

  instance(datalib, scene) {
    console.log("Datablocks:", this.datablocks);

    //make sure non-scene-object data is in the datalib
    for (let block of this.datablocks) {
      if (block instanceof SceneObject) {
        continue;
      }

      if (!datalib.has(block)) {
        datalib.add(block);
      }
    }

    //add copy of scene objects
    for (let ob of this.datablocks) {
      if (!(ob instanceof SceneObject)) {
        continue;
      }

      let ob2 = ob.copy(true);
      ob2.name = ob.name;

      datalib.add(ob2);
      scene.add(ob2);

      ob2.graphUpdate();
      ob2.data.graphUpdate();
    }
  }
}

export const PropTypes = {
  INT16 : 'Y',
  BOOL : 'C',
  INT32 : 'I',
  FLOAT32 : 'F',
  FLOAT64 : 'D',
  INT64 : 'L',

  INT16_ARRAY : 'y',
  BOOL_ARRAY : 'b',
  INT32_ARRAY : 'i',
  FLOAT32_ARRAY : 'f',
  FLOAT64_ARRAY : 'd',
  INT64_ARRAY : 'l',

  STRING : 'S',
  BINARY : 'R'
}

export const PropSizes = {
  'Y' : 2,
  'C' : 1,
  'I' : 4,
  'F' : 4,
  'D' : 8,
  'L' : 8,

  'y' : 2,
  'b' : 1,
  'i' : 4,
  'f' : 4,
  'd' : 8,
  'l' : 8
};

export const ArrayTypeMap = {
  'y' : 'Y',
  'i' : 'I',
  'l' : 'L',
  'd' : 'D',
  'f' : 'F',
  'b' : 'C'
};

export const ArrayTypes = new Set([
  'y', 'b', 'i', 'f', 'd', 'l'
]);

export const PropMap = {};

for (let k in PropTypes) {
  PropMap[PropTypes[k]] = k;
}

function readArray(reader, type) {
  let len = reader.uint32();
  let encoding = reader.uint32();
  let compressedLen = reader.uint32();

  if (encoding) {
    console.log("Reading compressed array", encoding, compressedLen, len);

    let data = reader.bytes(compressedLen);

    data = JSZip.inflate(data);

    return {
      reader : new BinaryReader(data.buffer),
      len : len,
      type : ArrayTypeMap[type]
    };
  } else {
    return {
      reader, len,
      type : ArrayTypeMap[type]
    };
  }
}
//see: https://code.blender.org/2013/08/fbx-binary-file-format-specification/
export function loadBinaryFBX(data) {
  let reader = new BinaryReader(data);

  if (!isBinaryFBX(data)) {
    throw new FBXFileError("not an FBX file");
  }

  reader.skip(23);

  let version = reader.uint32();

  let fdata = new FBXData(version);

  function readNode(parent) {
    let addr = reader.i;

    let node = {
      addr : addr,
      parent : parent,
      endOffset : reader.uint32(),
      numProperties: reader.uint32(),
      propertyListLen : reader.uint32(),
      name : reader.string(reader.uint8()),
      props : [],
      children : [],
      childmap : {},
    }

    if (name.startsWith("Properties")) {
      if (!node.attrs) {
        node.attrs = {};
      }

      if (parent && !parent.attrs) {
        parent.attrs = {};
      }
    }

    let had_array = false;

    for (let i=0; i<node.numProperties; i++) {
      let prop = {};

      prop.type = String.fromCharCode(reader.uint8());

      let pread = reader, proptype = prop.type;
      let tot = 1;

      if (ArrayTypes.has(prop.type)) {
        let arr = readArray(reader, prop.type);

        pread = arr.reader;
        tot = arr.len;
        proptype = arr.type;

        prop.data = [];
        had_array = true;
      }

      for (let j=0; j<tot; j++) {
        let data;

        if (pread.i >= pread.length - 4 && tot > 1) {
          //prop.data.push(0);
          //continue;
        }

        switch (proptype) {
          case PropTypes.INT16:
            data = pread.int16();
            break;
          case PropTypes.BOOL:
            data = !!pread.uint8();
            break;
          case PropTypes.INT32:
            data = pread.int32();
            break;
          case PropTypes.FLOAT32:
            data = pread.float32();
            break;
          case PropTypes.FLOAT64:
            data = pread.float64();
            break;
          case PropTypes.INT64:
            data = pread.int64();
            break;
          case PropTypes.BINARY:
            let len = pread.uint32();
            //console.log("LEN", len);
            data = pread.bytes(len);
            break;
          case PropTypes.STRING:
            data = pread.string(pread.int32());
            break;
        }

        //console.log("data", data);

        if (tot > 1) {
          prop.data.push(data);
        } else {
          prop.data = data;
        }
      }

      node.props.push(prop);
    }

    if (node.name === "P" && parent && parent.name.startsWith("Properties")) {
      let attrs = parent.attrs;

      if (!attrs) {
        attrs = parent.attrs = {};
      }

      let attrs2 = parent.parent ? parent.parent.attrs : {};

      if (parent.parent && !attrs2) {
        parent.parent.attrs = attrs2 = {};
      }

      let name = node.props[0].data;
      let type = node.props[1].data;

      let data;
      if (node.props.length > 5) {
        data = [];
        for (let i=4; i<node.props.length; i++) {
          data.push(node.props[i].data);
        }

      } else {
        data = node.props[4] ? node.props[4].data : undefined;
      }

      if (name.trim() !== "") {
        attrs[name] = attrs2[name] = data;
      }
    }

    //if (had_array) {
    //  console.log("ri", node.name, JSON.stringify(node.props, undefined, 2));
    //}

    while (reader.i < node.endOffset) {
      let child = readNode(node);
      node.children.push(child);
      node.childmap[child.name] = child;
    }

    return node;
  }

  fdata.root = readNode();
  fdata.add(fdata.root);

  let _max = 10000;

  while (reader.i < reader.length - 64 && _max-- >= 0) {
    let node = readNode();

    if (node.endOffset === 0) {
      break;
    }

    //console.log("another node", node);
    fdata.add(node);
  }

  function sanitize(n) {
    delete n.endOffset;
    delete n.numProperties;
    delete n.propertyListLen;

    for (let c of n.children) {
      sanitize(c);
    }   
  }

  for (let n of fdata.nodes) {
    sanitize(n);
  }


  return fdata;
}

export function loadTextFBX(data) {

}

let magic = "Kaydara FBX Binary  ";
let umagic = new Uint8Array(magic.length + 1);
for (let i=0; i<magic.length; i++) {
  umagic[i] = magic.charCodeAt(i);
}
umagic[umagic.length-1] = 0;

export let binaryMagicData = umagic;

export function isBinaryFBX(data) {
  for (let i=0; i<binaryMagicData.length; i++) {
    if (data.getUint8(i) !== binaryMagicData[i]) {
      return false;
    }
  }

  return true;
}

/** data is a DataView */
export function loadFBX(data) {
  let ret;

  if (isBinaryFBX(data)) {
    ret = loadBinaryFBX(data);
  } else {
    let str = '';

    for (let i=0; i<data.buffer.byteLength; i++) {
      let c = data.getUint8(i);

      str += String.fromCharCode(c);
    }

    ret = loadTextFBX(str);
  }

  ret.finish();
  return ret;
}

window._testFBX = function() {
  let base = document.location.href;

  let url = base + "/assets/Sofa1.fbx";

  fetch(url).then(r => r.arrayBuffer()).then((data) => {
    console.log("Got data", data);

    let dview = new DataView(data);
    let fbx = loadFBX(dview);

    fbx.instance(CTX.datalib, CTX.scene);

    //console.log("FBX", JSON.stringify(fbx.nodes, undefined, 2));
    console.log("FBX", fbx);
    //console.log("result:", fbx.generate(_appstate.ctx.datalib, _appstate.ctx.scene));
  });
}
