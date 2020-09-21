export const Endians = {
  BIG    : 0,
  LITTLE : 1
};

let Uint8Buf = new Uint8Array(8);
let Int32Buf = new Int32Array(Uint8Buf.buffer);
let Uint32Buf = new Uint32Array(Uint8Buf.buffer);
let Float32Buf = new Float32Array(Uint8Buf.buffer);
let Float64Buf = new Float64Array(Uint8Buf.buffer);
let Int16Buf = new Int16Array(Uint8Buf.buffer);
let Uint16Buf = new Uint16Array(Uint8Buf.buffer);

export class BinaryWriter {
  constructor() {
    this.data = [];
  }
  
  string(s) {
    for (let i=0; i<s.length; i++) {
      let c = s.charCodeAt(i);
      
      this.data.push(c);
    }
  }
  
  int32(c) {
    this.data.push(c & 255);
    this.data.push((c>>8) & 255);
    this.data.push((c>>16) & 255);
    this.data.push((c>>24) & 255);
  }

  uint16(c) {
    this.data.push(c & 255);
    this.data.push((c>>8) & 255);
  }

  bytes(c) {
    if  (typeof c == "string") {
      for (let i=0; i<c.length; i++) {
        this.data.push(c.charCodeAt(i));
      }
    } else {
      for (let i=0; i<c.length; i++) {
        this.data.push(c[i]);
      }
    }
  }
  
  uint8(c) {
    if (typeof c == "string" || c instanceof String) {
      c = c.charCodeAt(0);
    }
    
    this.data.push(c);
  }
  
  finish() {
    return new Uint8Array(this.data);
  }
}

export class BinaryReader {
  constructor(buffer, endian= Endians.LITTLE) {
    if (buffer instanceof DataView) {
      this.view = buffer;
    } else {
      this.view = new DataView(buffer);
    }
    this.endian = endian;
    this.i = 0;
  }
  
  bytes(n) {
    let ret = [];
    
    for (let i=0; i<n; i++) {
      ret.push(this.view.getUint8(this.i++));
    }
    
    return ret;
  }
  
  float64() {
    this.i += 8;
    return this.view.getFloat64(this.i-8, this.endian);
  }
  
  float32() {
    this.i += 4;
    return this.view.getFloat32(this.i-4, this.endian);
  }
  
  int32() {
    this.i += 4;
    return this.view.getInt32(this.i-4, this.endian);
  }

  int64() {
    let a = this.uint32();
    let b = this.uint32();

    if (this.endian !== Endians.LITTLE) {
      let t = a;

      a = b;
      b = t;
    }

    let sign = 1;

    //Check if negative.  Let's see if I'm remembering this right. . .
    if (b & (1<<31)) {
      //undo twos complement
      a = a ^ ((1<<31)-1);
      b = b ^ ((1<<31)-1);

      sign = -1;
    }

    return (a | (b<<31)) * sign;
  }

  uint32() {
    this.i += 4;
    return this.view.getUint32(this.i-4, this.endian);
  }

  int16() {
    this.i += 2;
    return this.view.getInt16(this.i-2, this.endian);
  }
  
  uint16() {
    this.i += 2;
    return this.view.getUint16(this.i-2, this.endian);
  }
  
  at_end() {
    return this.i >= this.view.buffer.byteLength;
  }

  get length() {
    return this.view.buffer.byteLength;
  }

  skip(n) {
    this.i += n;
    return this;
  }

  uint8() {
    this.i += 1;
    return this.view.getUint8(this.i-1, this.endian);
  }
  
  string(n) {
    let s = "";
    let view = this.view;
    
    for (let i=0; i<n; i++) {
      let b = view.getUint8(this.i+i, this.endian);
      s += String.fromCharCode(b);
    }
    
    this.i += n;
    return s;
  }
}

window._binary_lib_test = function(n) {
  let d = new Uint32Array(2);
  d[0] = d[1] = (1<<31)-1;


  let r = new BinaryReader(d.buffer);

  return r.int64();
}
