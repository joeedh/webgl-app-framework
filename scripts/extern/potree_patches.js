import './potree/build/potree/potree.js';
import './jszip/jszip.js';
import {LASExporter} from './potree/src/exporter/LASExporter.js';
import './potree/libs/zstd-codec/bundle.js';

export function loadFullPointSet(ptree, onUpdate=function(percent){}) {
  return new Promise((accept, reject) => {
    let timer = window.setInterval(() => {
      let totnodes = 0;
      let totloaded = 0;

      for (let k in ptree.pcoGeometry.nodes) {
        let node = ptree.pcoGeometry.nodes[k];
        if (!node.loaded && !node.loading) {
          node.load();
        }

        if (node.loaded) {
          totloaded++;
        }

        totnodes++;
      }

      if (totloaded === totnodes) {
        window.clearInterval(timer);
        console.log("loaded");
        accept(ptree);
      }

      let perc = totloaded / totnodes;
      onUpdate(perc);
    }, 40)
  });
}

let _num_prefix = "__NUMXX__%%";
//JSON wrappers that preserves NaN, Infinity and -Infinity
function safeJSONParse(buf) {
  return JSON.parse(buf, function(key, val) {
    if (typeof val === "string" && val.startsWith(_num_prefix)) {
      val = val.slice(_num_prefix.length, val.length).trim();
      val = parseFloat(val);
    }

    return val;
  });
}
function safeJSONStringify(json) {
  return JSON.stringify(json, function (key, val) {
    try {
      val = this[key];
    } catch (error) {
      val = undefined;
    }

    if (typeof val === "number" && isNaN(val)) {
      return _num_prefix + "NaN";
    } else if (val === Infinity) {
      return _num_prefix + "Infinity";
    } else if (val === -Infinity) {
      return _num_prefix + "-Infinity";
    }

    return val;
  });
}

let TypeClasses = {
  Float32Array : Float32Array,
  Float64Array : Float64Array,
  Uint8Array   : Uint8Array,
  Uint16Array  : Uint16Array,
  Uint8ClampedArray : Uint8ClampedArray,
  Uint32Array : Uint32Array,
  Int8Array   : Int8Array,
  Int16Array  : Int16Array,
  Int32Array : Int32Array
};
let TypeSizes = {
  Float32Array : 4,
  Float64Array : 8,
  Uint8Array   : 1,
  Uint16Array  : 2,
  Uint8ClampedArray : 1,
  Uint32Array : 4,
  Int8Array   : 1,
  Int16Array  : 2,
  Int32Array : 4
};

/*
# File
bbox      :bounding box: f32 x 6
offset    :            : f32 x 3
Geometry node definition:

node_type : 'g'        : u8
index     : child index: i32
name      :            : string
id        :            : i32
numPoints :            : i32
spacing   :            : i32
level     :            : i32
bbox      :            : f32 x 6
meanx     :            : f32
meany     :            : f32
meanz     :            : f32
numAttrs  :            : i32

... for each attribute:
name      :            : string
itemSize  :            : i32
dataSize  :            : i32
count     :            : i32
normalized:            : i32
dataType  :            : string
datalen   :            : i32
data      :            : count*itemSize bytes

totchild  :child count : i32
...children

Tree node definition:

type      :   't'    : byte
index     :          : i32
name      :          : string
totchild  :          : i32
geoid     : node id  : i32
for each child:
  if child references a geo node:
type      :   'g'    : byte
index     :          : i32
id        :          : i32
  if child is tree node:
type      :   't'    : byte
...node data
*/

export function packPointCloud_intern(ptree, onProgress = function(percent){}) {
  let mat = ptree.material;

  let bbox = ptree.getBoundingBoxWorld();

  let json = {
    level : ptree.level,
    minimumNodePixelSize : ptree.minimumNodePixelSize,
    generateDEM : ptree.generateDEM,
    projection : ptree.projection,
    boundingBox : ptree.boundingBox,
    fallbackProjection : ptree.fallbackProjection,
    material : {
      size : mat.size,
      pointSizeType : mat.pointSizeType,
      pointShape : mat.pointShape
    },
    layers : ptree.layers,
    pcoGeometry : {
      hierarchyStepSize : ptree.pcoGeometry.hierarchyStepSize,
      boundingBox : ptree.pcoGeometry.boundingBox,
      offset : ptree.pcoGeometry.offset,
      pointAttributes : ptree.pcoGeometry.pointAttributes,
      spacing : ptree.pcoGeometry.spacing,
      projection : ptree.pcoGeometry.projection
    },
    position : ptree.position,
    visibleBounds : ptree.visibleBounds,
    name : ptree.name
  };

  json = safeJSONStringify(json);
  let data = [];

  function packint(i, outdata=data) {
    outdata.push(i & 255);
    outdata.push((i>>8) & 255);
    outdata.push((i>>16) & 255);
    outdata.push((i>>24) & 255);
  }
  
  let F32Array = new Float32Array(1);
  let f32bytes = new Uint8Array(F32Array.buffer);
  function packf32(f) {
    F32Array[0] = f;

    for (let i=0; i<4; i++) {
      data.push(f32bytes[i]);
    }
  }

  function packbbox(bbox) {
    if (bbox) {
      packf32(bbox.min.x);
      packf32(bbox.min.y);
      packf32(bbox.min.z);
      packf32(bbox.max.x);
      packf32(bbox.max.y);
      packf32(bbox.max.z);
    } else {
      for (let i=0; i<6; i++) {
        packf32(0);
      }
    }
  }

  function packstring(s) {
    packint(s.length);
    for (let i=0; i<s.length; i++) {
      data.push(s.charCodeAt(i));
    }
  }

  packstring(json);

  let rec = (n, index) => {
    let n2 = n;
    data.push("g".charCodeAt(0));

    packint(index);
    packstring(n.name);
    packint(n.id);
    packint(n2.numPoints);
    packint(n2.spacing);
    packint(n2.level);

    packbbox(n2.boundingBox);
    packbbox(n2.tightBoundingBox);

    if (n2.mean) {
      packf32(n2.mean.x);
      packf32(n2.mean.y);
      packf32(n2.mean.z);
    } else {
      packf32(0);
      packf32(0);
      packf32(0);
    }

    if (n2.geometry && n2.geometry.attributes) {
      let geom = n2.geometry;
      let count = 0;

      for (let k in geom.attributes) {
        count++;
      }

      if (count === 0) {
        throw new Error("no buffer attributes?");
      }
      packint(count);

      for (let k in geom.attributes) {
        let attr = geom.attributes[k];

        let typename = attr.array.constructor.name;
        if (!(typename in TypeSizes)) {
          throw new Error("unknown typed array class " + typename);
        }

        packstring(k);
        packint(attr.itemSize);
        packint(TypeSizes[typename]);

        packint(attr.count);
        packint(attr.normalized);
        packstring(typename);


        let u8 = new Uint8Array(attr.array.buffer);

        packint(u8.length);

        data.length += u8.length;
        data.set(u8, 0, data.length-u8.length, u8.length);
        //data = data.concat(u8);
      }
    } else {
      packint(0);
    }

    if (!n.children) {
      return;
    }

    let count = 0;
    for (let k in n.children) {
      count++;
    }

    packint(count);

    for (let k in n.children) {
      let child = n.children[k];

      if (child) {
        rec(child, parseInt(k));
      }
    }
  };

  rec(ptree.pcoGeometry.root, 0);

  /*
  let rec2 = (n, index) => {
    data.push("t".charCodeAt(0));

    packint(index);
    packstring(n.name);

    let tot=0;
    for (let n2 in n.children) {
      if (n2) tot++;
    }

    packint(tot);

    if (n.geometryNode) {
      packint(n.geometryNode.id);
    } else {
      packint(-1);
    }

    for (let i=0; i<n.children.length; i++) {
      if (n.children[i]) {
        if (n.children[i] instanceof Potree.PointCloudOctreeGeometryNode) {
          data.push("g".charCodeAt(0));
          packint(i);
          packint(n.children[i].id);
        } else {
          data.push("t".charCodeAt(0));
          rec2(n.children[i], i);
        }
      }
    }
  };

  rec2(ptree.root, 0);
  //*/

  data = new Uint8Array(data);

  return new Promise((accept, reject) => {
    ZstdCodec.run(zstd => {
      let out = [];

      let gen = function*() {
        const simple = new zstd.Simple();
        const streaming = new zstd.Streaming();

        let chunks = [];
        let chunksize = 1024 * 512;
        let totchunk = Math.ceil(data.length / chunksize);

        packint(totchunk, out);

        for (let i = 0; i < totchunk; i++) {
          let i2 = Math.min((i + 1) * chunksize, data.length);

          let data2 = data.slice(i * chunksize, i2);
          data2 = simple.compress(data2);

          packint(data2.length, out);
          out.length += data2.length;
          out.set(data2, 0, out.length - data2.length, data2.length);

          let perc = i2 / data.length;

          onProgress(perc);
          yield 1;
        }
      };

      let iter = gen();

      let timer = window.setInterval(() => {
        let ret = iter.next();
        if (ret.done) {
          window.clearInterval(timer);
          console.log("done", (out.length/1024).toFixed(1) + "kb");
          accept(out);
        }
      }, 1);
    });
  });
}

export async function packPointCloud(ptree, onProgress=function(percent){}) {
  await loadFullPointSet(ptree, onProgress);

  return await packPointCloud_intern(ptree, onProgress());
}

export function unpackPointCloud(data, onProgress = function(percent){}) {

  return new Promise((accept, reject) => {
    ZstdCodec.run(zstd => {
      const simple = new zstd.Simple();

      let ptree = undefined;

      if (data instanceof Array) {
        data = new Uint8Array(data);
      }

      if (!(data instanceof DataView)) {
        data = new DataView(data.buffer);
      }

      let endian = true; //little endian

      let data2 = [];

      function* gen() {
        let totchunk = data.getInt32(0, endian);
        let j = 4;

        for (let i=0; i<totchunk; i++) {
          let len = data.getInt32(j, endian);
          j += 4;

          let buf = data.buffer.slice(j, j+len);
          buf  = new Uint8Array(buf);

          let chunk = simple.decompress(buf);

          data2.length += chunk.length;
          data2.set(chunk, 0, data2.length-chunk.length, chunk.length);

          j += len;

          let perc =  i / totchunk;

          onProgress(perc);

          yield 1;
        }

        data2 = new DataView(new Uint8Array(data2).buffer);
        let u8data2 = new Uint8Array(data2.buffer);

        let _i = 0;
        function readint() {
          let ret = data2.getInt32(_i, endian);
          _i += 4;

          return ret;
        }

        function readbyte() {
          _i++;

          return u8data2[_i-1];
        }

        function readf32() {
          let ret = data2.getFloat32(_i, endian);
          _i += 4;

          return ret;

        }
        function readbuf(len) {
          _i += len;
          return data2.buffer.slice(_i-len, _i);
        }

        function readvec3() {
          let v = new THREE.Vector3();
          v.x = readf32();
          v.y = readf32();
          v.z = readf32();
          return v;
        }

        function readbbox() {
          let bbox = new THREE.Box3();

          bbox.min.x = readf32();
          bbox.min.y = readf32();
          bbox.min.z = readf32();
          bbox.max.x = readf32();
          bbox.max.y = readf32();
          bbox.max.z = readf32();

          return bbox;
        }

        function readstring(max=1024) {
          let len = readint();
          let ret = "";

          if (len > max) {
            throw new Error("corrupted string detected; len was: "  + len);
          }

          for (let i=0; i<len; i++) {
            let chr = u8data2[_i + i];

            ret += String.fromCharCode(chr);
          }
          _i += len;

          return ret;
        }

        /**************main reading logic **************/

        let json = readstring(1024*512);
        json = safeJSONParse(json);
        
        let gjson = json.pcoGeometry;

        let pcoGeometry = new Potree.PointCloudOctreeGeometry();
        pcoGeometry.projection = gjson.projection;
        pcoGeometry.spacing = gjson.spacing;
        pcoGeometry.hierarchyStepSize = gjson.hierarchyStepSize;
        pcoGeometry.nodes = {};

        pcoGeometry.offset = new THREE.Vector3(gjson.offset.x, gjson.offset.y, gjson.offset.z);
        pcoGeometry.boundingBox = new THREE.Box3(gjson.boundingBox.min, gjson.boundingBox.max);

        let pa1 = gjson.pointAttributes;
        let pa2 = new Potree.PointAttributes();

        pa2.vectors = pa1.vectors;

        for (let attr1 of pa1.attributes) {
          let attr2 = new Potree.PointAttribute(attr1.name, attr1.type, attr1.numElements);

          for (let k in attr1) {
            attr2[k] = attr1[k];
          }

          pa2.add(attr2);
        }

        pa2.byteSize = pa1.byteSize;
        pa2.size = pa1.size;

        pcoGeometry.pointAttributes = pa2;

        let gnode_idmap = {};

        let readNodeGeo = (parent, level=0) => {
          let index = readint();
          let name = readstring();
          let id = readint();
          let numPoints = readint();
          let spacing = readint();
          let level2 = readint();

          let bbox = readbbox();
          let bbox_tight = readbbox();

          let node = new Potree.PointCloudOctreeGeometryNode(name, pcoGeometry, bbox);

          pcoGeometry.nodes[node.name] = node;

          node.tightBoundingBox = bbox_tight;
          node.loaded = true;
          node.loading = false;
          node.level = level2;
          node.id = id;
          node.numPoints = numPoints;
          node.spacing = spacing;

          node.mean = new THREE.Vector3();
          node.mean.x = readf32();
          node.mean.y = readf32();
          node.mean.z = readf32();
          node.parent = parent;

          node._index = index;
          gnode_idmap[node.id] = node;

          let numattrs = readint();

          node.geometry = new THREE.BufferGeometry();

          if (numattrs == 0) {
            for (let attr of pcoGeometry.pointAttributes.attributes) {
              node.geometry.setAttribute(attr.name, new THREE.BufferAttribute(new Float32Array(), attr.numElements));
            }

            node.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(), 3));
          }

          for (let i=0; i<numattrs; i++) {
            let name = readstring();
            let itemSize = readint();
            let dataSize = readint();
            let count = readint();
            let normalized = readint();
            let typeclass = readstring();

            if (!(typeclass in TypeClasses)) {
              throw new Error ("Unknown type class " + typeclass);
            }

            let dataLen = readint();

            typeclass = TypeClasses[typeclass];
            let data = readbuf(dataLen);
            data = new typeclass(data);

            let battr = new THREE.BufferAttribute(data, itemSize);
            battr.normalized = normalized;

            node.geometry.setAttribute(name, battr);
          }

          let totchild = readint();

          node.children = {};
          node.hasChildren = totchild > 0;

          for (let i=0; i<totchild; i++) {
            let node2 = readNode(node, level+1);
            node.children[node2._index] = node2;
          }

          return node;
        };

        /*
        Geometry node definition:

        node_type : 'g'        : u8
        index     : child index: i32
        name      :            : string
        id        :            : i32
        numPoints :            : i32
        spacing   :            : i32
        bbox      :            : f32 x 6
        meanx     :            : f32
        meany     :            : f32
        meanz     :            : f32
        numPoints :            : i32
        numAttrs  :            : i32
        ... for each attribute:
        name      :            : string
        itemSize  :            : i32
        dataSize  :            : i32
        count     :            : i32
        dataType  :            : string
        datalen   :            : i32
        data      :            : count*itemSize*dataSize bytes

        totchild  :child count : i32
        ...children


        * */

        let readNodeTree = (parent, lvl=0) => {
          let index = readint();
          let name = readstring();
          let totchild = readint();
          let geo = readint();

          if (geo >= 0 && !(geo in gnode_idmap)) {
            throw new Error("data corruption");
          }

          geo = gnode_idmap[geo];

          let node = ptree.toTreeNode(geo, parent);
          node._index = index;

          /*
          let node = new Potree.PointCloudOctreeNode();


          node._index = readint();
          let name = readstring();
          let totchild = readint();

          let geo = readint();
          geo = gnode_idmap[geo];

          node.geometryNode = geo;
          //*/

          node.children = new Array(8);
          node.loading = false;
          node.loaded = true;
          node.parent = parent;

          for (let i=0; i<totchild; i++) {
            let type = String.fromCharCode(readbyte());
            let node2;

            if (type === "g") {
              let index = readint();
              node2 = readint();
              node2 = gnode_idmap[node2];

              node.children[index] = node2;
            } else {
              let node2 = readNode(node, lvl+1);
              node.children[node2._index] = node2;
            }
          }

          return node;
        };
        /*
        Tree node definition:

        type      :   't'    : byte
        index     :          : i32
        name      :          : string
        totchild  :          : i32
        geoid     : node id  : i32
        ...nodes
        */

        var readNode = (parent, level) => {
          let type = String.fromCharCode(readbyte());
          if (type === "g") {
            return readNodeGeo(parent, level);
          } else if (type === "t") {
             return readNodeTree(parent, level);
          } else {
            throw new Error("corrupted pointset pack data");
          }
        }

        let geoRoot = readNode();
        pcoGeometry.root = geoRoot;

        ptree = new Potree.PointCloudOctree(pcoGeometry);
        ptree.minimumNodePixelSize = json.minimumNodePixelSize;
        ptree.level = json.level;
        ptree.projection = json.projection;
        ptree.fallbackProjection = json.fallbackProjection;
        for (let k in json.layers) {
          ptree.layers[k] = json.layers[k];
        }
        ptree.position.copy(json.position);
        ptree.boundingBox = new THREE.Box3();
        ptree.boundingBox.copy(json.boundingBox);
        ptree.generateDEM = json.generateDEM;

        //let treeRoot = readNode();
        //ptree.root = treeRoot;

        pcoGeometry.loaded = true;
        ptree.loaded = true;
        pcoGeometry.loading = false;
        ptree.loading = false;
      };

      let iter = gen();

      let timer = window.setInterval(() => {
        let ret = iter.next();
        if (ret.done) {
          clearInterval(timer);
          accept(ptree);
        }
      }, 24);
    });
  });
}
window._packPointCloud = packPointCloud;


export function packPointCloudReport(ptree) {
  let ctx = _appstate.ctx;

  return new Promise((accept, reject) => {
    packPointCloud(ptree, (perc) => {
      ctx.progbar("Packing", perc, 750);
    }).then((out) => {
      accept(out);
      ctx.progbar("Packing", 1.0, 750);
    })
  });
}

window._packPointCloudReport = packPointCloudReport;

export function unpackPointCloudReport(ptree) {
  let ctx = _appstate.ctx;

  return new Promise((accept, reject) => {
    unpackPointCloud(ptree, (perc) => {
      ctx.progbar("Loading", perc, 750);
    }).then((out) => {
      accept(out);
      ctx.progbar("Loading", 1.0, 750);
    })
  });
}

window._testPtreePack = function(ptree) {
  if (!ptree) {
    ptree = _appstate.ctx.object.data.res.data;
  }

  packPointCloudReport(ptree).then((data) => {
    console.log("data:", data);
    unpackPointCloudReport(data).then((result) => {
      let ctx = _appstate.ctx;

      let material = ptree.material;
      let flatMaterial = ptree.flatMaterial;
      let baseMaterial = ptree.baseMaterial;

      window._ptree = result;

      ctx.object.data.res.data = result;

      result.material = material;
      result.flatMaterial = flatMaterial;
      result.baseMaterial = baseMaterial;

      result.needsUpdate = true;
      result.pcoGeometry.needsUpdate = true;

      console.log("result:", result);
      window.redraw_viewport();
    })
  });
};

/**
 *
 *
 *
 * params.pickWindowSize:	Look for points inside a pixel window of this size.
 *							Use odd values: 1, 3, 5, ...
 *
 *
 * TODO: only draw pixels that are actually read with readPixels().
 *
 */
Potree.PointCloudOctree.prototype.pick = function pick(viewer, camera, ray, params = {}) {

  let renderer = viewer.renderer;
  let pRenderer = viewer.pRenderer;

  performance.mark("pick-start");

  let getVal = (a, b) => a !== undefined ? a : b;

  let pickWindowSize = getVal(params.pickWindowSize, 17);
  let pickOutsideClipRegion = getVal(params.pickOutsideClipRegion, false);

  pickWindowSize = 65;

  let size = renderer.getSize(new THREE.Vector2());

  let width = Math.ceil(getVal(params.width, size.width));
  let height = Math.ceil(getVal(params.height, size.height));

  let pointSizeType = getVal(params.pointSizeType, this.material.pointSizeType);
  let pointSize = getVal(params.pointSize, this.material.size);

  let nodes = this.nodesOnRay(this.visibleNodes, ray);

  if (nodes.length === 0) {
    return null;
  }

  if (!this.pickState) {
    let scene = new THREE.Scene();

    let material = new Potree.PointCloudMaterial();
    material.activeAttributeName = "indices";

    let renderTarget = new THREE.WebGLRenderTarget(
      1, 1,
      { minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat }
    );

    this.pickState = {
      renderTarget: renderTarget,
      material: material,
      scene: scene
    };
  };

  let pickState = this.pickState;
  let pickMaterial = pickState.material;

  { // update pick material
    pickMaterial.pointSizeType = pointSizeType;
    pickMaterial.shape = this.material.shape;
    pickMaterial.shape = Potree.PointShape.CIRCLE;
    //pickMaterial.shape = Potree.PointShape.PARABOLOID;

    pickMaterial.uniforms.uFilterReturnNumberRange.value = this.material.uniforms.uFilterReturnNumberRange.value;
    pickMaterial.uniforms.uFilterNumberOfReturnsRange.value = this.material.uniforms.uFilterNumberOfReturnsRange.value;
    pickMaterial.uniforms.uFilterGPSTimeClipRange.value = this.material.uniforms.uFilterGPSTimeClipRange.value;
    pickMaterial.uniforms.uFilterPointSourceIDClipRange.value = this.material.uniforms.uFilterPointSourceIDClipRange.value;

    pickMaterial.activeAttributeName = "indices";

    pickMaterial.size = pointSize;
    pickMaterial.uniforms.minSize.value = this.material.uniforms.minSize.value;
    pickMaterial.uniforms.maxSize.value = this.material.uniforms.maxSize.value;
    pickMaterial.classification = this.material.classification;
    pickMaterial.recomputeClassification();

    if(params.pickClipped){
      pickMaterial.clipBoxes = this.material.clipBoxes;
      pickMaterial.uniforms.clipBoxes = this.material.uniforms.clipBoxes;
      if(this.material.clipTask === Potree.ClipTask.HIGHLIGHT){
        pickMaterial.clipTask = Potree.ClipTask.NONE;
      }else{
        pickMaterial.clipTask = this.material.clipTask;
      }
      pickMaterial.clipMethod = this.material.clipMethod;
    }else{
      pickMaterial.clipBoxes = [];
    }

    this.updateMaterial(pickMaterial, nodes, camera, renderer);
  }

  pickState.renderTarget.setSize(width, height);

  let pixelPos = new THREE.Vector2(params.x, params.y);

  let gl = renderer.getContext();
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    parseInt(pixelPos.x - (pickWindowSize - 1) / 2),
    parseInt(pixelPos.y - (pickWindowSize - 1) / 2),
    parseInt(pickWindowSize), parseInt(pickWindowSize));


  renderer.state.buffers.depth.setTest(pickMaterial.depthTest);
  renderer.state.buffers.depth.setMask(pickMaterial.depthWrite);
  renderer.state.setBlending(THREE.NoBlending);

  { // RENDER
    renderer.setRenderTarget(pickState.renderTarget);
    gl.clearColor(0, 0, 0, 0);
    renderer.clear(true, true, true);

    let tmp = this.material;
    this.material = pickMaterial;

    pRenderer.renderOctree(this, nodes, camera, pickState.renderTarget);

    this.material = tmp;
  }

  let clamp = (number, min, max) => Math.min(Math.max(min, number), max);

  let x = parseInt(clamp(pixelPos.x - (pickWindowSize - 1) / 2, 0, width));
  let y = parseInt(clamp(pixelPos.y - (pickWindowSize - 1) / 2, 0, height));
  let w = parseInt(Math.min(x + pickWindowSize, width) - x);
  let h = parseInt(Math.min(y + pickWindowSize, height) - y);

  let pixelCount = w * h;
  let buffer = new Uint8Array(4 * pixelCount);

  gl.readPixels(x, y, pickWindowSize, pickWindowSize, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

  renderer.setRenderTarget(null);
  renderer.state.reset();
  renderer.setScissorTest(false);
  gl.disable(gl.SCISSOR_TEST);

  let pixels = buffer;
  let ibuffer = new Uint32Array(buffer.buffer);

  // find closest hit inside pixelWindow boundaries
  let min = Number.MAX_VALUE;
  let hits = [];
  for (let u = 0; u < pickWindowSize; u++) {
    for (let v = 0; v < pickWindowSize; v++) {
      let offset = (u + v * pickWindowSize);
      let distance = Math.pow(u - (pickWindowSize - 1) / 2, 2) + Math.pow(v - (pickWindowSize - 1) / 2, 2);

      let pcIndex = pixels[4 * offset + 3];
      pixels[4 * offset + 3] = 0;
      let pIndex = ibuffer[offset];

      if(!(pcIndex === 0 && pIndex === 0) && (pcIndex !== undefined) && (pIndex !== undefined)){
        let hit = {
          pIndex: pIndex,
          pcIndex: pcIndex,
          distanceToCenter: distance
        };

        if(params.all){
          hits.push(hit);
        }else{
          if(hits.length > 0){
            if(distance < hits[0].distanceToCenter){
              hits[0] = hit;
            }
          }else{
            hits.push(hit);
          }
        }


      }
    }
  }

  //DEBUG: show panel with pick image
  // {
  // 	let img = Utils.pixelsArrayToImage(buffer, w, h);
  // 	let screenshot = img.src;

  // 	if(!this.debugDIV){
  // 		this.debugDIV = $(`
  // 			<div id="pickDebug"
  // 			style="position: absolute;
  // 			right: 400px; width: 300px;
  // 			bottom: 44px; width: 300px;
  // 			z-index: 1000;
  // 			"></div>`);
  // 		$(document.body).append(this.debugDIV);
  // 	}

  // 	this.debugDIV.empty();
  // 	this.debugDIV.append($(`<img src="${screenshot}"
  // 		style="transform: scaleY(-1); width: 300px"/>`));
  // 	//$(this.debugWindow.document).append($(`<img src="${screenshot}"/>`));
  // 	//this.debugWindow.document.write('<img src="'+screenshot+'"/>');
  // }


  for(let hit of hits){
    let point = {};

    if (!nodes[hit.pcIndex]) {
      return null;
    }

    let node = nodes[hit.pcIndex];
    let pc = node.sceneNode;
    let geometry = node.geometryNode.geometry;

    for(let attributeName in geometry.attributes){
      let attribute = geometry.attributes[attributeName];

      if (attributeName === 'position') {
        let x = attribute.array[3 * hit.pIndex + 0];
        let y = attribute.array[3 * hit.pIndex + 1];
        let z = attribute.array[3 * hit.pIndex + 2];

        let position = new THREE.Vector3(x, y, z);
        position.applyMatrix4(pc.matrixWorld);

        point[attributeName] = position;
      } else if (attributeName === 'indices') {

      } else {

        let values = attribute.array.slice(attribute.itemSize * hit.pIndex, attribute.itemSize * (hit.pIndex + 1)) ;

        if(attribute.potree){
          const {scale, offset} = attribute.potree;
          values = values.map(v => v / scale + offset);
        }

        point[attributeName] = values;

        //debugger;
        //if (values.itemSize === 1) {
        //	point[attribute.name] = values.array[hit.pIndex];
        //} else {
        //	let value = [];
        //	for (let j = 0; j < values.itemSize; j++) {
        //		value.push(values.array[values.itemSize * hit.pIndex + j]);
        //	}
        //	point[attribute.name] = value;
        //}
      }

    }

    hit.point = point;
  }

  performance.mark("pick-end");
  performance.measure("pick", "pick-start", "pick-end");

  if(params.all){
    return hits.map(hit => hit.point);
  }else{
    if(hits.length === 0){
      return null;
    }else{
      return hits[0].point;
      //let sorted = hits.sort( (a, b) => a.distanceToCenter - b.distanceToCenter);

      //return sorted[0].point;
    }
  }

};
