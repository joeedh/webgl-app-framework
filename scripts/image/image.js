import {DataBlock} from '../core/lib_api.js';
import {nstructjs, util, color2css, Vector2, Vector3, Vector4, Matrix4} from '../path.ux/scripts/pathux.js';
import {Icons} from '../editors/icon_enum.js';
import {DependSocket} from '../core/graphsockets.js';
import {GraphFlags, NodeFlags} from '../core/graph.js';
import {Texture} from '../core/webgl.js';
import {FBO} from '../core/fbo.js';

export const ImageFlags = {
  SELECT: 1,
  HIDE  : 2,
  UPDATE: 4
};

export const ImageTypes = {
  GENERATED : 0,
  BYTE_BUFFER : 1,
  FLOAT_BUFFER : 2,
  URL : 3
};

export const ImageGenTypes = {
  COLOR : 0,
  UVGRID : 1
};

export class ImageBlock extends DataBlock {
  constructor() {
    super();

    this.type = ImageTypes.GENERATED;
    this.genType = ImageGenTypes.UVGRID;
    this.flag = ImageFlags.UPDATE;

    this.width = 512;
    this.height = 512;

    this.byteBuffer = undefined;
    this.floatBuffer = undefined;
    this.updateGen = 0;

    this.genColor = new Vector4([1, 1, 1, 1]);

    this.url = "";
    this.ready = false;

    //does the gpu have the main copy of the image?
    this.gpuHasData = false;
    this.gl = undefined;
    this.glType = undefined;
    this.glTex = undefined;
    this.glRegen = false;

    this._drawFBO = undefined;
    this._tex2 = undefined;

    this._last_update_key = undefined;
    this._promises = [];

    this._image = undefined;
  }

  getDrawFBO(gl) {
    if (!this._drawFBO) {
      this._drawFBO = new FBO(gl, this.width, this.height);
      this._drawFBO.update(gl, this.width, this.height);
      this._drawFBO.create(gl);
    }

    return this._drawFBO;
  }

  freeDrawFBO(gl) {
    if (this._drawFBO) {
      this._drawFBO.destroy(gl);
    }

    this._drawFBO = undefined;
    return this;
  }

  swapWithFBO(gl) {
    let fbo = this.getDrawFBO(gl);
    Texture.unbindAllTextures(gl);

    let temp = this.glTex;
    this.glTex = fbo.texColor;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.finish();

    fbo.setTexColor(gl, temp);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return this;
  }

  packAsURL() {
    if (!this._image || !this.ready) {
      throw new Error("image is not ready");
    }

    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");

    canvas.width = this.width;
    canvas.height = this.height;

    g.putImageData(this._image.image, 0, 0);

    let url = canvas.toDataURL();
    this.url = url;

    this.type = ImageTypes.URL;
    this.floatBuffer = undefined;
    this.byteBuffer = undefined;
  }


  copyTo(b, copy_contents=true) {
    super.copyTo(b, copy_contents);
    this._copyTo(b);
  }

  _copyTo(b) {
    if (this.gpuHasData) {
      this.downloadFromGL();
    }

    b.width = this.width;
    b.height = this.height;

    b.type = this.type;
    if (this.floatBuffer !== undefined && this.floatBuffer.length > 0) {
      b.floatBuffer = new Float64Array(this.floatBuffer.length);
      b.floatBuffer.set(this.floatBuffer);
    }

    if (this.byteBuffer !== undefined && this.byteBuffer.length > 0) {
      b.byteBuffer = new Uint8ClampedArray(this.byteBuffer.length);
      b.byteBuffer.set(this.byteBuffer);
    }

    b.url = this.url;
    b.genType = this.genType;
    b.genColor = this.genColor;
    b.flag = this.flag;

    b._image = this._image;
    b.ready = this.ready;
    b.glTex = undefined;
    b.glRegen = true;
    b.gl = this.gl;
  }

  copy() {
    let ret = new this.constructor();

    this._copyTo(ret);

    return ret;
  }

  downloadFromGL() {
    if (!this.glTex) {
      console.error("No gl texture data");
      return;
    }

    let gl = this.gl, tex = this.glTex;
    let fbo = new FBO(gl, this.width, this.height);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);

    gl.depthMask(false);

    /*
    if (this.glType === gl.FLOAT) {
      fbo.ctype = gl.RGBA32F;
    } else {
      fbo.ctype = gl.RGBA;
    }

    fbo.etype = this.glType;
    */

    fbo.create(gl) //, tex);
    fbo.bind(gl);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    fbo.drawQuad(gl, this.width, this.height, tex, null);

    let buf;
    if (this.glType === gl.UNSIGNED_BYTE) {
      buf = this.byteBuffer;
      if (!buf || buf.length !== this.width*this.height*4) {
        buf = this.byteBuffer = new Uint8ClampedArray(this.width*this.height*4);
      }

      if (!(buf instanceof Uint8ClampedArray || buf instanceof Uint8Array)) {
        buf = this.byteBuffer = new Uint8ClampedArray(buf);
      }
    } else {
      buf = this.floatBuffer;
      if (!buf || buf.length !== this.width*this.height*4) {
        buf = this.floatBuffer = new Float32Array(this.width*this.height*4);
      }
    }

    //let fbuf = new Float32Array(this.width*this.height*4);

    gl.finish();

    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, this.glType, buf);

    console.log("buf:", buf, this.glType, buf.length, this.width*this.height*4);

    fbo.unbind(gl);
    fbo.destroy(gl);
    //copyTexImage2D

    if (this.glType === gl.FLOAT && this.type === ImageTypes.BYTE_BUFFER) {
      this.type = ImageTypes.FLOAT_BUFFER;
      this.convertTypeTo(ImageTypes.BYTE_BUFFER);
    } else if (this.glType === gl.UNSIGNED_BYTE && this.type === ImageTypes.FLOAT_BUFFER) {
      this.type = ImageTypes.BYTE_BUFFER;
      this.convertTypeTo(ImageTypes.FLOAT_BUFFER);
    }

    this.flag |= ImageTypes.UPDATE;
    //this._image = undefined;
    //this.ready = false;
    //this.glRegen = true;

    gl.enable(gl.DITHER);
  }

  _convertToFloat() {
    if (this.type === ImageTypes.FLOAT_BUFFER) {
      return;
    }

    console.log("byte buffer:", this.byteBuffer, this.width, this.height);
    this._convertToByte();
    let buf = this.byteBuffer;

    if (!buf) {
      let fbuf = this.fbuf = new Float32Array(this.width*this.height*4);
      for (let i=0; i<fbuf.length; i++) {
        fbuf[i] = 1.0;
      }

      return;
    }

    let fbuf = new Float32Array(this.width*this.height*4);
    let mul = 1.0 / 255.0;

    console.log(buf);

    for (let i=0; i<buf.length; i++) {
      fbuf[i] = buf[i] * mul;
    }

    this.floatBuffer = fbuf;
    this.glRegen = true;
    this.type = ImageTypes.FLOAT_BUFFER;

    return this;
  }

  _convertToByte() {
    this.byteBuffer = undefined;

    if (this.type !== ImageTypes.FLOAT_BUFFER) {
      if (this._image) {
        this.byteBuffer = this._image.image.data;
      } else {
        this.byteBuffer = new Uint8ClampedArray(this.width*this.height*4);
      }
    } else {
      let buf = new Uint8ClampedArray(this.floatBuffer.length);
      let fbuf = this.floatBuffer;

      for (let i=0; i<buf.length; i++) {
        buf[i] = ~~(fbuf[i]*255);
      }

      this.byteBuffer = buf;
    }

    return this;
  }

  convertTypeTo(type) {
    if (type === undefined || type === this.type) {
      return this
    }

    if (this.gpuHasData) {
      if (type === ImageTypes.GENERATED) {
        this.gpuHasData = false;
        this.glRegen = true;
      } else {
        this.downloadFromGL();
      }
    }

    if (type === ImageTypes.BYTE_BUFFER) {
      this._convertToByte();
    } else if (type === ImageTypes.FLOAT_BUFFER) {
      this._convertToFloat();
    }

    this.ready = false;
    this.flag |= ImageFlags.UPDATE;
    this.update();

    if (this._drawFBO) {
      this._drawFBO.destroy(window._gl);
      this._drawFBO = undefined;
    }

    this.type = type;

    return this;
  }

  static blockDefine() {
    return {
      uiName : "Image",
      typeName : "image",
      defaultName : "image.png",
      icon : Icons.IMAGE_EDITOR
    }
  }

  destroy() {
    if (this.glTex) {
      try {
        this.glTex.destroy(this.gl);
      } catch (error) {
        util.print_stack(error);
      }
    }

    if (this._drawFBO) {
      this._drawFBO.destroy(this.gl);
    }

    this._drawFBO = undefined;
    this.glTex = undefined;
    this.gl = undefined;
  }

  getGlTex(gl) {
    if (!this._image || !this.ready) {
      return undefined;
    }

    //handle context loss
    if (gl && gl !== this.gl) {
      this.gl = gl;
      this.glTex = undefined;
      this.glRegen = true;
    }

    if (this.glTex && (!this.glRegen || this.gpuHasData)) {
      return this.glTex;
    }

    if (this.glTex) {
      this.glTex.destroy(gl);
    }

    this.glRegen = false;

    let img;

    if (this.floatBuffer && this.floatBuffer.length === this.width*this.height*4) {
      img = this.floatBuffer;
      this.glType = gl.FLOAT;
    } else {
      img = this._image;
      this.glType = gl.UNSIGNED_BYTE;
    }

    //console.warn("Uploading image to gpu...", img instanceof Float32Array ? img : "(img tag)");

    let tex = this.glTex = Texture.load(gl, this.width, this.height, img);

    return tex;
  }

  calcUpdateKey(digest = new util.HashDigest()) {
    digest.add(this.lib_id);
    digest.add(this.ready);
    digest.add(this.type);

    if (this.type === ImageTypes.GENERATED) {
      digest.add(this.genType);

      digest.add(this.genColor[0]);
      digest.add(this.genColor[1]);
      digest.add(this.genColor[2]);
      digest.add(this.genColor[3]);
    }

    digest.add(this.width);
    digest.add(this.height);
    digest.add(this.url.length);
    digest.add(this.flag);
    digest.add(this.updateGen);
  }

  _firePromises() {
    this.ready = true;

    for (let accept of this._promises) {
      accept(this._image);
    }
  }

  update() {
    let key = ":" + this.type + ":" + (this.flag & ImageFlags.UPDATE);
    if (this.type === ImageTypes.GENERATED) {
      key += ":" + this.genType;
      key += ":" + this.genColor[0] + ":" + this.genColor[1] + ":" + this.genColor[2] + ":" + this.genColor[3];
    }

    key += ":" + this.width + ":" + this.height;

    let doupdate = key !== this._last_update_key || !this._image;
    doupdate = doupdate || (this.flag & ImageFlags.UPDATE);

    //ignore updates while gpu has data
    if (this.gpuHasData) {
      //this._last_update_key = key;
      return;
    }

    if (doupdate) {
      this._last_update_key = key;
      console.warn("regenerating image data for block", this);
      this._regen();
    }
  }

  _regen() {
    this.updateGen++;

    this.flag &= ~ImageFlags.UPDATE;
    this.ready = false;
    this._image = undefined;

    if (this.type === ImageTypes.URL) {
      let image = this._image = document.createElement("img");
      image.src = this.url;

      this.ready = false;
      this._promises.length = 0;

      image.onload = () => {
        this.width = image.width;
        this.height = image.height;

        let canvas = document.createElement("canvas");
        let g = canvas.getContext("2d");
        canvas.width = this.width;
        canvas.height = this.height;

        g.imageSmoothingEnabled = false;
        g.drawImage(image, 0, 0);

        image.image = g.getImageData(0, 0, canvas.width, canvas.height);
        this._firePromises();
      }

      return;
    }

    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");
    canvas.width = this.width;
    canvas.height = this.height;

    let idata;

    if (this.type === ImageTypes.GENERATED) {
      if (this.genType === ImageGenTypes.COLOR) {
        g.beginPath();
        g.rect(0, 0, canvas.width, canvas.height);
        g.fillStyle = color2css(this.genColor);
        g.fill()

        idata = g.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        let steps = 16;

        let colors = [
          "rgb(200, 200, 200)",
          "rgb(65, 65, 65)"
        ];

        let cx = canvas.width/steps, cy = canvas.height/steps;

        g.strokeStyle = "black";
        let tsize = cx*0.5;
        g.font = tsize + "px sans-serif";

        for (let i = 0; i < steps*steps; i++) {
          let ix = i%steps, iy = ~~(i/steps);

          let x = (ix/steps)*canvas.width;
          let y = (iy/steps)*canvas.height;


          let c = (ix + iy)%2;

          g.fillStyle = "black";
          let t = String.fromCharCode("A".charCodeAt(0)+ix) + "" + iy;
          g.fillText(""+t, x+cx*0.5 - tsize*0.5, y - cy*0.5 + tsize*0.5);

          g.beginPath();
          g.rect(x, y, cx, cy);
          g.fillStyle = colors[c];
          g.fill();
          g.stroke();
        }
      }

      this.glRegen = true;
    } else if (this.type === ImageTypes.FLOAT_BUFFER) {
      idata = new ImageData(this.width, this.height);
      let buf = this.floatBuffer;

      for (let i=0; i<buf.length; i++) {
        idata.data[i] = ~~(buf[i]*255);
      }

      this.byteBuffer = idata.data;
      g.putImageData(idata, 0, 0);
    } else if (this.type === ImageTypes.BYTE_BUFFER) {
      idata = new ImageData(this.width, this.height);
      let a = this.byteBuffer;
      let b = idata.data;

      b.set(a);
      /*
      for (let i=0; i<a.length; i++) {
        b[i] = a[i];
      }//*/

      g.putImageData(idata, 0, 0);
    }

    if (!idata) {
      idata = g.getImageData(0, 0, canvas.width, canvas.height);
    }

    this.ready = false;

    this._image = document.createElement("img");
    this._image.src = canvas.toDataURL();
    this._image.image = idata;
    this._image.onload = () => {
      this._firePromises();
    }

    return this._image;
  }

  exec(ctx) {
    this.outputs.depend.graphUpdate();
  }

  getImage() {
    let type = this.type;
    this.update();

    return new Promise((accept, reject) => {
      if (!this.ready) {
        this._promises.push(accept);
      } else {
        accept(this._image);
      }
    });
  }

  _save() {
    if (this.type === ImageTypes.URL) {
      return this.url;
    }

    let canvas = document.createElement("canvas");
    let g = canvas.getContext("2d");
    let ok = false;
    let dataurl = "";
    let idata;

    canvas.width = this.width;
    canvas.height = this.height;

    let type = this.type;

    if (this.gpuHasData) {
      this.downloadFromGL();
      type = ImageTypes.FLOAT_BUFFER;
    }

    if (type === ImageTypes.FLOAT_BUFFER) {
      let fbuf = this.floatBuffer;
      idata = new ImageData(this.width, this.height);
      let ibuf = idata.data;

      for (let i = 0; i < ibuf.length; i++) {
        ibuf[i] = ~~(fbuf[i]*255);
      }
    } else if (type === ImageTypes.BYTE_BUFFER) {
      idata = new ImageData(this.width, this.height);
      if (this.byteBuffer.length > 0) {
        idata.data.set(this.byteBuffer);
      }
    }

    if (idata) {
      g.putImageData(idata, 0, 0);
      dataurl = canvas.toDataURL();

      ok = true;
    }

    if (!ok && this._image) {
      dataurl = this._image.src;
    }

    return dataurl;
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);

    if (this.type !== ImageTypes.GENERATED) {
      this.type = ImageTypes.URL;
    }
  }

  static nodedef() {return {
    name : "image",
    uiname : "Image",
    inputs : {},

    outputs : {
      depend : new DependSocket()
    },
    flag : NodeFlags.SAVE_PROXY
  }}
}
ImageBlock.STRUCT = nstructjs.inherit(ImageBlock, DataBlock) + `
  type        : int;
  flag        : int;
  genType     : int;
  url         : string | this._save();
  width       : int;
  height      : int; 
  genColor    : vec4;
}
`;
nstructjs.register(ImageBlock);
DataBlock.register(ImageBlock);

export class ImageUser {
  constructor(image) {
    this.image = image;
  }

  dataLink(ownerBlock, getblock, getblock_addUser) {
    this.image = getblock_addUser(this.image);
  }

  calcUpdateKey(digest = new util.HashDigest()) {
    if (this.image && typeof this.image === "number") {
      digest.add(this.image);
    } else if (this.image && this.image instanceof ImageBlock) {
      this.image.calcUpdateKey(digest);
    } else {
      digest.add(1);
    }

    return digest.get();
  }
}

ImageUser.STRUCT = `
ImageUser {
  image       : DataRef | DataRef.fromBlock(this.image);
}
`
nstructjs.register(ImageUser);
