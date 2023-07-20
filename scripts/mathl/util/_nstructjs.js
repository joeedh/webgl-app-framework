let nexports = (function () {
  if (typeof window === "undefined" && typeof global != "undefined") {
    global._nGlobal = global;
  } else if (typeof self !== "undefined") {
    self._nGlobal = self;
  } else {
    window._nGlobal = window;
  }
  
  let exports;
  let module = {};

  //nodejs?
  if (typeof window === "undefined" && typeof global !== "undefined") {
    console.log("Nodejs!");
  } else {
    exports = {};
    _nGlobal.module = {exports : exports};
  }
  
'use strict';

if (Array.prototype.pop_i === undefined) {
  Array.prototype.pop_i = function (idx) {
    if (idx < 0 || idx >= this.length) {
      throw new Error("Index out of range");
    }

    while (idx < this.length) {
      this[idx] = this[idx + 1];
      idx++;
    }

    this.length -= 1;
  };
}

if (Array.prototype.remove === undefined) {
  Array.prototype.remove = function (item, suppress_error) {
    var i = this.indexOf(item);

    if (i < 0) {
      if (suppress_error)
        console.trace("Warning: item not in array", item);
      else
        throw new Error("Error: item not in array " + item);

      return;
    }

    this.pop_i(i);
  };
}

if (String.prototype.contains === undefined) {
  String.prototype.contains = function (substr) {
    return String.search(substr) != null;
  };
}

Symbol["_struct_keystr"] = Symbol("_struct_keystr");

String.prototype[Symbol._struct_keystr] = function () {
  return this;
};

Number.prototype[Symbol._struct_keystr] = Boolean.prototype[Symbol._struct_keystr] = function () {
  return "" + this;
};

var _o_basic_types = {"String": 0, "Number": 0, "Array": 0, "Function": 0};

const _export_truncateDollarSign_ = function(s) {
  let i = s.search("$");

  if (i > 0) {
    return s.slice(0, i).trim();
  }

  return s;
};

const _export_cachering_ = class cachering extends Array {
  constructor(cb, tot) {
    super();
    this.length = tot;
    this.cur = 0;
    
    for (let i=0; i<tot; i++) {
      this[i] = cb();
    }
  }
  
  next() {
    let ret = this[this.cur];
    
    this.cur = (this.cur + 1) % this.length;
    
    return ret;
  }
  
  static fromConstructor(cls, tot) {
    return new _export_cachering_(() => new cls(), tot);
  }
};

function isNodeJS() {
  ret = typeof process !== "undefined";
  ret = ret && process.release;
  ret = ret && process.release.name === "node";
  ret = ret && process.version;

  return !!ret;
}

let is_obj_lit = function is_obj_lit(obj) {
  if (typeof obj !== "object") {
    return false;
  }
  
  let good = obj.__proto__ && obj.__proto__.constructor && obj.__proto__.constructor === Object;

  if (good) {
    return true;
  }

  let bad = typeof obj !== "object";
  bad = bad || obj.constructor.name in _o_basic_types;
  bad = bad || obj instanceof String;
  bad = bad || obj instanceof Number;
  bad = bad || obj instanceof Boolean;
  bad = bad || obj instanceof Function;
  bad = bad || obj instanceof Array;
  bad = bad || obj instanceof Set;
  bad = bad || (obj.__proto__.constructor && obj.__proto__.constructor !== Object);

  return !bad;
};
_nGlobal.is_obj_lit = is_obj_lit;

function set_getkey(obj) {
  if (typeof obj == "number" || typeof obj == "boolean")
    return "" + obj;
  else if (typeof obj == "string")
    return obj;
  else
    return obj[Symbol._struct_keystr]();
}

const _export_get_callstack_ = function get_callstack(err) {
  var callstack = [];
  var isCallstackPopulated = false;

  var err_was_undefined = err == undefined;

  if (err == undefined) {
    try {
      _idontexist.idontexist += 0; //doesn't exist- that's the point
    } catch (err1) {
      err = err1;
    }
  }

  if (err != undefined) {
    if (err.stack) { //Firefox
      var lines = err.stack.split('\n');
      var len = lines.length;
      for (var i = 0; i < len; i++) {
        if (1) {
          lines[i] = lines[i].replace(/@http\:\/\/.*\//, "|");
          var l = lines[i].split("|");
          lines[i] = l[1] + ": " + l[0];
          lines[i] = lines[i].trim();
          callstack.push(lines[i]);
        }
      }

      //Remove call to printStackTrace()
      if (err_was_undefined) {
        //callstack.shift();
      }
      isCallstackPopulated = true;
    }
    else if (window.opera && e.message) { //Opera
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
};

const _export_print_stack_ = function print_stack(err) {
  try {
    var cs = _export_get_callstack_(err);
  } catch (err2) {
    console.log("Could not fetch call stack.");
    return;
  }

  console.log("Callstack:");
  for (var i = 0; i < cs.length; i++) {
    console.log(cs[i]);
  }
};

const EmptySlot = Symbol("emptyslot");

/**
 Set

 Stores objects in a set; each object is converted to a value via
 a [Symbol._struct_keystr] method, and if that value already exists in the set
 then the object is not added.


 * */
var set$1 =  class set {
  constructor(input) {
    this.items = [];
    this.keys = {};
    this.freelist = [];

    this.length = 0;

    if (typeof input == "string") {
      input = new String(input);
    }

    if (input !== undefined) {
      if (Symbol.iterator in input) {
        for (var item of input) {
          this.add(item);
        }
      } else if ("forEach" in input) {
        input.forEach(function(item) {
          this.add(item);
        }, this);
      } else if (input instanceof Array) {
        for (var i=0; i<input.length; i++) {
          this.add(input[i]);
        }
      }
    }
  }

  [Symbol.iterator] () {
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
    var key = item[Symbol._struct_keystr]();

    if (key in this.keys) return;

    if (this.freelist.length > 0) {
      var i = this.freelist.pop();

      this.keys[key] = i;
      this.items[i] = item;
    } else {
      var i = this.items.length;

      this.keys[key] = i;
      this.items.push(item);
    }

    this.length++;
  }

  remove(item, ignore_existence) {
    var key = item[Symbol._struct_keystr]();

    if (!(key in this.keys)) {
      if (!ignore_existence) {
        console.warn("Warning, item", item, "is not in set");
      }
      return;
    }

    var i = this.keys[key];
    this.freelist.push(i);
    this.items[i] = EmptySlot;

    delete this.keys[key];

    this.length--;
  }

  has(item) {
    return item[Symbol._struct_keystr]() in this.keys;
  }

  forEach(func, thisvar) {
    for (var i=0; i<this.items.length; i++) {
      var item = this.items[i];

      if (item === EmptySlot)
        continue;

      thisvar !== undefined ? func.call(thisvar, item) : func(item);
    }
  }
};

var IDGen = class IDGen {
  constructor() {
    this.cur_id = 1;
  }

  gen_id() {
    return this.cur_id++;
  }

  static fromSTRUCT(reader) {
    var ret = new IDGen();
    reader(ret);
    return ret;
  }
};

IDGen.STRUCT = `
struct_util.IDGen {
  cur_id : int;
}
`;

var struct_util = /*#__PURE__*/Object.freeze({
  __proto__: null,
  truncateDollarSign: _export_truncateDollarSign_,
  cachering: _export_cachering_,
  is_obj_lit: is_obj_lit,
  get_callstack: _export_get_callstack_,
  print_stack: _export_print_stack_,
  set: set$1,
  IDGen: IDGen
});

"use strict";

const _module_exports_ = {};
_module_exports_.STRUCT_ENDIAN = true; //little endian

var temp_dataview = new DataView(new ArrayBuffer(16));
var uint8_view = new Uint8Array(temp_dataview.buffer);

var unpack_context = _module_exports_.unpack_context = class unpack_context {
  constructor() {
    this.i = 0;
  }
};

var pack_byte = _module_exports_.pack_byte = function (array, val) {
  array.push(val);
};

var pack_bytes = _module_exports_.pack_bytes = function (array, bytes) {
  for (var i = 0; i < bytes.length; i++) {
    array.push(bytes[i]);
  }
};

var pack_int = _module_exports_.pack_int = function (array, val) {
  temp_dataview.setInt32(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
};

var pack_uint = _module_exports_.pack_uint = function (array, val) {
  temp_dataview.setUint32(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
};

var pack_ushort = _module_exports_.pack_ushort = function (array, val) {
  temp_dataview.setUint16(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
};

_module_exports_.pack_float = function (array, val) {
  temp_dataview.setFloat32(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
};

_module_exports_.pack_double = function (array, val) {
  temp_dataview.setFloat64(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
  array.push(uint8_view[4]);
  array.push(uint8_view[5]);
  array.push(uint8_view[6]);
  array.push(uint8_view[7]);
};

_module_exports_.pack_short = function (array, val) {
  temp_dataview.setInt16(0, val, _module_exports_.STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
};

var encode_utf8 = _module_exports_.encode_utf8 = function encode_utf8(arr, str) {
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);

    while (c != 0) {
      var uc = c & 127;
      c = c >> 7;

      if (c != 0)
        uc |= 128;

      arr.push(uc);
    }
  }
};

var decode_utf8 = _module_exports_.decode_utf8 = function decode_utf8(arr) {
  var str = "";
  var i = 0;

  while (i < arr.length) {
    var c = arr[i];
    var sum = c & 127;
    var j = 0;
    var lasti = i;

    while (i < arr.length && (c & 128)) {
      j += 7;
      i++;
      c = arr[i];

      c = (c & 127) << j;
      sum |= c;
    }

    if (sum === 0) break;

    str += String.fromCharCode(sum);
    i++;
  }

  return str;
};

var test_utf8 = _module_exports_.test_utf8 = function test_utf8() {
  var s = "a" + String.fromCharCode(8800) + "b";
  var arr = [];

  encode_utf8(arr, s);
  var s2 = decode_utf8(arr);

  if (s != s2) {
    throw new Error("UTF-8 encoding/decoding test failed");
  }

  return true;
};

function truncate_utf8(arr, maxlen) {
  var len = Math.min(arr.length, maxlen);

  var last_codepoint = 0;
  var last2 = 0;

  var incode = false;
  var i = 0;
  var code = 0;
  while (i < len) {
    incode = arr[i] & 128;

    if (!incode) {
      last2 = last_codepoint + 1;
      last_codepoint = i + 1;
    }

    i++;
  }

  if (last_codepoint < maxlen)
    arr.length = last_codepoint;
  else
    arr.length = last2;

  return arr;
}

var _static_sbuf_ss = new Array(2048);
var pack_static_string = _module_exports_.pack_static_string = function pack_static_string(data, str, length) {
  if (length == undefined)
    throw new Error("'length' paremter is not optional for pack_static_string()");

  var arr = length < 2048 ? _static_sbuf_ss : new Array();
  arr.length = 0;

  encode_utf8(arr, str);
  truncate_utf8(arr, length);

  for (var i = 0; i < length; i++) {
    if (i >= arr.length) {
      data.push(0);
    } else {
      data.push(arr[i]);
    }
  }
};

var _static_sbuf = new Array(32);

/*strings are packed as 32-bit unicode codepoints*/
var pack_string = _module_exports_.pack_string = function pack_string(data, str) {
  _static_sbuf.length = 0;
  encode_utf8(_static_sbuf, str);

  pack_int(data, _static_sbuf.length);

  for (var i = 0; i < _static_sbuf.length; i++) {
    data.push(_static_sbuf[i]);
  }
};

var unpack_bytes = _module_exports_.unpack_bytes = function unpack_bytes(dview, uctx, len) {
  var ret = new DataView(dview.buffer.slice(uctx.i, uctx.i + len));
  uctx.i += len;

  return ret;
};

var unpack_byte = _module_exports_.unpack_byte = function (dview, uctx) {
  return dview.getUint8(uctx.i++);
};

var unpack_int = _module_exports_.unpack_int = function (dview, uctx) {
  uctx.i += 4;
  return dview.getInt32(uctx.i - 4, _module_exports_.STRUCT_ENDIAN);
};

var unpack_uint = _module_exports_.unpack_uint = function (dview, uctx) {
  uctx.i += 4;
  return dview.getUint32(uctx.i - 4, _module_exports_.STRUCT_ENDIAN);
};

var unpack_ushort = _module_exports_.unpack_ushort = function (dview, uctx) {
  uctx.i += 2;
  return dview.getUint16(uctx.i - 2, _module_exports_.STRUCT_ENDIAN);
};

_module_exports_.unpack_float = function (dview, uctx) {
  uctx.i += 4;
  return dview.getFloat32(uctx.i - 4, _module_exports_.STRUCT_ENDIAN);
};

_module_exports_.unpack_double = function (dview, uctx) {
  uctx.i += 8;
  return dview.getFloat64(uctx.i - 8, _module_exports_.STRUCT_ENDIAN);
};

_module_exports_.unpack_short = function (dview, uctx) {
  uctx.i += 2;
  return dview.getInt16(uctx.i - 2, _module_exports_.STRUCT_ENDIAN);
};

let _static_arr_us = new Array(32);
_module_exports_.unpack_string = function (data, uctx) {
  let slen = unpack_int(data, uctx);

  if (!slen) {
    return "";
  }

  let str = "";
  let arr = slen < 2048 ? _static_arr_us : new Array(slen);

  arr.length = slen;
  for (let i = 0; i < slen; i++) {
    arr[i] = unpack_byte(data, uctx);
  }

  return decode_utf8(arr);
};

let _static_arr_uss = new Array(2048);
_module_exports_.unpack_static_string = function unpack_static_string(data, uctx, length) {
  let str = "";

  if (length == undefined)
    throw new Error("'length' cannot be undefined in unpack_static_string()");

  let arr = length < 2048 ? _static_arr_uss : new Array(length);
  arr.length = 0;

  let done = false;
  for (let i = 0; i < length; i++) {
    let c = unpack_byte(data, uctx);

    if (c == 0) {
      done = true;
    }

    if (!done && c != 0) {
      arr.push(c);
      //arr.length++;
    }
  }

  truncate_utf8(arr, length);
  return decode_utf8(arr);
};

let _export_parser_;
"use strict";

var t;

const _export_token_ = class token {
  constructor(type, val, lexpos, lineno, lexer, parser) {
    this.type = type;
    this.value = val;
    this.lexpos = lexpos;
    this.lineno = lineno;
    this.lexer = lexer;
    this.parser = parser;
  }

  toString() {
    if (this.value != undefined)
      return "token(type=" + this.type + ", value='" + this.value + "')";
    else
      return "token(type=" + this.type + ")";
  }
};

const _export_tokdef_ = class tokdef {
  constructor(name, regexpr, func, example) {
    this.name = name;
    this.re = regexpr;
    this.func = func;
    this.example = example;
    
    if (example === undefined && regexpr) {
      let s = "" + regexpr;
      if (s.startsWith("/") && s.endsWith("/")) {
        s = s.slice(1, s.length-1);
      }
      
      if (s.startsWith("\\")) {
        s = s.slice(1, s.length);
      }
      s = s.trim();
      
      if (s.length === 1) {
        this.example = s;
      }
    }
  }
};

var PUTIL_ParseError = class PUTIL_ParseError extends Error {
  constructor(msg) {
    super();
  }
};

const _export_lexer_ = class lexer {
  constructor(tokdef, errfunc) {
    this.tokdef = tokdef;
    this.tokens = new Array();
    this.lexpos = 0;
    this.lexdata = "";
    this.lineno = 0;
    this.errfunc = errfunc;
    this.tokints = {};
    for (var i = 0; i < tokdef.length; i++) {
      this.tokints[tokdef[i].name] = i;
    }
    this.statestack = [["__main__", 0]];
    this.states = {"__main__": [tokdef, errfunc]};
    this.statedata = 0;
  }

  add_state(name, tokdef, errfunc) {
    if (errfunc == undefined) {
      errfunc = function (lexer) {
        return true;
      };
    }
    this.states[name] = [tokdef, errfunc];
  }

  tok_int(name) {
  }

  push_state(state, statedata) {
    this.statestack.push([state, statedata]);
    state = this.states[state];
    this.statedata = statedata;
    this.tokdef = state[0];
    this.errfunc = state[1];
  }

  pop_state() {
    var item = this.statestack[this.statestack.length - 1];
    var state = this.states[item[0]];
    this.tokdef = state[0];
    this.errfunc = state[1];
    this.statedata = item[1];
  }

  input(str) {
    while (this.statestack.length > 1) {
      this.pop_state();
    }
    this.lexdata = str;
    this.lexpos = 0;
    this.lineno = 0;
    this.tokens = new Array();
    this.peeked_tokens = [];
  }

  error() {
    if (this.errfunc != undefined && !this.errfunc(this))
      return;

    console.log("Syntax error near line " + this.lineno);

    var next = Math.min(this.lexpos + 8, this.lexdata.length);
    console.log("  " + this.lexdata.slice(this.lexpos, next));

    throw new PUTIL_ParseError("Parse error");
  }

  peek() {
    var tok = this.next(true);
    if (tok == undefined)
      return undefined;
    this.peeked_tokens.push(tok);
    return tok;
  }

  peeknext() {
    if (this.peeked_tokens.length > 0) {
      return this.peeked_tokens[0];
    }

    return this.peek();
  }

  at_end() {
    return this.lexpos >= this.lexdata.length && this.peeked_tokens.length == 0;
  }

  //ignore_peek is optional, false
  next(ignore_peek) {
    if (!ignore_peek && this.peeked_tokens.length > 0) {
      var tok = this.peeked_tokens[0];
      this.peeked_tokens.shift();
      return tok;
    }

    if (this.lexpos >= this.lexdata.length)
      return undefined;

    var ts = this.tokdef;
    var tlen = ts.length;
    var lexdata = this.lexdata.slice(this.lexpos, this.lexdata.length);
    var results = [];

    for (var i = 0; i < tlen; i++) {
      var t = ts[i];
      if (t.re == undefined)
        continue;
      var res = t.re.exec(lexdata);
      if (res != null && res != undefined && res.index == 0) {
        results.push([t, res]);
      }
    }

    var max_res = 0;
    var theres = undefined;
    for (var i = 0; i < results.length; i++) {
      var res = results[i];
      if (res[1][0].length > max_res) {
        theres = res;
        max_res = res[1][0].length;
      }
    }

    if (theres == undefined) {
      this.error();
      return;
    }

    var def = theres[0];
    var token = new _export_token_(def.name, theres[1][0], this.lexpos, this.lineno, this, undefined);
    this.lexpos += token.value.length;

    if (def.func) {
      token = def.func(token);
      if (token == undefined) {
        return this.next();
      }
    }

    return token;
  }
};

const parser = _export_parser_ = class parser {
  constructor(lexer, errfunc) {
    this.lexer = lexer;
    this.errfunc = errfunc;
    this.start = undefined;
  }

  parse(data, err_on_unconsumed) {
    if (err_on_unconsumed == undefined)
      err_on_unconsumed = true;

    if (data != undefined)
      this.lexer.input(data);

    var ret = this.start(this);

    if (err_on_unconsumed && !this.lexer.at_end() && this.lexer.next() != undefined) {
      this.error(undefined, "parser did not consume entire input");
    }
    return ret;
  }

  input(data) {
    this.lexer.input(data);
  }

  error(token, msg) {
    if (msg == undefined)
      msg = "";
    if (token == undefined)
      var estr = "Parse error at end of input: " + msg;
    else
      estr = "Parse error at line " + (token.lineno + 1) + ": " + msg;
    var buf = "1| ";
    var ld = this.lexer.lexdata;
    var l = 1;
    for (var i = 0; i < ld.length; i++) {
      var c = ld[i];
      if (c == '\n') {
        l++;
        buf += "\n" + l + "| ";
      }
      else {
        buf += c;
      }
    }
    console.log("------------------");
    console.log(buf);
    console.log("==================");
    console.log(estr);
    if (this.errfunc && !this.errfunc(token)) {
      return;
    }
    throw new PUTIL_ParseError(estr);
  }

  peek() {
    var tok = this.lexer.peek();
    if (tok != undefined)
      tok.parser = this;
    return tok;
  }

  peeknext() {
    var tok = this.lexer.peeknext();
    if (tok != undefined)
      tok.parser = this;
    return tok;
  }

  next() {
    var tok = this.lexer.next();
    if (tok != undefined)
      tok.parser = this;
    return tok;
  }

  optional(type) {
    var tok = this.peek();
    if (tok == undefined)
      return false;
    if (tok.type == type) {
      this.next();
      return true;
    }
    return false;
  }

  at_end() {
    return this.lexer.at_end();
  }

  expect(type, msg) {
    var tok = this.next();
    
    if (msg == undefined) {
      msg = type;
      
      for (let tk of this.lexer.tokdef) {
        if (tk.name === type && tk.example) {
          msg = tk.example;
        }
      }
    }
    
    if (tok == undefined || tok.type != type) {
      this.error(tok, "Expected " + msg);
    }
    return tok.value;
  }
};

function test_parser() {
  var basic_types = new set(["int", "float", "double", "vec2", "vec3", "vec4", "mat4", "string"]);
  var reserved_tokens = new set(["int", "float", "double", "vec2", "vec3", "vec4", "mat4", "string", "static_string", "array"]);

  function tk(name, re, func) {
    return new _export_tokdef_(name, re, func);
  }

  var tokens = [tk("ID", /[a-zA-Z]+[a-zA-Z0-9_]*/, function (t) {
    if (reserved_tokens.has(t.value)) {
      t.type = t.value.toUpperCase();
    }
    return t;
  }), tk("OPEN", /\{/), tk("CLOSE", /}/), tk("COLON", /:/), tk("JSCRIPT", /\|/, function (t) {
    var js = "";
    var lexer = t.lexer;
    while (lexer.lexpos < lexer.lexdata.length) {
      var c = lexer.lexdata[lexer.lexpos];
      if (c == "\n")
        break;
      js += c;
      lexer.lexpos++;
    }
    if (js.endsWith(";")) {
      js = js.slice(0, js.length - 1);
      lexer.lexpos--;
    }
    t.value = js;
    return t;
  }), tk("LPARAM", /\(/), tk("RPARAM", /\)/), tk("COMMA", /,/), tk("NUM", /[0-9]/), tk("SEMI", /;/), tk("NEWLINE", /\n/, function (t) {
    t.lexer.lineno += 1;
  }), tk("SPACE", / |\t/, function (t) {
  })];
  var __iter_rt = __get_iter(reserved_tokens);
  var rt;
  while (1) {
    var __ival_rt = __iter_rt.next();
    if (__ival_rt.done) {
      break;
    }
    rt = __ival_rt.value;
    tokens.push(tk(rt.toUpperCase()));
  }
  var a = "\n  Loop {\n    eid : int;\n    flag : int;\n    index : int;\n    type : int;\n\n    co : vec3;\n    no : vec3;\n    loop : int | eid(loop);\n    edges : array(e, int) | e.eid;\n\n    loops : array(Loop);\n  }\n  ";

  function errfunc(lexer) {
    return true;
  }

  var lex = new _export_lexer_(tokens, errfunc);
  console.log("Testing lexical scanner...");
  lex.input(a);
  var token;
  while (token = lex.next()) {
    console.log(token.toString());
  }
  var parser = new _export_parser_(lex);
  parser.input(a);

  function p_Array(p) {
    p.expect("ARRAY");
    p.expect("LPARAM");
    var arraytype = p_Type(p);
    var itername = "";
    if (p.optional("COMMA")) {
      itername = arraytype;
      arraytype = p_Type(p);
    }
    p.expect("RPARAM");
    return {type: "array", data: {type: arraytype, iname: itername}}
  }

  function p_Type(p) {
    var tok = p.peek();
    if (tok.type == "ID") {
      p.next();
      return {type: "struct", data: "\"" + tok.value + "\""}
    }
    else if (basic_types.has(tok.type.toLowerCase())) {
      p.next();
      return {type: tok.type.toLowerCase()}
    }
    else if (tok.type == "ARRAY") {
      return p_Array(p);
    }
    else {
      p.error(tok, "invalid type " + tok.type);
    }
  }

  function p_Field(p) {
    var field = {};
    console.log("-----", p.peek().type);
    field.name = p.expect("ID", "struct field name");
    p.expect("COLON");
    field.type = p_Type(p);
    field.set = undefined;
    field.get = undefined;
    var tok = p.peek();
    if (tok.type == "JSCRIPT") {
      field.get = tok.value;
      p.next();
    }
    tok = p.peek();
    if (tok.type == "JSCRIPT") {
      field.set = tok.value;
      p.next();
    }
    p.expect("SEMI");
    return field;
  }

  function p_Struct(p) {
    var st = {};
    st.name = p.expect("ID", "struct name");
    st.fields = [];
    p.expect("OPEN");
    while (1) {
      if (p.at_end()) {
        p.error(undefined);
      }
      else if (p.optional("CLOSE")) {
        break;
      }
      else {
        st.fields.push(p_Field(p));
      }
    }
    return st;
  }

  var ret = p_Struct(parser);
  console.log(JSON.stringify(ret));
}

var struct_parseutil = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get parser () { return _export_parser_; },
  token: _export_token_,
  tokdef: _export_tokdef_,
  PUTIL_ParseError: PUTIL_ParseError,
  lexer: _export_lexer_
});

"use strict";

//the discontinuous id's are to make sure
//the version I originally wrote (which had a few application-specific types)
//and this one do not become totally incompatible.
var StructEnum = {
  T_INT      : 0,
  T_FLOAT    : 1,
  T_DOUBLE   : 2,
  T_STRING   : 7,
  T_STATIC_STRING : 8, //fixed-length string
  T_STRUCT   : 9, 
  T_TSTRUCT  : 10,
  T_ARRAY    : 11,
  T_ITER     : 12,
  T_SHORT    : 13,
  T_BYTE     : 14,
  T_BOOL     : 15,
  T_ITERKEYS : 16,
  T_UINT     : 17,
  T_USHORT   : 18,
  T_STATIC_ARRAY : 19
};

var StructTypes = {
  "int": StructEnum.T_INT, 
  "uint": StructEnum.T_UINT, 
  "ushort": StructEnum.T_USHORT, 
  "float": StructEnum.T_FLOAT, 
  "double": StructEnum.T_DOUBLE, 
  "string": StructEnum.T_STRING,
  "static_string": StructEnum.T_STATIC_STRING, 
  "struct": StructEnum.T_STRUCT, 
  "abstract": StructEnum.T_TSTRUCT, 
  "array": StructEnum.T_ARRAY, 
  "iter": StructEnum.T_ITER,
  "short": StructEnum.T_SHORT,
  "byte": StructEnum.T_BYTE,
  "bool": StructEnum.T_BOOL,
  "iterkeys" : StructEnum.T_ITERKEYS
};

var StructTypeMap = {};

for (var k in StructTypes) {
  StructTypeMap[StructTypes[k]] = k;
}

function gen_tabstr(t) {
  var s="";
  for (var i=0; i<t; i++) {
      s+="  ";
  }
  return s;
}

function StructParser() {
  var basic_types=new set$1([
    "int", "float", "double", "string", "short", "byte", "bool", "uint", "ushort"
  ]);
  
  var reserved_tokens=new set$1([
    "int", "float", "double", "string", "static_string", "array", 
    "iter", "abstract", "short", "byte", "bool", "iterkeys", "uint", "ushort",
    "static_array"
  ]);

  function tk(name, re, func) {
    return new _export_tokdef_(name, re, func);
  }
  
  var tokens=[
    tk("ID", /[a-zA-Z_$]+[a-zA-Z0-9_\.$]*/, function(t) {

      if (reserved_tokens.has(t.value)) {
          t.type = t.value.toUpperCase();
      }
      return t;
    }, "identifier"), 
    tk("OPEN", /\{/), 
    tk("EQUALS", /=/), 
    tk("CLOSE", /}/), 
    tk("COLON", /:/), 
    tk("SOPEN", /\[/), 
    tk("SCLOSE", /\]/), 
    tk("JSCRIPT", /\|/, function(t) {
      var js="";
      var lexer=t.lexer;
      while (lexer.lexpos<lexer.lexdata.length) {
        var c=lexer.lexdata[lexer.lexpos];
        if (c=="\n")
          break;
        js+=c;
        lexer.lexpos++;
      }
      
      while (js.trim().endsWith(";")) {
          js = js.slice(0, js.length-1);
          lexer.lexpos--;
      }
      t.value = js.trim();
      return t;
    }), 
    tk("LPARAM", /\(/), 
    tk("RPARAM", /\)/), 
    tk("COMMA", /,/), 
    tk("NUM", /[0-9]+/, undefined, "number"), 
    tk("SEMI", /;/), 
    tk("NEWLINE", /\n/, function(t) {
      t.lexer.lineno+=1;
    }, "newline"),
    tk("SPACE", / |\t/, function(t) {
    }, "whitespace")
  ];
  
  reserved_tokens.forEach(function(rt) {
    tokens.push(tk(rt.toUpperCase()));
  });
  
  function errfunc(lexer) {
    return true;
  }
  
  var lex=new _export_lexer_(tokens, errfunc);
  var parser=new _export_parser_(lex);
  
  function p_Static_String(p) {
    p.expect("STATIC_STRING");
    p.expect("SOPEN");
    var num=p.expect("NUM");
    p.expect("SCLOSE");
    return {type: StructEnum.T_STATIC_STRING, data: {maxlength: num}}
  }
  
  function p_DataRef(p) {
    p.expect("DATAREF");
    p.expect("LPARAM");
    var tname=p.expect("ID");
    p.expect("RPARAM");
    return {type: StructEnum.T_DATAREF, data: tname}
  }
  
  function p_Array(p) {
    p.expect("ARRAY");
    p.expect("LPARAM");
    var arraytype=p_Type(p);
    
    var itername="";
    if (p.optional("COMMA")) {
        itername = arraytype.data.replace(/"/g, "");
        arraytype = p_Type(p);
    }
    
    p.expect("RPARAM");
    return {type: StructEnum.T_ARRAY, data: {type: arraytype, iname: itername}}
  }
  
  function p_Iter(p) {
    p.expect("ITER");
    p.expect("LPARAM");
    var arraytype=p_Type(p);
    var itername="";
    
    if (p.optional("COMMA")) {
        itername = arraytype.data.replace(/"/g, "");
        arraytype = p_Type(p);
    }
    
    p.expect("RPARAM");
    return {type: StructEnum.T_ITER, data: {type: arraytype, iname: itername}}
  }
  
  function p_StaticArray(p) {
    p.expect("STATIC_ARRAY");
    p.expect("SOPEN");
    var arraytype=p_Type(p);
    var itername="";
    
    p.expect("COMMA");
    var size = p.expect("NUM");
    
    if (size < 0 || Math.abs(size - Math.floor(size)) > 0.000001) { 
      console.log(Math.abs(size - Math.floor(size)));
      p.error("Expected an integer");
    }
    
    size = Math.floor(size);
    
    if (p.optional("COMMA")) {
        itername = p_Type(p).data;
    }
    
    p.expect("SCLOSE");
    return {type: StructEnum.T_STATIC_ARRAY, data: {type: arraytype, size: size, iname: itername}}
  }
  
  function p_IterKeys(p) {
    p.expect("ITERKEYS");
    p.expect("LPARAM");
    
    var arraytype=p_Type(p);
    var itername="";
    
    if (p.optional("COMMA")) {
        itername = arraytype.data.replace(/"/g, "");
        arraytype = p_Type(p);
    }
    
    p.expect("RPARAM");
    return {type: StructEnum.T_ITERKEYS, data: {type: arraytype, iname: itername}}
  }
  
  function p_Abstract(p) {
    p.expect("ABSTRACT");
    p.expect("LPARAM");
    var type=p.expect("ID");
    p.expect("RPARAM");
    return {type: StructEnum.T_TSTRUCT, data: type}
  }
  
  function p_Type(p) {
    var tok=p.peek();
    
    if (tok.type=="ID") {
        p.next();
        return {type: StructEnum.T_STRUCT, data: tok.value}
    } else if (basic_types.has(tok.type.toLowerCase())) {
        p.next();
        return {type: StructTypes[tok.type.toLowerCase()]}
    } else if (tok.type=="ARRAY") {
        return p_Array(p);
    } else if (tok.type=="ITER") {
        return p_Iter(p);
    } else if (tok.type=="ITERKEYS") {
        return p_IterKeys(p);
    } else if (tok.type === "STATIC_ARRAY") {
      return p_StaticArray(p);
    } else if (tok.type=="STATIC_STRING") {
        return p_Static_String(p);
    } else if (tok.type=="ABSTRACT") {
        return p_Abstract(p);
    } else if (tok.type=="DATAREF") {
        return p_DataRef(p);
    } else {
      p.error(tok, "invalid type "+tok.type);
    }
  }
  
  function p_ID_or_num(p) {
    let t = p.peeknext();

    if (t.type == "NUM") {
      p.next();
      return t.value;
    } else {
      return p.expect("ID", "struct field name");
    }
  }
  
  function p_Field(p) {
    var field={};
    
    field.name = p_ID_or_num(p);
    p.expect("COLON");
    
    field.type = p_Type(p);
    field.set = undefined;
    field.get = undefined;
    
    let check = 0;
    
    var tok=p.peek();
    if (tok.type=="JSCRIPT") {
        field.get = tok.value;
        check = 1;
        p.next();
    }
    
    tok = p.peek();
    if (tok.type=="JSCRIPT") {
        check = 1;
        field.set = tok.value;
        p.next();
    }
    
    p.expect("SEMI");
    
    return field;
  }
  
  function p_Struct(p) {
    var st={};
    
    st.name = p.expect("ID", "struct name");
    
    st.fields = [];
    st.id = -1;
    var tok=p.peek();
    var id=-1;
    if (tok.type=="ID"&&tok.value=="id") {
        p.next();
        p.expect("EQUALS");
        st.id = p.expect("NUM");
    }
    
    p.expect("OPEN");
    while (1) {
      if (p.at_end()) {
          p.error(undefined);
      }
      else 
        if (p.optional("CLOSE")) {
          break;
      }
      else {
        st.fields.push(p_Field(p));
      }
    }
    return st;
  }
  parser.start = p_Struct;
  return parser;
}

const _export_struct_parse_ = StructParser();

var struct_parser = /*#__PURE__*/Object.freeze({
  __proto__: null,
  StructEnum: StructEnum,
  StructTypes: StructTypes,
  StructTypeMap: StructTypeMap,
  struct_parse: _export_struct_parse_
});

let _export_StructFieldTypeMap_;
let warninglvl = 1;
let debug = 0;

let pack_int$1 = _module_exports_.pack_int;
let pack_uint$1 = _module_exports_.pack_uint;
let pack_ushort$1 = _module_exports_.pack_ushort;

let pack_float = _module_exports_.pack_float;
let pack_string$1 = _module_exports_.pack_string;
let pack_byte$1 = _module_exports_.pack_byte;
let pack_double = _module_exports_.pack_double;
let pack_static_string$1 = _module_exports_.pack_static_string;
let pack_short = _module_exports_.pack_short;

let unpack_int$1 = _module_exports_.unpack_int;
let unpack_float = _module_exports_.unpack_float;
let unpack_uint$1 = _module_exports_.unpack_uint;
let unpack_ushort$1 = _module_exports_.unpack_ushort;
let unpack_string = _module_exports_.unpack_string;
let unpack_byte$1 = _module_exports_.unpack_byte;
let unpack_double = _module_exports_.unpack_double;
let unpack_static_string = _module_exports_.unpack_static_string;
let unpack_short = _module_exports_.unpack_short;

var _static_envcode_null = "";

let packer_debug, packer_debug_start, packer_debug_end;

var packdebug_tablevel = 0;

function gen_tabstr$1(tot) {
  var ret = "";

  for (var i = 0; i < tot; i++) {
    ret += " ";
  }

  return ret;
}

const _export_setWarningMode_ = (t) => {
  if (typeof t !== "number" || isNaN(t)) {
    throw new Error("Expected a single number (>= 0) argument to setWarningMode");
  }

  warninglvl = t;
};

const _export_setDebugMode_ = (t) => {
  debug = t;

  if (debug) {
    packer_debug = function (msg) {
      if (msg != undefined) {
        var t = gen_tabstr$1(packdebug_tablevel);
        console.log(t + msg);
      } else {
        console.log("Warning: undefined msg");
      }
    };
    packer_debug_start = function (funcname) {
      packer_debug("Start " + funcname);
      packdebug_tablevel++;
    };

    packer_debug_end = function (funcname) {
      packdebug_tablevel--;
      packer_debug("Leave " + funcname);
    };
  }
  else {
    packer_debug = function () {
    };
    packer_debug_start = function () {
    };
    packer_debug_end = function () {
    };
  }
};

_export_setDebugMode_(debug);

const _export_StructFieldTypes_ = [];
let StructFieldTypeMap = _export_StructFieldTypeMap_ = {};

let packNull = function(manager, data, field, type) {
  StructFieldTypeMap[type.type].packNull(manager, data, field, type);
};

function unpack_field(manager, data, type, uctx) {
  let name;
  
  if (debug) {
    name = _export_StructFieldTypeMap_[type.type].define().name;
    packer_debug_start("R start " + name);
  }
  
  let ret = _export_StructFieldTypeMap_[type.type].unpack(manager, data, type, uctx);
  
  if (debug) {
    packer_debug_end("R end " + name);
  }
  
  return ret;
}

let fromJSON = function fromJSON(manager, data, owner, type) {
  let name;

  if (debug) {
    name = _export_StructFieldTypeMap_[type.type].define().name;
    packer_debug_start("R start " + name);
  }

  let ret = _export_StructFieldTypeMap_[type.type].readJSON(manager, data, owner, type);

  if (debug) {
    packer_debug_end("R end " + name);
  }

  return ret;
};

let fakeFields = new _export_cachering_(() => {return {type : undefined, get : undefined, set : undefined}}, 256);

function fmt_type(type) {
  return _export_StructFieldTypeMap_[type.type].format(type);
}

function do_pack(manager, data, val, obj, field, type) {
  let name;
  
  if (debug) {
    name = _export_StructFieldTypeMap_[type.type].define().name;
    packer_debug_start("W start " + name);
  }

  let typeid = type;
  if (typeof typeid !== "number") {
    typeid = typeid.type;
  }
  
  let ret = _export_StructFieldTypeMap_[typeid].pack(manager, data, val, obj, field, type);
  
  if (debug) {
    packer_debug_end("W end " + name);
  } 
  
  return ret;
}


let toJSON = function toJSON(manager, val, obj, field, type) {
  let name;

  if (debug) {
    name = _export_StructFieldTypeMap_[type.type].define().name;
    packer_debug_start("W start " + name);
  }

  let typeid = type;
  if (typeof typeid !== "number") {
    typeid = typeid.type;
  }
  if (typeof typeid !== "number") {
    typeid = typeid.type;
  }

  let ret = _export_StructFieldTypeMap_[typeid].toJSON(manager, val, obj, field, type);

  if (debug) {
    packer_debug_end("W end " + name);
  }

  return ret;
};

let StructEnum$1 = StructEnum;

var _ws_env = [[undefined, undefined]];

let StructFieldType = class StructFieldType {
  static pack(manager, data, val, obj, field, type) {
  }
  
  static unpack(manager, data, type, uctx) {
  }

  static toJSON(manager, val, obj, field, type) {
    return val;
  }

  static readJSON(manager, data, owner, type) {
    return data;
  }

  static packNull(manager, data, field, type) {
    this.pack(manager, data, 0, 0, field, type);
  }
  
  static format(type) {
    return this.define().name;
  }
  
  /**
  return false to override default
  helper js for packing
  */
  static useHelperJS(field) {
    return true;
  }
  /**
  Define field class info.
  
  Example:
  <pre>
  static define() {return {
    type : StructEnum.T_INT,
    name : "int"
  }}
  </pre>
  */
  static define() {return {
    type : -1,
    name : "(error)"
  }}
  
  /**
  Register field packer/unpacker class.  Will throw an error if define() method is bad.
  */
  static register(cls) {
    if (_export_StructFieldTypes_.indexOf(cls) >= 0) {
      throw new Error("class already registered");
    }
    
    if (cls.define === StructFieldType.define) {
      throw new Error("you forgot to make a define() static method");
    }
    
    if (cls.define().type === undefined) {
      throw new Error("cls.define().type was undefined!");
    }
    
    if (cls.define().type in _export_StructFieldTypeMap_) {
      throw new Error("type " + cls.define().type + " is used by another StructFieldType subclass");
    }
    
    _export_StructFieldTypes_.push(cls);
    _export_StructFieldTypeMap_[cls.define().type] = cls;
  }
};

class StructIntField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_int$1(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_int$1(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_INT,
    name : "int"
  }}
}
StructFieldType.register(StructIntField);

class StructFloatField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_float(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_float(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_FLOAT,
    name : "float"
  }}
}
StructFieldType.register(StructFloatField);

class StructDoubleField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_double(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_double(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_DOUBLE,
    name : "double"
  }}
}
StructFieldType.register(StructDoubleField);

class StructStringField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    val = !val ? "" : val;
    
    pack_string$1(data, val);
  }

  static packNull(manager, data, field, type) {
    this.pack(manager, data, "", 0, field, type);
  }

  static toJSON(manager, val, obj, field, type) {
    return "" + val;
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_string(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_STRING,
    name : "string"
  }}
}
StructFieldType.register(StructStringField);

class StructStaticStringField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    val = !val ? "" : val;
    
    pack_static_string$1(data, val, type.data.maxlength);
  }
  
  static format(type) {
    return `static_string[${type.data.maxlength}]`;
  }
 
  static packNull(manager, data, field, type) {
    this.pack(manager, data, "", 0, field, type);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_static_string(data, uctx, type.data.maxlength);
  }   
  
  static define() {return {
    type : StructEnum$1.T_STATIC_STRING,
    name : "static_string"
  }}
}
StructFieldType.register(StructStaticStringField);

class StructStructField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    manager.write_struct(data, val, manager.get_struct(type.data));
  }
  
  static format(type) {
    return type.data;
  }

  static toJSON(manager, val, obj, field, type) {
    return manager.writeJSON(val);
  }

  static packNull(manager, data, field, type) {
    let stt = manager.get_struct(type.data);
    
    for (let field2 of stt.fields) {
      let type2 = field2.type;
      
      packNull(manager, data, field2, type2);
    }
  }
  
  static unpack(manager, data, type, uctx) {
    var cls2 = manager.get_struct_cls(type.data);
    return manager.read_object(data, cls2, uctx);
  }

  static readJSON(manager, data, owner, type) {
    var cls2 = manager.get_struct_cls(type.data);
    return manager.readJSON(data, cls2);
  }

  static define() {return {
    type : StructEnum$1.T_STRUCT,
    name : "struct"
  }}
}
StructFieldType.register(StructStructField);

class StructTStructField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    var cls = manager.get_struct_cls(type.data);
    var stt = manager.get_struct(type.data);

    //make sure inheritance is correct
    if (val.constructor.structName != type.data && (val instanceof cls)) {
      //if (DEBUG.Struct) {
      //    console.log(val.constructor.structName+" inherits from "+cls.structName);
      //}
      stt = manager.get_struct(val.constructor.structName);
    } else if (val.constructor.structName == type.data) {
      stt = manager.get_struct(type.data);
    } else {
      console.trace();
      throw new Error("Bad struct " + val.constructor.structName + " passed to write_struct");
    }

    packer_debug("int " + stt.id);

    pack_int$1(data, stt.id);
    manager.write_struct(data, val, stt);
  }

  static toJSON(manager, val, obj, field, type) {
    var cls = manager.get_struct_cls(type.data);
    var stt = manager.get_struct(type.data);

    //make sure inheritance is correct
    if (val.constructor.structName !== type.data && (val instanceof cls)) {
      //if (DEBUG.Struct) {
      //    console.log(val.constructor.structName+" inherits from "+cls.structName);
      //}
      stt = manager.get_struct(val.constructor.structName);
    } else if (val.constructor.structName === type.data) {
      stt = manager.get_struct(type.data);
    } else {
      console.trace();
      throw new Error("Bad struct " + val.constructor.structName + " passed to write_struct");
    }

    packer_debug("int " + stt.id);

    return {
      type : stt.name,
      data : manager.writeJSON(val, stt)
    }
  }

  static packNull(manager, data, field, type) {
    let stt = manager.get_struct(type.data);
    
    pack_int$1(data, stt.id);
    packNull(manager, data, field, {type : STructEnum.T_STRUCT, data : type.data});
  }

  static format(type) {
    return "abstract(" + type.data + ")";
  }
  
  static unpack(manager, data, type, uctx) {
    var id = _module_exports_.unpack_int(data, uctx);

    packer_debug("-int " + id);
    if (!(id in manager.struct_ids)) {
      packer_debug("struct id: " + id);
      console.trace();
      console.log(id);
      console.log(manager.struct_ids);
      packer_debug_end("tstruct");
      throw new Error("Unknown struct type " + id + ".");
    }

    var cls2 = manager.get_struct_id(id);

    packer_debug("struct name: " + cls2.name);
    cls2 = manager.struct_cls[cls2.name];

    let ret =  manager.read_object(data, cls2, uctx);
    //packer_debug("ret", ret);

    return ret;
  }

  static readJSON(manager, data, owner, type) {
    var sttname = data.type;

    packer_debug("-int " + sttname);
    if (sttname === undefined || !(sttname in manager.structs)) {
      packer_debug("struct name: " + sttname);
      console.trace();
      console.log(sttname);
      console.log(manager.struct_ids);
      packer_debug_end("tstruct");
      throw new Error("Unknown struct " + sttname + ".");
    }

    var cls2 = manager.structs[sttname];

    packer_debug("struct class name: " + cls2.name);
    cls2 = manager.struct_cls[cls2.name];

    let ret = manager.readJSON(data.data, cls2);
    //packer_debug("ret", ret);

    return ret;
  }

  static define() {return {
    type : StructEnum$1.T_TSTRUCT,
    name : "tstruct"
  }}
}
StructFieldType.register(StructTStructField);

class StructArrayField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    if (!val) {
      console.trace();
      console.log("Undefined array fed to struct struct packer!");
      console.log("Field: ", field);
      console.log("Type: ", type);
      console.log("");
      packer_debug("int 0");
      _module_exports_.pack_int(data, 0);
      return;
    }

    packer_debug("int " + val.length);
    _module_exports_.pack_int(data, val.length);

    var d = type.data;

    var itername = d.iname;
    var type2 = d.type;

    var env = _ws_env;
    for (var i = 0; i < val.length; i++) {
      var val2 = val[i];
      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }
      
      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;
      do_pack(manager, data, val2, val, fakeField, type2);
    }
  }

  static toJSON(manager, val, obj, field, type) {
    if (!val) {
      console.trace();
      console.log("Undefined array fed to struct struct packer!");
      console.log("Field: ", field);
      console.log("Type: ", type);
      console.log("");
      packer_debug("int 0");
      _module_exports_.pack_int(data, 0);
      return;
    }

    packer_debug("int " + val.length);

    var d = type.data;

    var itername = d.iname;
    var type2 = d.type;

    var env = _ws_env;
    var ret = [];

    for (var i = 0; i < val.length; i++) {
      var val2 = val[i];
      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;

      ret.push(toJSON(manager, val2, val, fakeField, type2));
    }

    return ret;
  }

  static packNull(manager, data, field, type) {
    pack_int$1(data, 0);
  }
  
  static format(type) {
    if (type.data.iname !== "" && type.data.iname != undefined) {
      return "array(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    }
    else {
      return "array(" + fmt_type(type.data.type) + ")";
    }
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }
  
  static unpack(manager, data, type, uctx) {
    var len = _module_exports_.unpack_int(data, uctx);
    packer_debug("-int " + len);

    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }
    
    return arr;
  }

  static readJSON(manager, data, owner, type) {
    let ret = [];
    let type2 = type.data.type;

    if (!data) {
      console.warn("Corrupted json data", owner);
      return [];
    }

    for (let item of data) {
      ret.push(fromJSON(manager, item, data, type2));
    }

    return ret;
  }

  static define() {return {
    type : StructEnum$1.T_ARRAY,
    name : "array"
  }}
}
StructFieldType.register(StructArrayField);

class StructIterField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    //this was originally implemented to use ES6 iterators.
    function forEach(cb, thisvar) {
      if (val && val[Symbol.iterator]) {
        for (let item of val) {
          cb.call(thisvar, item);
        }
      } else if (val && val.forEach) {
        val.forEach(function(item) {
          cb.call(thisvar, item);
        });
      } else {
        console.trace();
        console.log("Undefined iterable list fed to struct struct packer!", val);
        console.log("Field: ", field);
        console.log("Type: ", type);
        console.log("");
      }
    }
    
    let len = 0.0;
    forEach(() => {
      len++;
    });

    packer_debug("int " + len);
    _module_exports_.pack_int(data, len);

    var d = type.data, itername = d.iname, type2 = d.type;
    var env = _ws_env;

    var i = 0;
    forEach(function(val2) {
      if (i >= len) {
        if (warninglvl > 0) 
          console.trace("Warning: iterator returned different length of list!", val, i);
        return;
      }

      if (itername != "" && itername != undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;
      do_pack(manager, data, val2, val, fakeField, type2);

      i++;
    }, this);
  }

  static toJSON(manager, val, obj, field, type) {
    //this was originally implemented to use ES6 iterators.
    function forEach(cb, thisvar) {
      if (val && val[Symbol.iterator]) {
        for (let item of val) {
          cb.call(thisvar, item);
        }
      } else if (val && val.forEach) {
        val.forEach(function(item) {
          cb.call(thisvar, item);
        });
      } else {
        console.trace();
        console.log("Undefined iterable list fed to struct struct packer!", val);
        console.log("Field: ", field);
        console.log("Type: ", type);
        console.log("");
      }
    }

    let len = 0.0;
    let ret = [];

    forEach(() => {
      len++;
    });

    packer_debug("int " + len);

    var d = type.data, itername = d.iname, type2 = d.type;
    var env = _ws_env;

    var i = 0;
    forEach(function(val2) {
      if (i >= len) {
        if (warninglvl > 0)
          console.trace("Warning: iterator returned different length of list!", val, i);
        return;
      }

      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;
      ret.push(toJSON(manager, val2, val, fakeField, type2));

      i++;
    }, this);

    return ret;
  }

  static packNull(manager, data, field, type) {
    pack_int$1(data, 0);
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }
  
  static format(type) {
    if (type.data.iname != "" && type.data.iname != undefined) {
      return "iter(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    }
    else {
      return "iter(" + fmt_type(type.data.type) + ")";
    }
  }
  
  static unpack(manager, data, type, uctx) {
    var len = _module_exports_.unpack_int(data, uctx);
    packer_debug("-int " + len);

    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }

    return arr;
  }

  static readJSON(manager, data, owner, type) {
    let ret = [];
    let type2 = type.data.type;

    if (!data) {
      console.warn("Corrupted json data", owner);
      return [];
    }

    for (let item of data) {
      ret.push(fromJSON(manager, item, data, type2));
    }

    return ret;
  }

  static define() {return {
    type : StructEnum$1.T_ITER,
    name : "iter"
  }}
}
StructFieldType.register(StructIterField);

class StructShortField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_short(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_short(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_SHORT,
    name : "short"
  }}
}
StructFieldType.register(StructShortField);

class StructByteField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_byte$1(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_byte$1(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_BYTE,
    name : "byte"
  }}
}
StructFieldType.register(StructByteField);

class StructBoolField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_byte$1(data, !!val);
  }
  
  static unpack(manager, data, type, uctx) {
    return !!unpack_byte$1(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_BOOL,
    name : "bool"
  }}
}
StructFieldType.register(StructBoolField);

class StructIterKeysField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    //this was originally implemented to use ES6 iterators.
    if ((typeof val !== "object" && typeof val !== "function") || val === null) {
        console.warn("Bad object fed to iterkeys in struct packer!", val);
        console.log("Field: ", field);
        console.log("Type: ", type);
        console.log("");
        
        _module_exports_.pack_int(data, 0);
        
        packer_debug_end("iterkeys");
        return;
    }

    let len = 0.0;
    for (let k in val) {
      len++;
    }

    packer_debug("int " + len);
    _module_exports_.pack_int(data, len);

    var d = type.data, itername = d.iname, type2 = d.type;
    var env = _ws_env;

    var i = 0;
    for (let val2 in val) {
      if (i >= len) {
        if (warninglvl > 0) 
          console.warn("Warning: object keys magically replaced on us", val, i);
        return;
      }

      if (itername && itername.trim().length > 0 && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      } else {
        val2 = val[val2]; //fetch value
      }

      var f2 = {type: type2, get: undefined, set: undefined};
      do_pack(manager, data, val2, val, f2, type2);

      i++;
    }
  }

  static toJSON(manager, val, obj, field, type) {
    //this was originally implemented to use ES6 iterators.
    if ((typeof val !== "object" && typeof val !== "function") || val === null) {
      console.warn("Bad object fed to iterkeys in struct packer!", val);
      console.log("Field: ", field);
      console.log("Type: ", type);
      console.log("");

      _module_exports_.pack_int(data, 0);

      packer_debug_end("iterkeys");
      return;
    }

    let len = 0.0;
    for (let k in val) {
      len++;
    }

    packer_debug("int " + len);

    var d = type.data, itername = d.iname, type2 = d.type;
    var env = _ws_env;
    var ret = [];

    var i = 0;
    for (let val2 in val) {
      if (i >= len) {
        if (warninglvl > 0)
          console.warn("Warning: object keys magically replaced on us", val, i);
        return;
      }

      if (itername && itername.trim().length > 0 && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      } else {
        val2 = val[val2]; //fetch value
      }

      var f2 = {type: type2, get: undefined, set: undefined};
      ret.push(toJSON(manager, val2, val, f2, type2));

      i++;
    }

    return ret;
  }


  static packNull(manager, data, field, type) {
    pack_int$1(data, 0);
  }
  
  static useHelperJS(field) {
    return !field.type.data.iname;
  }

  static format(type) {
    if (type.data.iname != "" && type.data.iname != undefined) {
      return "iterkeys(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    }
    else {
      return "iterkeys(" + fmt_type(type.data.type) + ")";
    }
  }
  
  static unpack(manager, data, type, uctx) {
    var len = unpack_int$1(data, uctx);
    packer_debug("-int " + len);

    var arr = new Array(len);
    for (var i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }

    return arr;
  }

  static readJSON(manager, data, owner, type) {
    let ret = [];
    let type2 = type.data.type;

    if (!data) {
      console.warn("Corrupted json data", owner);
      return [];
    }

    for (let item of data) {
      ret.push(fromJSON(manager, item, data, type2));
    }

    return ret;
  }

  static define() {return {
    type : StructEnum$1.T_ITERKEYS,
    name : "iterkeys"
  }}
}
StructFieldType.register(StructIterKeysField);

class StructUintField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_uint$1(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_uint$1(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_UINT,
    name : "uint"
  }}
}
StructFieldType.register(StructUintField);


class StructUshortField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_ushort$1(data, val);
  }
  
  static unpack(manager, data, type, uctx) {
    return unpack_ushort$1(data, uctx);
  }   
  
  static define() {return {
    type : StructEnum$1.T_USHORT,
    name : "ushort"
  }}
}
StructFieldType.register(StructUshortField);

//let writeEmpty = exports.writeEmpty = function writeEmpty(stt) {
//}

class StructStaticArrayField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    if (type.data.size === undefined) {
      throw new Error("type.data.size was undefined");
    }
    
    let itername = type.data.iname;
    
    if (val === undefined || !val.length) {
      this.packNull(manager, data, field, type);
      return;
    }
    
    for (let i=0; i<type.data.size; i++) {
      let i2 = Math.min(i, Math.min(val.length-1, type.data.size));
      let val2 = val[i2];
      
      //*
      if (itername != "" && itername != undefined && field.get) {
        let env = _ws_env;
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }
      
      do_pack(manager, data, val2, val, field, type.data.type);
    }
  }

  static toJSON(manager, val, obj, field, type) {
    if (type.data.size === undefined) {
      throw new Error("type.data.size was undefined");
    }

    let itername = type.data.iname;

    if (val === undefined || !val.length) {;
      return [];
    }

    let ret = [];

    for (let i=0; i<type.data.size; i++) {
      let i2 = Math.min(i, Math.min(val.length-1, type.data.size));
      let val2 = val[i2];

      //*
      if (itername !== "" && itername !== undefined && field.get) {
        let env = _ws_env;
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      ret.push(toJSON(manager, val2, val, field, type.data.type));
    }

    return ret;
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }
  
  static packNull(manager, data, field, type) {
    let size = type.data.size;
    for (let i=0; i<size; i++) {
      packNull(manager, data, field, type.data.type);
    }
  }

  static format(type) {
    let type2 = _export_StructFieldTypeMap_[type.data.type.type].format(type.data.type);
    
    let ret = `static_array[${type2}, ${type.data.size}`;
    
    if (type.data.iname) {
      ret += `, ${type.data.iname}`;
    }
    ret += `]`;
    
    return ret;
  }
  
  static unpack(manager, data, type, uctx) {
    packer_debug("-size: " + type.data.size);
    
    let ret = [];
    
    for (let i=0; i<type.data.size; i++) {
      ret.push(unpack_field(manager, data, type.data.type, uctx));
    }
    
    return ret;
  }

  static readJSON(manager, data, owner, type) {
    let ret = [];
    let type2 = type.data.type;

    if (!data) {
      console.warn("Corrupted json data", owner);
      return [];
    }

    for (let item of data) {
      ret.push(fromJSON(manager, item, data, type2));
    }

    return ret;
  }

  static define() {return {
    type : StructEnum$1.T_STATIC_ARRAY,
    name : "static_array"
  }}
}
StructFieldType.register(StructStaticArrayField);

"use strict";
let StructFieldTypeMap$1 = _export_StructFieldTypeMap_;

let warninglvl$1 = 2;

const _module_exports_$1 = {};
function unmangle(name) {
  if (_module_exports_$1.truncateDollarSign) {
    return _export_truncateDollarSign_(name);
  } else {
    return name;
  }
}

/*

class SomeClass {
  static newSTRUCT() {
    //returns a new, empty instance of SomeClass
  }
  
  loadSTRUCT(reader) {
    reader(this); //reads data into this instance
  }
  
  //the old api, that both creates and reads
  static fromSTRUCT(reader) {
    let ret = new SomeClass();
    reader(ret);
    return ret;
  }
}
SomeClass.STRUCT = `
SomeClass {
}
`
nstructjs.register(SomeClass);

*/
let StructTypeMap$1 = StructTypeMap;
let StructTypes$1 = StructTypes;

let struct_parse = _export_struct_parse_;
let StructEnum$2 = StructEnum;

let _static_envcode_null$1 = "";
let debug_struct = 0;
let packdebug_tablevel$1 = 0;

//truncate webpack-mangled names
_module_exports_$1.truncateDollarSign = true;

function gen_tabstr$2(tot) {
  var ret = "";

  for (let i = 0; i < tot; i++) {
    ret += " ";
  }

  return ret;
}

let packer_debug$1, packer_debug_start$1, packer_debug_end$1;

if (debug_struct) {
  packer_debug$1 = function (msg) {
    if (msg !== undefined) {
      let t = gen_tabstr$2(packdebug_tablevel$1);
      console.log(t + msg);
    } else {
      console.log("Warning: undefined msg");
    }
  };
  packer_debug_start$1 = function (funcname) {
    packer_debug$1("Start " + funcname);
    packdebug_tablevel$1++;
  };

  packer_debug_end$1 = function (funcname) {
    packdebug_tablevel$1--;
    packer_debug$1("Leave " + funcname);
  };
}
else {
  packer_debug$1 = function () {
  };
  packer_debug_start$1 = function () {
  };
  packer_debug_end$1 = function () {
  };
}

_module_exports_$1.setWarningMode = (t) => {
  _export_setWarningMode_(t);
  
  if (typeof t !== "number" || isNaN(t)) {
    throw new Error("Expected a single number (>= 0) argument to setWarningMode");
  }

  warninglvl$1 = t;
};

_module_exports_$1.setDebugMode = (t) => {
  debug_struct = t;

  _export_setDebugMode_(t);
  
  if (debug_struct) {
    packer_debug$1 = function (msg) {
      if (msg != undefined) {
        let t = gen_tabstr$2(packdebug_tablevel$1);
        console.log(t + msg);
      } else {
        console.log("Warning: undefined msg");
      }
    };
    packer_debug_start$1 = function (funcname) {
      packer_debug$1("Start " + funcname);
      packdebug_tablevel$1++;
    };

    packer_debug_end$1 = function (funcname) {
      packdebug_tablevel$1--;
      packer_debug$1("Leave " + funcname);
    };
  }
  else {
    packer_debug$1 = function () {
    };
    packer_debug_start$1 = function () {
    };
    packer_debug_end$1 = function () {
    };
  }
};

let _ws_env$1 = [[undefined, undefined]];

function do_pack$1(data, val, obj, thestruct, field, type) {
  StructFieldTypeMap$1[field.type.type].pack(manager, data, val, obj, field, type);
}

function define_empty_class(name) {
  let cls = function () {
  };

  cls.prototype = Object.create(Object.prototype);
  cls.constructor = cls.prototype.constructor = cls;

  cls.STRUCT = name + " {\n  }\n";
  cls.structName = name;

  cls.prototype.loadSTRUCT = function (reader) {
    reader(this);
  };

  cls.newSTRUCT = function () {
    return new this();
  };

  return cls;
}

let STRUCT = _module_exports_$1.STRUCT = class STRUCT {
  constructor() {
    this.idgen = new IDGen();
    this.allowOverriding = true;

    this.structs = {};
    this.struct_cls = {};
    this.struct_ids = {};

    this.compiled_code = {};
    this.null_natives = {};

    function define_null_native(name, cls) {
      let obj = define_empty_class(name);

      let stt = struct_parse.parse(obj.STRUCT);

      stt.id = this.idgen.gen_id();

      this.structs[name] = stt;
      this.struct_cls[name] = cls;
      this.struct_ids[stt.id] = stt;

      this.null_natives[name] = 1;
    }

    define_null_native.call(this, "Object", Object);
  }

  validateStructs(onerror) {
    function getType(type) {
      switch (type.type) {
        case StructEnum$2.T_ITERKEYS:
        case StructEnum$2.T_ITER:
        case StructEnum$2.T_STATIC_ARRAY:
        case StructEnum$2.T_ARRAY:
          return getType(type.data.type);
        case StructEnum$2.T_TSTRUCT:
          return type;
        case StructEnum$2.T_STRUCT:
        default:
          return type;
      }
    }

    function formatType(type) {
      let ret = {};

      ret.type = type.type;

      if (typeof ret.type === "number") {
        for (let k in StructEnum$2) {
          if (StructEnum$2[k] === ret.type) {
            ret.type = k;
            break;
          }
        }
      } else if (typeof ret.type === "object") {
        ret.type = formatType(ret.type);
      }

      if (typeof type.data === "object") {
        ret.data = formatType(type.data);
      } else {
        ret.data = type.data;
      }

      return ret;
    }

    for (let k in this.structs) {
      let stt = this.structs[k];

      for (let field of stt.fields) {
        let type = getType(field.type);

        //console.log(formatType(type));

        if (type.type !== StructEnum$2.T_STRUCT && type.type !== StructEnum$2.T_TSTRUCT) {
          continue;
        }

        if (!(type.data in this.structs)) {

          let msg = stt.name + ":" + field.name + ": Unknown struct " + type.data + ".";
          let buf = STRUCT.formatStruct(stt);

          console.error(buf + "\n\n" + msg);

          if (onerror) {
            onerror(msg, stt, field);
          } else {
            throw new Error(msg);
          }
        }
        //console.log(formatType(field.type));
      }
    }
  }

  forEach(func, thisvar) {
    for (let k in this.structs) {
      let stt = this.structs[k];

      if (thisvar !== undefined)
        func.call(thisvar, stt);
      else
        func(stt);
    }
  }

  //defined_classes is an array of class constructors
  //with STRUCT scripts, *OR* another STRUCT instance
  //
  //defaults to structjs.manager
  parse_structs(buf, defined_classes) {
    if (defined_classes === undefined) {
      defined_classes = _module_exports_$1.manager;
    }

    if (defined_classes instanceof STRUCT) {
      let struct2 = defined_classes;
      defined_classes = [];

      for (let k in struct2.struct_cls) {
        defined_classes.push(struct2.struct_cls[k]);
      }
    }

    if (defined_classes === undefined) {
      defined_classes = [];

      for (let k in _module_exports_$1.manager.struct_cls) {
        defined_classes.push(_module_exports_$1.manager.struct_cls[k]);
      }
    }

    let clsmap = {};

    for (let i = 0; i < defined_classes.length; i++) {
      let cls = defined_classes[i];

      if (!cls.structName && cls.STRUCT) {
        let stt = struct_parse.parse(cls.STRUCT.trim());
        cls.structName = stt.name;
      } else if (!cls.structName && cls.name !== "Object") {
        if (warninglvl$1 > 0) 
          console.log("Warning, bad class in registered class list", unmangle(cls.name), cls);
        continue;
      }

      clsmap[cls.structName] = defined_classes[i];
    }

    struct_parse.input(buf);

    while (!struct_parse.at_end()) {
      let stt = struct_parse.parse(undefined, false);

      if (!(stt.name in clsmap)) {
        if (!(stt.name in this.null_natives))
        if (warninglvl$1 > 0) 
          console.log("WARNING: struct " + stt.name + " is missing from class list.");

        let dummy = define_empty_class(stt.name);

        dummy.STRUCT = STRUCT.fmt_struct(stt);
        dummy.structName = stt.name;

        dummy.prototype.structName = dummy.name;

        this.struct_cls[dummy.structName] = dummy;
        this.structs[dummy.structName] = stt;

        if (stt.id !== -1)
          this.struct_ids[stt.id] = stt;
      } else {
        this.struct_cls[stt.name] = clsmap[stt.name];
        this.structs[stt.name] = stt;

        if (stt.id !== -1)
          this.struct_ids[stt.id] = stt;
      }

      let tok = struct_parse.peek();
      while (tok && (tok.value === "\n" || tok.value === "\r" || tok.value === "\t" || tok.value === " ")) {
        tok = struct_parse.peek();
      }
    }
  }

  register(cls, structName) {
    return this.add_class(cls, structName);
  }

  add_class(cls, structName) {
    if (cls.STRUCT) {
      let bad = false;
      
      let p = cls;
      while (p) {
        p = p.__proto__;
        
        if (p && p.STRUCT && p.STRUCT === cls.STRUCT) {
          bad = true;
          break;
        }
      }
      
      if (bad) {
        console.warn("Generating STRUCT script for derived class " + unmangle(cls.name));
        if (!structName) {
          structName = unmangle(cls.name);
        }
        
        cls.STRUCT = STRUCT.inherit(cls, p) + `\n}`;
      }
    }
    
    if (!cls.STRUCT) {
      throw new Error("class " + unmangle(cls.name) + " has no STRUCT script");
    }

    let stt = struct_parse.parse(cls.STRUCT);

    stt.name = unmangle(stt.name);

    cls.structName = stt.name;

    //create default newSTRUCT
    if (cls.newSTRUCT === undefined) {
      cls.newSTRUCT = function () {
        return new this();
      };
    }

    if (structName !== undefined) {
      stt.name = cls.structName = structName;
    } else if (cls.structName === undefined) {
      cls.structName = stt.name;
    } else {
      stt.name = cls.structName;
    }

    if (cls.structName in this.structs) {
      console.warn("Struct " + unmangle(cls.structName) + " is already registered", cls);

      if (!this.allowOverriding) {
        throw new Error("Struct " + unmangle(cls.structName) + " is already registered");
      }

      return;
    }

    if (stt.id === -1)
      stt.id = this.idgen.gen_id();

    this.structs[cls.structName] = stt;
    this.struct_cls[cls.structName] = cls;
    this.struct_ids[stt.id] = stt;
  }

  get_struct_id(id) {
    return this.struct_ids[id];
  }

  get_struct(name) {
    if (!(name in this.structs)) {
      console.trace();
      throw new Error("Unknown struct " + name);
    }
    return this.structs[name];
  }

  get_struct_cls(name) {
    if (!(name in this.struct_cls)) {
      console.trace();
      throw new Error("Unknown struct " + name);
    }
    return this.struct_cls[name];
  }

  static inherit(child, parent, structName = child.name) {
    if (!parent.STRUCT) {
      return structName + "{\n";
    }

    let stt = struct_parse.parse(parent.STRUCT);
    let code = structName + "{\n";
    code += STRUCT.fmt_struct(stt, true);
    return code;
  }

  /** invoke loadSTRUCT methods on parent objects.  note that
   reader() is only called once.  it is called however.*/
  static Super(obj, reader) {
    if (warninglvl$1 > 0) 
      console.warn("deprecated");

    reader(obj);

    function reader2(obj) {
    }

    let cls = obj.constructor;
    let bad = cls === undefined || cls.prototype === undefined || cls.prototype.__proto__ === undefined;

    if (bad) {
      return;
    }

    let parent = cls.prototype.__proto__.constructor;
    bad = bad || parent === undefined;

    if (!bad && parent.prototype.loadSTRUCT && parent.prototype.loadSTRUCT !== obj.loadSTRUCT) { //parent.prototype.hasOwnProperty("loadSTRUCT")) {
      parent.prototype.loadSTRUCT.call(obj, reader2);
    }
  }

  /** deprecated.  used with old fromSTRUCT interface. */
  static chain_fromSTRUCT(cls, reader) {
    if (warninglvl$1 > 0) 
      console.warn("Using deprecated (and evil) chain_fromSTRUCT method, eek!");

    let proto = cls.prototype;
    let parent = cls.prototype.prototype.constructor;

    let obj = parent.fromSTRUCT(reader);
    let obj2 = new cls();

    let keys = Object.keys(obj).concat(Object.getOwnPropertySymbols(obj));
    //let keys=Object.keys(proto);

    for (let i = 0; i < keys.length; i++) {
      let k = keys[i];

      try {
        obj2[k] = obj[k];
      } catch (error) {
        if (warninglvl$1 > 0) 
          console.warn("  failed to set property", k);
      }
      //let k=keys[i];
      //if (k=="__proto__")
      // continue;
      //obj[k] = proto[k];
    }

    /*
    if (proto.toString !== Object.prototype.toString)
      obj2.toString = proto.toString;
    //*/

    return obj2;
  }

  static formatStruct(stt, internal_only, no_helper_js) {
    return this.fmt_struct(stt, internal_only, no_helper_js);
  }

  static fmt_struct(stt, internal_only, no_helper_js) {
    if (internal_only == undefined)
      internal_only = false;
    if (no_helper_js == undefined)
      no_helper_js = false;

    let s = "";
    if (!internal_only) {
      s += stt.name;
      if (stt.id != -1)
        s += " id=" + stt.id;
      s += " {\n";
    }
    let tab = "  ";

    function fmt_type(type) {
      return StructFieldTypeMap$1[type.type].format(type);
      
      if (type.type === StructEnum$2.T_ARRAY || type.type === StructEnum$2.T_ITER || type.type === StructEnum$2.T_ITERKEYS) {
        if (type.data.iname !== "" && type.data.iname !== undefined) {
          return "array(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
        }
        else {
          return "array(" + fmt_type(type.data.type) + ")";
        }
      } else if (type.type === StructEnum$2.T_STATIC_STRING) {
        return "static_string[" + type.data.maxlength + "]";
      } else if (type.type === StructEnum$2.T_STRUCT) {
        return type.data;
      } else if (type.type === StructEnum$2.T_TSTRUCT) {
        return "abstract(" + type.data + ")";
      } else {
        return StructTypeMap$1[type.type];
      }
    }

    let fields = stt.fields;
    for (let i = 0; i < fields.length; i++) {
      let f = fields[i];
      s += tab + f.name + " : " + fmt_type(f.type);
      if (!no_helper_js && f.get != undefined) {
        s += " | " + f.get.trim();
      }
      s += ";\n";
    }
    if (!internal_only)
      s += "}";
    return s;
  }

  _env_call(code, obj, env) {
    let envcode = _static_envcode_null$1;
    if (env !== undefined) {
      envcode = "";
      for (let i = 0; i < env.length; i++) {
        envcode = "var " + env[i][0] + " = env[" + i.toString() + "][1];\n" + envcode;
      }
    }
    let fullcode = "";
    if (envcode !== _static_envcode_null$1)
      fullcode = envcode + code;
    else
      fullcode = code;
    let func;

    //fullcode = fullcode.replace(/\bthis\b/, "obj");

    if (!(fullcode in this.compiled_code)) {
      let code2 = "func = function(obj, env) { " + envcode + "return " + code + "}";
      try {
        func = _structEval(code2);
      }
      catch (err) {
        _export_print_stack_(err);

        console.log(code2);
        console.log(" ");
        throw err;
      }
      this.compiled_code[fullcode] = func;
    }
    else {
      func = this.compiled_code[fullcode];
    }
    try {
      return func.call(obj, obj, env);
    }
    catch (err) {
      _export_print_stack_(err);

      let code2 = "func = function(obj, env) { " + envcode + "return " + code + "}";
      console.log(code2);
      console.log(" ");
      throw err;
    }
  }

  write_struct(data, obj, stt) {
    function use_helper_js(field) {
      let type = field.type.type;
      let cls = StructFieldTypeMap$1[type];
      return cls.useHelperJS(field);
    }

    var fields = stt.fields;
    var thestruct = this;
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var t1 = f.type;
      var t2 = t1.type;

      if (use_helper_js(f)) {
        var val;
        var type = t2;
        if (f.get != undefined) {
          val = thestruct._env_call(f.get, obj);
        }
        else {
          val = obj[f.name];
        }
        
        if (_nGlobal.DEBUG && _nGlobal.DEBUG.tinyeval) { 
          console.log("\n\n\n", f.get, "Helper JS Ret", val, "\n\n\n");
        }

        do_pack$1(data, val, obj, thestruct, f, t1);
      }
      else {
        var val = obj[f.name];
        do_pack$1(data, val, obj, thestruct, f, t1);
      }
    }
  }

  /**
  @param data : array to write data into,
  @param obj  : structable object
  */
  write_object(data, obj) {
    var cls = obj.constructor.structName;
    var stt = this.get_struct(cls);

    if (data === undefined) {
      data = [];
    }

    this.write_struct(data, obj, stt);
    return data;
  }

  /**
  Read an object from binary data
  
  @param data : DataView or Uint8Array instance
  @param cls_or_struct_id : Structable class
  @param uctx : internal parameter
  @return {cls_or_struct_id} Instance of cls_or_struct_id
  */
  readObject(data, cls_or_struct_id, uctx) {
    return this.read_object(data, cls_or_struct_id, uctx);
  }
  
  /**
  @param data array to write data into,
  @param obj structable object
  */
  writeObject(data, obj) {
    return this.write_object(data, obj);
  }

  writeJSON(obj, stt=undefined) {
    var cls = obj.constructor.structName;
    stt = stt || this.get_struct(cls);

    function use_helper_js(field) {
      let type = field.type.type;
      let cls = StructFieldTypeMap$1[type];
      return cls.useHelperJS(field);
    }

    let toJSON$1 = toJSON;

    var fields = stt.fields;
    var thestruct = this;
    let json = {};

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var t1 = f.type;
      var t2 = t1.type;
      var val;

      if (use_helper_js(f)) {
        var type = t2;
        if (f.get !== undefined) {
          val = thestruct._env_call(f.get, obj);
        }
        else {
          val = obj[f.name];
        }

        if (_nGlobal.DEBUG && _nGlobal.DEBUG.tinyeval) {
          console.log("\n\n\n", f.get, "Helper JS Ret", val, "\n\n\n");
        }

        json[f.name] = toJSON$1(this, val, obj, f, t1);
      }
      else {
        val = obj[f.name];
        json[f.name] = toJSON$1(this, val, obj, f, t1);
      }
    }

    return json;
  }

  /**
  @param data : DataView or Uint8Array instance
  @param cls_or_struct_id : Structable class
  @param uctx : internal parameter
  */
  read_object(data, cls_or_struct_id, uctx) {
    let cls, stt;

    if (data instanceof Array) {
      data = new DataView(new Uint8Array(data).buffer);
    }

    if (typeof cls_or_struct_id == "number") {
      cls = this.struct_cls[this.struct_ids[cls_or_struct_id].name];
    } else {
      cls = cls_or_struct_id;
    }

    if (cls === undefined) {
      throw new Error("bad cls_or_struct_id " + cls_or_struct_id);
    }

    stt = this.structs[cls.structName];

    if (uctx == undefined) {
      uctx = new _module_exports_.unpack_context();

      packer_debug$1("\n\n=Begin reading " + cls.structName + "=");
    }
    let thestruct = this;

    let this2  = this;
    function unpack_field(type) {
      return StructFieldTypeMap$1[type.type].unpack(this2, data, type, uctx);
    }

    let was_run = false;

    function load(obj) {
      if (was_run) {
        return;
      }

      was_run = true;

      let fields = stt.fields;
      let flen = fields.length;
      for (let i = 0; i < flen; i++) {
        let f = fields[i];
        let val = unpack_field(f.type);
        obj[f.name] = val;
      }
    }

    if (cls.prototype.loadSTRUCT !== undefined) {
      let obj;

      if (cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT();
      } else {
        obj = new cls();
      }

      obj.loadSTRUCT(load);
      return obj;
    } else if (cls.fromSTRUCT !== undefined) {
      if (warninglvl$1 > 1) 
        console.warn("Warning: class " + unmangle(cls.name) + " is using deprecated fromSTRUCT interface; use newSTRUCT/loadSTRUCT instead");
      return cls.fromSTRUCT(load);
    } else { //default case, make new instance and then call load() on it
      let obj;
      if (cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT();
      } else {
        obj = new cls();
      }

      load(obj);

      return obj;
    }
  }

  readJSON(data, cls_or_struct_id) {
    let cls, stt;

    if (typeof cls_or_struct_id === "number") {
      cls = this.struct_cls[this.struct_ids[cls_or_struct_id].name];
    } else {
      cls = cls_or_struct_id;
    }

    if (cls === undefined) {
      throw new Error("bad cls_or_struct_id " + cls_or_struct_id);
    }

    stt = this.structs[cls.structName];

    let fromJSON$1 = fromJSON;
    let thestruct = this;

    let this2  = this;

    let was_run = false;

    function reader(obj) {
      if (was_run) {
        return;
      }

      was_run = true;

      let fields = stt.fields;
      let flen = fields.length;
      for (let i = 0; i < flen; i++) {
        let f = fields[i];

        packer_debug$1("Load field " + f.name);
        obj[f.name] = fromJSON$1(thestruct, data[f.name], data, f.type);
      }
    }

    if (cls.prototype.loadSTRUCT !== undefined) {
      let obj;

      if (cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT();
      } else {
        obj = new cls();
      }

      obj.loadSTRUCT(reader);

      return obj;
    } else if (cls.fromSTRUCT !== undefined) {
      if (warninglvl$1 > 1)
        console.warn("Warning: class " + unmangle(cls.name) + " is using deprecated fromSTRUCT interface; use newSTRUCT/loadSTRUCT instead");

      return cls.fromSTRUCT(reader);
    } else { //default case, make new instance and then call reader() on it
      let obj;
      if (cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT();
      } else {
        obj = new cls();
      }

      reader(obj);

      return obj;
    }
  }
};

//main struct script manager
let manager = _module_exports_$1.manager = new STRUCT();

/**
 * Write all defined structs out to a string.
 *
 * @param manager STRUCT instance, defaults to nstructjs.manager
 * @param include_code include save code snippets
 * */
let write_scripts = _module_exports_$1.write_scripts = function write_scripts(manager, include_code = false) {
  if (manager === undefined)
    manager = _module_exports_$1.manager;

  let buf = "";

  manager.forEach(function (stt) {
    buf += STRUCT.fmt_struct(stt, false, !include_code) + "\n";
  });

  let buf2 = buf;
  buf = "";

  for (let i = 0; i < buf2.length; i++) {
    let c = buf2[i];
    if (c === "\n") {
      buf += "\n";
      let i2 = i;
      while (i < buf2.length && (buf2[i] === " " || buf2[i] === "\t" || buf2[i] === "\n")) {
        i++;
      }
      if (i !== i2)
        i--;
    }
    else {
      buf += c;
    }
  }

  return buf;
};

"use strict";

if (typeof btoa === "undefined") {
  _nGlobal.btoa = function btoa(str) {
    let buffer = new Buffer("" + str, 'binary');
    return buffer.toString('base64');
  };

  _nGlobal.atob = function atob(str) {
    return new Buffer(str, 'base64').toString('binary');
  };
}

/*
file format:
  magic signature              : 4 bytes
  file version major           : 2 bytes
  file version minor           : 1 bytes
  file version micro           : 1 bytes
  length of struct scripts     : 4 bytes
  struct scripts for this file : ...
  
  block:
    magic signature for block              : 4 bytes
    length of data  (not including header) : 4 bytes
    id of struct type                      : 4 bytes
    
    data                                   : ...
*/

const _export_versionToInt_ = function(v) {
  v = _export_versionCoerce_(v);
  let mul = 64;
  return ~~(v.major*mul*mul*mul + v.minor*mul*mul + v.micro*mul);
};

let ver_pat = /[0-9]+\.[0-9]+\.[0-9]+$/;

const _export_versionCoerce_ = function(v) {
  if (!v) {
    throw new Error("empty version: " + v);
  }

  if (typeof v === "string") {
    if (!ver_pat.exec(v)) {
      throw new Error("invalid version string " + v);
    }

    let ver = v.split(".");
    return {
      major : parseInt(ver[0]),
      minor : parseInt(ver[1]),
      micro : parseInt(ver[2])
    }
  } else if (Array.isArray(v)) {
    return {
      major : v[0],
      minor : v[1],
      micro : v[2]
    }
  } else if (typeof v === "object") {
    let test = (k) => k in v && typeof v[k] === "number";

    if (!test("major") || !test("minor") || !test("micro")) {
      throw new Error("invalid version object: " + v);
    }

    return v;
  } else {
    throw new Error("invalid version " + v);
  }
};

const _export_versionLessThan_ = function(a, b) {
  return _export_versionToInt_(a) < _export_versionToInt_(b);
};

let versionLessThan = _export_versionLessThan_;

let FileParams = class FileParams {
  constructor() {
    this.magic = "STRT";
    this.ext = ".bin";
    this.blocktypes = ["DATA"];

    this.version = {
      major: 0,
      minor: 0,
      micro: 1
    };
  }
};

//used to define blocks
let Block = class Block {
  constructor(type_magic, data) {
    this.type = type_magic;
    this.data = data;
  }
};

let FileError = class FileeError extends Error {
};

let FileHelper = class FileHelper {
  //params can be FileParams instance, or object literal
  //(it will convert to FileParams)
  constructor(params) {
    if (params === undefined) {
      params = new FileParams();
    } else {
      let fp = new FileParams();

      for (let k in params) {
        fp[k] = params[k];
      }
      params = fp;
    }

    this.version = params.version;
    this.blocktypes = params.blocktypes;
    this.magic = params.magic;
    this.ext = params.ext;
    this.struct = undefined;
    this.unpack_ctx = undefined;
  }

  read(dataview) {
    this.unpack_ctx = new _module_exports_.unpack_context();

    let magic = _module_exports_.unpack_static_string(dataview, this.unpack_ctx, 4);

    if (magic !== this.magic) {
      throw new FileError("corrupted file");
    }

    this.version = {};
    this.version.major = _module_exports_.unpack_short(dataview, this.unpack_ctx);
    this.version.minor = _module_exports_.unpack_byte(dataview, this.unpack_ctx);
    this.version.micro = _module_exports_.unpack_byte(dataview, this.unpack_ctx);

    let struct = this.struct = new _module_exports_$1.STRUCT();

    let scripts = _module_exports_.unpack_string(dataview, this.unpack_ctx);
    this.struct.parse_structs(scripts, _module_exports_$1.manager);

    let blocks = [];
    let dviewlen = dataview.buffer.byteLength;

    while (this.unpack_ctx.i < dviewlen) {
      //console.log("reading block. . .", this.unpack_ctx.i, dviewlen);

      let type = _module_exports_.unpack_static_string(dataview, this.unpack_ctx, 4);
      let datalen = _module_exports_.unpack_int(dataview, this.unpack_ctx);
      let bstruct = _module_exports_.unpack_int(dataview, this.unpack_ctx);
      let bdata;

      //console.log(type, datalen, bstruct);

      if (bstruct == -2) { //string data, e.g. JSON
        bdata = _module_exports_.unpack_static_string(dataview, this.unpack_ctx, datalen);
      } else {
        bdata = _module_exports_.unpack_bytes(dataview, this.unpack_ctx, datalen);
        bdata = struct.read_object(bdata, bstruct, new _module_exports_.unpack_context());
      }

      let block = new Block();
      block.type = type;
      block.data = bdata;

      blocks.push(block);
    }

    this.blocks = blocks;
    return blocks;
  }

  doVersions(old) {
    let blocks = this.blocks;

    if (versionLessThan(old, "0.0.1")) {
      //do something
    }
  }

  write(blocks) {
    this.struct = _module_exports_$1.manager;
    this.blocks = blocks;

    let data = [];

    _module_exports_.pack_static_string(data, this.magic, 4);
    _module_exports_.pack_short(data, this.version.major);
    _module_exports_.pack_byte(data, this.version.minor & 255);
    _module_exports_.pack_byte(data, this.version.micro & 255);

    let scripts = _module_exports_$1.write_scripts();
    _module_exports_.pack_string(data, scripts);

    let struct = this.struct;

    for (let block of blocks) {
      if (typeof block.data === "string") { //string data, e.g. JSON
        _module_exports_.pack_static_string(data, block.type, 4);
        _module_exports_.pack_int(data, block.data.length);
        _module_exports_.pack_int(data, -2); //flag as string data
        _module_exports_.pack_static_string(data, block.data, block.data.length);
        continue;
      }

      let structName = block.data.constructor.structName;
      if (structName === undefined || !(structName in struct.structs)) {
        throw new Error("Non-STRUCTable object " + block.data);
      }

      let data2 = [];
      let stt = struct.structs[structName];

      struct.write_object(data2, block.data);

      _module_exports_.pack_static_string(data, block.type, 4);
      _module_exports_.pack_int(data, data2.length);
      _module_exports_.pack_int(data, stt.id);

      _module_exports_.pack_bytes(data, data2);
    }

    return new DataView(new Uint8Array(data).buffer);
  }

  writeBase64(blocks) {
    let dataview = this.write(blocks);

    let str = "";
    let bytes = new Uint8Array(dataview.buffer);

    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }

    return btoa(str);
  }

  makeBlock(type, data) {
    return new Block(type, data);
  }

  readBase64(base64) {
    let data = atob(base64);
    let data2 = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      data2[i] = data.charCodeAt(i);
    }

    return this.read(new DataView(data2.buffer));
  }
};

var struct_filehelper = /*#__PURE__*/Object.freeze({
  __proto__: null,
  versionToInt: _export_versionToInt_,
  versionCoerce: _export_versionCoerce_,
  versionLessThan: _export_versionLessThan_,
  FileParams: FileParams,
  Block: Block,
  FileError: FileError,
  FileHelper: FileHelper
});

var struct_typesystem = /*#__PURE__*/Object.freeze({
  __proto__: null
});

if (typeof window !== "undefined") {
  window._nGlobal = window;
} else if (typeof self !== "undefined") {
  self._nGlobal = self;
} else {
  global._nGlobal = global;
}

_nGlobal._structEval = eval;

const _module_exports_$2 = {};
_module_exports_$2.unpack_context = _module_exports_.unpack_context;

/**
true means little endian, false means big endian
*/
Object.defineProperty(_module_exports_$2, "STRUCT_ENDIAN", {
  get: function () {
    return _module_exports_.STRUCT_ENDIAN;
  },
  set: function (val) {
    _module_exports_.STRUCT_ENDIAN = val;
  }
});

for (let k in _module_exports_$1) {
  _module_exports_$2[k] = _module_exports_$1[k];
}

var StructTypeMap$2 = StructTypeMap;
var StructTypes$2 = StructTypes;
var Class = undefined;

//forward struct_intern's exports
for (var k$1 in _module_exports_$1) {
  _module_exports_$2[k$1] = _module_exports_$1[k$1];
}

/** truncate webpack mangled names. defaults to true
 *  so Mesh$1 turns into Mesh */
_module_exports_$2.truncateDollarSign = function(value=true) {
  _module_exports_$1.truncateDollarSign = !!value;
};

_module_exports_$2.validateStructs = function validateStructs(onerror) {
  return _module_exports_$2.manager.validateStructs(onerror);
};

_module_exports_$2.setAllowOverriding = function setAllowOverriding(t) {
  return _module_exports_$2.manager.allowOverriding = !!t;
};

/** Register a class with nstructjs **/
_module_exports_$2.register = function register(cls, structName) {
  return _module_exports_$2.manager.register(cls, structName);
};
_module_exports_$2.inherit = function (child, parent, structName = child.name) {
  return _module_exports_$2.STRUCT.inherit(...arguments);
};

/**
@param data : DataView
*/
_module_exports_$2.readObject = function(data, cls, __uctx=undefined) {
  return _module_exports_$2.manager.readObject(data, cls, __uctx);
};

/**
@param data : Array instance to write bytes to
*/
_module_exports_$2.writeObject = function(data, obj) {
  return _module_exports_$2.manager.writeObject(data, obj);
};

_module_exports_$2.writeJSON = function(obj) {
  return _module_exports_$2.manager.writeJSON(obj);
};

_module_exports_$2.readJSON = function(json, class_or_struct_id) {
  return _module_exports_$2.manager.readJSON(json, class_or_struct_id);
};

_module_exports_$2.setDebugMode = _module_exports_$1.setDebugMode;
_module_exports_$2.setWarningMode = _module_exports_$1.setWarningMode;

/*
import * as _require___$tinyeval$tinyeval_js_ from "../tinyeval/tinyeval.js";
_module_exports_.tinyeval = _require___$tinyeval$tinyeval_js_;

_module_exports_.useTinyEval = function() {
  _nGlobal._structEval = (buf) => {
    return _module_exports_.tinyeval.eval(buf, _nGlobal);
  }
};
*/
   _module_exports_$2.useTinyEval = () => {};


//export other modules
_module_exports_$2.binpack = _module_exports_;
_module_exports_$2.util = struct_util;
_module_exports_$2.typesystem = struct_typesystem;
_module_exports_$2.parseutil = struct_parseutil;
_module_exports_$2.parser = struct_parser;
_module_exports_$2.filehelper = struct_filehelper;

module.exports = _module_exports_$2;
{
  let glob = !((typeof window === "undefined" && typeof self === "undefined") && typeof global !== "undefined");

  //try to detect nodejs in es6 module mode
  glob = glob || (typeof global !== "undefined" && typeof global.require === "undefined");


  if (glob) {
    //not nodejs?
    _nGlobal.nstructjs = module.exports;
    _nGlobal.module = undefined;
  }
}
  return module.exports;
})();

if (typeof window === "undefined" && typeof global !== "undefined" && typeof module !== "undefined") {
  console.log("Nodejs!", nexports);
  module.exports = exports = nexports;
}
