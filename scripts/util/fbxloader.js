import {MeshTypes, MeshFlags} from "../mesh/mesh_base.js";
import {Mesh} from "../mesh/mesh.js";
import {Vector3, Vector4, Matrix4, Quat} from './vectormath.js';
import * as util from './util.js';
import * as parseutil from './parseutil.js';
import {BinaryReader} from './binarylib.js';
import '../extern/jszip/jszip.js';

export class FBXFileError extends Error {
};

export class FBXData {
  constructor(version) {
    this.version = version;
    this.root = undefined;
    this.nodes = [];
  }

  add(node) {
    this.nodes.push(node);
    if (node.name === "P") {
      node.attrs = {};

      for (let i=0; i<node.props.length; i += 2) {
        let name = node.props[i].data;
        let data = node.props[i+1].data;

        node.attrs[name] = data;
      }
    } else {
      node.attrs = {};
    }
  }

  generate(datalib, scene) {
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

  function readNode() {
    let node = {
      endOffset : reader.uint32(),
      numProperties: reader.uint32(),
      propertyListLen : reader.uint32(),
      name : reader.string(reader.uint8()),
      props : [],
      children : []
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

    //if (had_array) {
    //  console.log("ri", node.name, JSON.stringify(node.props, undefined, 2));
    //}

    while (reader.i < node.endOffset) {
      let child = readNode();
      node.children.push(child);
    }

    return node;
  }

  fdata.root = readNode();
  fdata.nodes.push(fdata.root);

  let _max = 10000;

  while (reader.i < reader.length - 64 && _max-- >= 0) {
    let node = readNode();

    if (node.endOffset === 0) {
      break;
    }

    //console.log("another node", node);
    fdata.nodes.push(node);
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
  if (isBinaryFBX(data)) {
    return loadBinaryFBX(data);
  } else {
    let str = '';

    for (let i=0; i<data.buffer.byteLength; i++) {
      let c = data.getUint8(i);

      str += String.fromCharCode(c);
    }

    return loadTextFBX(str);
  }
}

window._testFBX = function() {
  let base = document.location.href;

  let url = base + "/assets/test.fbx";

  fetch(url).then(r => r.arrayBuffer()).then((data) => {
    console.log("Got data", data);

    let dview = new DataView(data);
    let fbx = loadFBX(dview);

    console.log("FBX", JSON.stringify(fbx.nodes, undefined, 2));
    console.log("result:", fbx.generate());
  });
}
