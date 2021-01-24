import './polyfill.js';

let silencelog = 0;
export function silence() {
  silencelog++;
}
export function unsilence() {
  silencelog = Math.max(silencelog-1, 0);
}

export function strong() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    s += arguments[i] + " ";
  }

  return termColor(s, "red");
}

export function stronglog() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    if (i > 0) {
      s += ' ';
    }

    s += arguments[i];
  }

  if (!silencelog) {
    console.log(termPrint(strong(s)));
  }
}

export function log() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    if (i > 0) {
      s += ' ';
    }
    s += arguments[i];
  }

  if (!silencelog) {
    console.log(termPrint(s));
  }
}

export function indent(n, chr = "  ", color = undefined) {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += chr;
  }

  if (color !== undefined) {
    return termColor(s, color);
  } else {
    return s;
  }
}

let colormap = {
  "black"   : 30,
  "red"     : 31,
  "green"   : 32,
  "yellow"  : 33,
  "blue"    : 34,
  "magenta" : 35,
  "cyan"    : 36,
  "white"   : 37,
  "reset"   : 0,
  "grey"    : 2,
  "orange"  : 202,
  "pink"    : 198,
  "brown"   : 314,
  "lightred": 91,
  "peach"   : 210
}

export let termColorMap = {};
for (let k in colormap) {
  termColorMap[k] = colormap[k];
  termColorMap[colormap[k]] = k;
}

export function termColor(s, c) {
  if (typeof s === "symbol") {
    s = s.toString();
  } else {
    s = "" + s;
  }

  if (c in colormap)
    c = colormap[c]

  if (c > 107) {
    let s2 = '\u001b[38;5;' + c + "m"
    return s2 + s + '\u001b[0m'
  }

  return '\u001b[' + c + 'm' + s + '\u001b[0m'
};

export function termPrint() {
  let s = '';
  for (let i = 0; i < arguments.length; i++) {
    if (i > 0) {
      s += ' ';
    }
    s += arguments[i];
  }

  let re1a = /\u001b\[[1-9][0-9]?m/;
  let re1b = /\u001b\[[1-9][0-9];[0-9][0-9]?;[0-9]+m/
  let re2 = /\u001b\[0m/;

  let endtag = '\u001b[0m';

  function tok(s, type) {
    return {
      type : type,
      value: s
    }
  }

  let tokdef = [
    [re1a, "start"],
    [re1b, "start"],
    [re2, "end"]
  ];

  let s2 = s;

  let i = 0;
  let tokens = [];

  while (s2.length > 0) {
    let ok = false;

    let mintk = undefined, mini = undefined;
    let minslice = undefined, mintype = undefined;

    for (let tk of tokdef) {
      let i = s2.search(tk[0]);

      if (i >= 0 && (mini === undefined || i < mini)) {
        minslice = s2.slice(i, s2.length).match(tk[0])[0];
        mini = i;
        mintype = tk[1];
        mintk = tk;
        ok = true;
      }
    }

    if (!ok) {
      break;
    }

    if (mini > 0) {
      let chunk = s2.slice(0, mini);
      tokens.push(tok(chunk, "chunk"));
    }

    s2 = s2.slice(mini+minslice.length, s2.length);
    let t = tok(minslice, mintype);

    tokens.push(t);
  }

  if (s2.length > 0) {
    tokens.push(tok(s2, "chunk"));
  }

  let stack = [];
  let cur;

  let out = '';

  for (let t of tokens) {
    if (t.type === "chunk") {
      out += t.value;
    } else if (t.type === "start") {
      stack.push(cur);
      cur = t.value;

      out += t.value;
    } else if (t.type === "end") {
      cur = stack.pop();
      if (cur) {
        out += cur;
      } else {
        out += endtag;
      }
    }
  }

  return out;
}

globalThis.termColor = termColor;

export class MovingAvg extends Array {
  constructor(size = 64) {
    super();

    this.length = size;
    this.cur = 0;
    this.used = 0;
    this.sum = 0;
  }

  add(val) {
    if (this.used < this.length) {
      this[this.cur] = val;
      this.used++;
    } else {
      this.sum -= this[this.cur];
      this[this.cur] = val;
    }

    this.sum += val;
    this.cur = (this.cur + 1)%this.length;

    return this.sample();
  }

  sample() {
    return this.used ? this.sum/this.used : 0.0;
  }
}

var EmptySlot = {};

export function getClassParent(cls) {
  let p = cls.prototype;

  if (p) p = p.__proto__;
  if (p) p = p.constructor
  ;
  return p;
}

/*
* returns all object keys, including
* inherited ones
* */
export function getAllKeys(obj) {
  let keys = new Set();

  if (typeof obj !== "object" && typeof obj !== "function") {
    throw new Error("must pass an object ot getAllKeys; object was: " + obj);
  }

  let p;

  while (p && p !== Object) {
    for (let k in Object.getOwnPropertyDescriptors(obj)) {
      if (k === "__proto__")
        continue;

      keys.add(k);
    }

    for (let k of Object.getOwnPropertySymbols(obj)) {
      keys.add(k);
    }

    p = p.__proto__;
  }

  let cls = obj.constructor;
  if (!cls)
    return keys;

  while (cls) {
    let proto = cls.prototype;
    if (!proto) {
      cls = getClassParent(cls);
      continue;
    }

    for (let k in proto) {
      keys.add(k);
    }

    for (let k in Object.getOwnPropertyDescriptors(proto)) {
      keys.add(k);
    }

    cls = getClassParent(cls);
  }

  return keys;
}

export function btoa(buf) {
  if (buf instanceof ArrayBuffer) {
    buf = new Uint8Array(buf);
  }

  if (typeof buf == "string" || buf instanceof String) {
    return globalThis.btoa(buf);
  }

  var ret = "";
  for (var i = 0; i < buf.length; i++) {
    ret += String.fromCharCode(buf[i]);
  }

  return btoa(ret);
};

export function atob(buf) {
  let data = globalThis.atob(buf);
  let ret = [];

  for (let i = 0; i < data.length; i++) {
    ret.push(data.charCodeAt(i));
  }

  return new Uint8Array(ret);
}

export function time_ms() {
  if (globalThis.performance)
    return globalThis.performance.now();
  else
    throw new Error("no performance.now"); //return new Date().getMilliseconds();
}

export function color2css(c) {
  var ret = c.length === 3 ? "rgb(" : "rgba(";

  for (var i = 0; i < 3; i++) {
    if (i > 0)
      ret += ",";

    ret += ~~(c[i]*255);
  }

  if (c.length === 4)
    ret += "," + c[3];
  ret += ")";

  return ret;
}

export class cachering extends Array {
  constructor(func, size, isprivate=false) {
    super()

    this.private = isprivate;
    this.cur = 0;

    for (let i = 0; i < size; i++) {
      this.push(func());
    }
  }

  static fromConstructor(cls, size, isprivate=false) {
    var func = function () {
      return new cls();
    }

    return new cachering(func, size, isprivate);
  }

  next() {
    if (debug_cacherings) {
      this.gen++;
    }
    var ret = this[this.cur];
    this.cur = (this.cur + 1)%this.length;

    return ret;
  }
}

export class SetIter {
  constructor(set) {
    this.set = set;
    this.i = 0;
    this.ret = {done: false, value: undefined};
  }

  [Symbol.iterator]() {
    return this;
  }

  next() {
    var ret = this.ret;

    while (this.i < this.set.items.length && this.set.items[this.i] === EmptySlot) {
      this.i++;
    }

    if (this.i >= this.set.items.length) {
      ret.done = true;
      ret.value = undefined;

      return ret;
    }


    ret.value = this.set.items[this.i++];
    return ret;
  }
}

/**
 Set

 Stores objects in a set; each object is converted to a value via
 a [Symbol.keystr] method, and if that value already exists in the set
 then the object is not added.


 * */
export class set {
  constructor(input) {
    this.items = [];
    this.keys = {};
    this.freelist = [];

    this.length = 0;

    if (typeof input == "string") {
      for (let i=0; i<input.length; i++) {
        this.add(input[i]);
      }

      return;
    }

    if (input !== undefined) {
      if (Symbol.iterator in input) {
        for (let item of input) {
          this.add(item);
        }
      } else if (input.forEach) {
        input.forEach(function (item) {
          this.add(item);
        }, this);
      }
    }
  }

  [Symbol.iterator]() {
    return new SetIter(this);
  }

  equals(setb) {
    for (let item of this) {
      if (!setb.has(item)) {
        return false;
      }
    }

    for (let item of setb) {
      if (!this.has(item)) {
        return false;
      }
    }

    return true;
  }

  clear() {
    this.items.length = 0;
    this.keys = {};
    this.freelist.length = 0;
    this.length = 0;

    return this;
  }

  filter(f, thisvar) {
    let i = 0;
    let ret = new set();

    for (let item of this) {
      if (f.call(thisvar, item, i++, this)) {
        ret.add(item);
      }
    }

    return ret;

  }

  map(f, thisvar) {
    let ret = new set();

    let i = 0;

    for (let item of this) {
      ret.add(f.call(thisvar, item, i++, this));
    }

    return ret;
  }

  reduce(f, initial) {
    if (initial === undefined) {
      for (let item of this) {
        initial = item;
        break;
      }
    }

    let i = 0;
    for (let item of this) {
      initial = f(initial, item, i++, this);
    }

    return initial;
  }

  copy() {
    let ret = new set();

    for (let item of this) {
      ret.add(item);
    }

    return ret;
  }

  add(item) {
    let key = item[Symbol.keystr]();

    if (key in this.keys) return;

    if (this.freelist.length > 0) {
      let i = this.freelist.pop();

      this.keys[key] = i;
      this.items[i] = item;
    } else {
      let i = this.items.length;

      this.keys[key] = i;
      this.items.push(item);
    }

    this.length++;
  }

  get size() {
    return this.length;
  }

  delete(item, ignore_existence = true) {
    this.remove(item, ignore_existence);
  }

  remove(item, ignore_existence) {
    let key = item[Symbol.keystr]();

    if (!(key in this.keys)) {
      if (!ignore_existence) {
        console.warn("Warning, item", item, "is not in set");
      }
      return;
    }

    let i = this.keys[key];

    this.freelist.push(i);
    this.items[i] = EmptySlot;

    delete this.keys[key];

    this.length--;
  }

  has(item) {
    return item[Symbol.keystr]() in this.keys;
  }

  forEach(func, thisvar) {
    for (let i = 0; i < this.items.length; i++) {
      let item = this.items[i];

      if (item === EmptySlot)
        continue;

      thisvar !== undefined ? func.call(thisvar, item) : func(item);
    }
  }
}

export class HashIter {
  constructor(hash) {
    this.hash = hash;
    this.i = 0;
    this.ret = {done: false, value: undefined};
  }

  next() {
    var items = this.hash._items;

    if (this.i >= items.length) {
      this.ret.done = true;
      this.ret.value = undefined;

      return this.ret;
    }

    do {
      this.i += 2;
    } while (this.i < items.length && items[i] === _hash_null);

    return this.ret;
  }
}

function get_callstack(err) {
  var callstack = [];
  var isCallstackPopulated = false;

  var err_was_undefined = err == undefined;

  if (err === undefined) {
    try {
      _idontexist.idontexist += 0; //doesn't exist- that's the point
    } catch (err1) {
      err = err1;
    }
  }

  if (err !== undefined) {
    if (err.stack) { //Firefox
      var lines = err.stack.split('\n');
      var len = lines.length;
      for (var i = 0; i < len; i++) {
        if (1) {
          lines[i] = lines[i].replace(/@http\:\/\/.*\//, "|")
          var l = lines[i].split("|")
          lines[i] = l[1] + ": " + l[0]
          lines[i] = lines[i].trim()
          callstack.push(lines[i]);
        }
      }

      //Remove call to printStackTrace()
      if (err_was_undefined) {
        //callstack.shift();
      }
      isCallstackPopulated = true;
    } else if (globalThis.opera && e.message) { //Opera
      var lines = err.message.split('\n');
      var len = lines.length;
      for (var i = 0; i < len; i++) {
        if (lines[i].match(/^\s*[A-Za-z0-9\-_\$]+\(/)) {
          var entry = lines[i];
          //Append next line also since it has the file info
          if (lines[i + 1]) {
            entry += ' at ' + lines[i + 1];
            i++;
          }
          callstack.push(entry);
        }
      }
      //Remove call to printStackTrace()
      if (err_was_undefined) {
        callstack.shift();
      }
      isCallstackPopulated = true;
    }
  }

  var limit = 24;
  if (!isCallstackPopulated) { //IE and Safari
    var currentFunction = arguments.callee.caller;
    var i = 0;
    while (currentFunction && i < 24) {
      var fn = currentFunction.toString();
      var fname = fn.substring(fn.indexOf("function") + 8, fn.indexOf('')) || 'anonymous';
      callstack.push(fname);
      currentFunction = currentFunction.caller;

      i++;
    }
  }

  return callstack;
}

export function print_stack(err) {
  try {
    var cs = get_callstack(err);
  } catch (err2) {
    console.log("Could not fetch call stack.");
    return;
  }

  console.log("Callstack:");
  for (var i = 0; i < cs.length; i++) {
    console.log(cs[i]);
  }
}

//from:https://en.wikipedia.org/wiki/Mersenne_Twister
function _int32(x) {
  // Get the 31 least significant bits.
  return ~~(((1<<30) - 1) & (~~x))
}

export class MersenneRandom {
  constructor(seed) {
    // Initialize the index to 0
    this.index = 624;
    this.mt = new Uint32Array(624);

    this.seed(seed);
  }

  random() {
    return this.extract_number()/(1<<30);
  }

  seed(seed) {
    seed = ~~(seed*8192);

    // Initialize the index to 0
    this.index = 624;
    this.mt.fill(0, 0, this.mt.length);

    this.mt[0] = seed;  // Initialize the initial state to the seed

    for (var i = 1; i < 624; i++) {
      this.mt[i] = _int32(
        1812433253*(this.mt[i - 1] ^ this.mt[i - 1]>>30) + i);
    }
  }

  extract_number() {
    if (this.index >= 624)
      this.twist();

    var y = this.mt[this.index];

    // Right shift by 11 bits
    y = y ^ y>>11;
    // Shift y left by 7 and take the bitwise and of 2636928640
    y = y ^ y<<7 & 2636928640;
    // Shift y left by 15 and take the bitwise and of y and 4022730752
    y = y ^ y<<15 & 4022730752;
    // Right shift by 18 bits
    y = y ^ y>>18;

    this.index = this.index + 1;

    return _int32(y);
  }

  twist() {
    for (var i = 0; i < 624; i++) {
      // Get the most significant bit and add it to the less significant
      // bits of the next number
      var y = _int32((this.mt[i] & 0x80000000) +
        (this.mt[(i + 1)%624] & 0x7fffffff));
      this.mt[i] = this.mt[(i + 397)%624] ^ y>>1;

      if (y%2 != 0)
        this.mt[i] = this.mt[i] ^ 0x9908b0df;
    }

    this.index = 0;
  }
}

var _mt = new MersenneRandom(0);

export function random() {
  return _mt.extract_number()/(1<<30);
}

export function seed(n) {
//  console.trace("seed called");
  _mt.seed(n);
}

export function strhash(str) {
  var hash = 0;

  for (var i = 0; i < str.length; i++) {
    var ch = str.charCodeAt(i);

    hash = hash < 0 ? -hash : hash;

    hash ^= (ch*524287 + 4323543) & ((1<<19) - 1);
  }

  return hash;
}


let digestcache;

/** NOT CRYPTOGRAPHIC */
export class HashDigest {
  constructor() {
    this.i = 0;
    this.hash = 0;
  }

  static cachedDigest() {
    return digestcache.next().reset();
  }

  reset() {
    this.i = 0;
    this.hash = 0;

    return this;
  }

  get() {
    return this.hash;
  }

  add(v) {
    if (v >= -5 && v <= 5) {
      v *= 32;
    }

    //glibc linear congruel generator
    this.i = ((this.i + (~~v))*1103515245 + 12345) & ((1<<29) - 1);
    //according to wikipedia only the top 16 bits are random
    //this.i = this.i>>16;

    let v2 = (v*1024*1024) & ((1<<29) - 1)
    v = v | v2;

    v = ~~v;

    this.hash ^= v ^ this.i;
  }
}

let NullItem = {};

export class MapIter {
  constructor(ownermap) {
    this.ret = {done: true, value: undefined};
    this.value = new Array(2);
    this.i = 0;
    this.map = ownermap;
    this.done = true;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.map.itercur--;
    }
  }

  next() {
    let ret = this.ret;
    let i = this.i;
    let map = this.map, list = map._list;

    while (i < list.length && list[i] === NullItem) {
      i += 2;
    }

    if (i >= list.length) {
      ret.done = true;
      ret.value = undefined;

      this.finish();
      return ret;
    }

    this.i = i + 2;

    ret.value = this.value;
    ret.value[0] = list[i];
    ret.value[1] = list[i + 1];
    ret.done = false;

    return ret;
  }

  return() {
    this.finish();

    return this.ret;
  }

  reset() {
    this.i = 0;
    this.value[0] = undefined;
    this.value[1] = undefined;
    this.done = false;

    return this;
  }
}

export class map {
  constructor() {
    this._items = {};
    this._list = [];

    this.size = 0;

    this.iterstack = new Array(8);
    this.itercur = 0;
    for (let i = 0; i < this.iterstack.length; i++) {
      this.iterstack[i] = new MapIter(this);
    }

    this.freelist = [];
  }

  has(key) {
    return key[Symbol.keystr]() in this._items;
  }

  set(key, v) {
    let k = key[Symbol.keystr]();

    let i = this._items[k];

    if (i === undefined) {
      if (this.freelist.length > 0) {
        i = this.freelist.pop();
      } else {
        i = this._list.length;
        this._list.length += 2;
      }

      this.size++;
    }

    this._list[i] = key;
    this._list[i + 1] = v;

    this._items[k] = i;
  }

  keys() {
    let this2 = this;
    return (function* () {
      for (let [key, val] of this2) {
        yield key;
      }
    })()
  }

  values() {
    let this2 = this;
    return (function* () {
      for (let [key, val] of this2) {
        yield val;
      }
    })()
  }

  get(k) {
    k = k[Symbol.keystr]();

    let i = this._items[k];
    if (i !== undefined) {
      return this._list[i + 1];
    }
  }

  delete(k) {
    k = k[Symbol.keystr]();

    if (!(k in this._items)) {
      return false;
    }

    let i = this._items[k];

    this.freelist.push(i);

    this._list[i] = NullItem;
    this._list[i + 1] = NullItem;

    delete this._items[k];
    this.size--;

    return true;
  }

  [Symbol.iterator]() {
    let ret = this.iterstack[this.itercur].reset();
    this.itercur++;

    if (this.itercur === this.iterstack.length) {
      this.iterstack.push(new MapIter(this));
    }

    return ret;
  }

}

function validateId(id) {
  let bad = typeof id !== "number";
  bad = bad || id !== ~~id;
  bad = bad || isNaN(id);

  if (bad) {
    throw new Error("bad number " + id);
  }

  return bad;
}

let UndefinedTag = {};

export class IDMap extends Array {
  constructor() {
    super();

    this._keys = new Set();
    this.size = 0;
  }

  has(id) {
    validateId(id);

    if (id < 0 || id >= this.length) {
      return false;
    }

    return this[id] !== undefined;
  }

  set(id, val) {
    validateId(id);

    if (id < 0) {
      console.warn("got -1 id in IDMap");
      return;
    }

    if (id >= this.length) {
      this.length = id + 1;
    }

    if (val === undefined) {
      val = UndefinedTag;
    }

    let ret = false;

    if (this[id] === undefined) {
      this.size++;
      this._keys.add(id);
      ret = true;
    }

    this[id] = val;
    return ret;
  }

  /* we allow -1, which always returns undefined*/
  get(id) {
    validateId(id);

    if (id === -1) {
      return undefined;
    } else if (id < 0) {
      console.warn("id was negative");
      return undefined;
    }

    let ret = id < this.length ? this[id] : undefined;
    ret = ret === UndefinedTag ? undefined : ret;

    return ret;
  }

  delete(id) {
    if (!this.has(id)) {
      return false;
    }

    this._keys.remove(id);
    this[id] = undefined;
    this.size--;

    return true;
  }

  keys() {
    let this2 = this;
    return (function*() {
      for (let id of this2._keys) {
        yield id;
      }
    })();
  }

  values() {
    let this2 = this;
    return (function*() {
      for (let id of this2._keys) {
        yield this2[id];
      }
    })();
  }

  [Symbol.iterator]() {
    let this2 = this;
    let iteritem = [0, 0];

    return (function*() {
      for (let id of this2._keys) {
        iteritem[0] = id;
        iteritem[1] = this2[id];

        if (iteritem[1] === UndefinedTag) {
          iteritem[1] = undefined;
        }

        yield iteritem;
      }
    })();
  }
}
