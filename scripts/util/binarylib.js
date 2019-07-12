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
  
  int32(n) {
    
  }
  
  bytes(c) {
    for (let i=0; i<c.length; i++) {
      this.data.push(c[i]);
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
  constructor(buffer, endian=Endians.BIG) {
    this.view = new DataView(buffer);
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
    this.i += 4;
    return this.view.getFloat64(this.i-4, this.endian);
  }
  
  float32() {
    this.i += 4;
    return this.view.getFloat32(this.i-4, this.endian);
  }
  
  int32() {
    this.i += 4;
    return this.view.getInt32(this.i-4, this.endian);
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
