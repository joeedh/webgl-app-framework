"use strict";
/*
The lexical scanner in this module was inspired by PyPLY

http://www.dabeaz.com/ply/ply.html
*/

class token {
  constructor(type, val, lexpos, lineno, lexer, parser) {
    this.type = type;
    this.value = val;
    this.lexpos = lexpos;
    this.lineno = lineno;
    this.lexer = lexer;
    this.parser = parser;
  }

  toString() {
    if (this.value !== undefined)
      return "token(type=" + this.type + ", value='" + this.value + "')";
    else
      return "token(type=" + this.type + ")";
  }
}

class tokdef {
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
}

class PUTIL_ParseError extends Error {
  constructor(msg) {
    super();
  }
}

class lexer {
  constructor(tokdef, errfunc) {
    this.tokdef = tokdef;
    this.tokens = new Array();
    this.lexpos = 0;
    this.lexdata = "";
    this.lineno = 0;
    this.errfunc = errfunc;
    this.tokints = {};
    for (let i = 0; i < tokdef.length; i++) {
      this.tokints[tokdef[i].name] = i;
    }
    this.statestack = [["__main__", 0]];
    this.states = {"__main__": [tokdef, errfunc]};
    this.statedata = 0;
  }

  add_state(name, tokdef, errfunc) {
    if (errfunc === undefined) {
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
    let item = this.statestack[this.statestack.length - 1];
    let state = this.states[item[0]];
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
    if (this.errfunc !== undefined && !this.errfunc(this))
      return;

    console.log("Syntax error near line " + this.lineno);

    let next = Math.min(this.lexpos + 8, this.lexdata.length);
    console.log("  " + this.lexdata.slice(this.lexpos, next));

    throw new PUTIL_ParseError("Parse error");
  }

  peek() {
    let tok = this.next(true);
    if (tok === undefined)
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
    return this.lexpos >= this.lexdata.length && this.peeked_tokens.length === 0;
  }

  //ignore_peek is optional, false
  next(ignore_peek) {
    if (!ignore_peek && this.peeked_tokens.length > 0) {
      let tok = this.peeked_tokens[0];
      this.peeked_tokens.shift();
      return tok;
    }

    if (this.lexpos >= this.lexdata.length)
      return undefined;

    let ts = this.tokdef;
    let tlen = ts.length;
    let lexdata = this.lexdata.slice(this.lexpos, this.lexdata.length);
    let results = [];

    for (var i = 0; i < tlen; i++) {
      let t = ts[i];
      if (t.re === undefined)
        continue;
      let res = t.re.exec(lexdata);
      if (res !== null && res !== undefined && res.index === 0) {
        results.push([t, res]);
      }
    }

    let max_res = 0;
    let theres = undefined;
    for (var i = 0; i < results.length; i++) {
      let res = results[i];
      if (res[1][0].length > max_res) {
        theres = res;
        max_res = res[1][0].length;
      }
    }

    if (theres === undefined) {
      this.error();
      return;
    }

    let def = theres[0];
    let tok = new token(def.name, theres[1][0], this.lexpos, this.lineno, this, undefined);
    this.lexpos += tok.value.length;

    if (def.func) {
      tok = def.func(tok);
      if (tok === undefined) {
        return this.next();
      }
    }

    return tok;
  }
}

class parser {
  constructor(lexer, errfunc) {
    this.lexer = lexer;
    this.errfunc = errfunc;
    this.start = undefined;
  }

  parse(data, err_on_unconsumed) {
    if (err_on_unconsumed === undefined)
      err_on_unconsumed = true;

    if (data !== undefined)
      this.lexer.input(data);

    let ret = this.start(this);

    if (err_on_unconsumed && !this.lexer.at_end() && this.lexer.next() !== undefined) {
      this.error(undefined, "parser did not consume entire input");
    }
    return ret;
  }

  input(data) {
    this.lexer.input(data);
  }

  error(token, msg) {
    let estr;

    if (msg === undefined)
      msg = "";
    if (token === undefined)
      estr = "Parse error at end of input: " + msg;
    else
      estr = "Parse error at line " + (token.lineno + 1) + ": " + msg;

    let buf = "1| ";
    let ld = this.lexer.lexdata;
    let l = 1;
    for (var i = 0; i < ld.length; i++) {
      let c = ld[i];
      if (c === '\n') {
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
    let tok = this.lexer.peek();
    if (tok !== undefined)
      tok.parser = this;
    return tok;
  }

  peeknext() {
    let tok = this.lexer.peeknext();
    if (tok !== undefined)
      tok.parser = this;
    return tok;
  }

  next() {
    let tok = this.lexer.next();
    if (tok !== undefined)
      tok.parser = this;
    return tok;
  }

  optional(type) {
    let tok = this.peek();
    if (tok === undefined)
      return false;
    if (tok.type === type) {
      this.next();
      return true;
    }
    return false;
  }

  at_end() {
    return this.lexer.at_end();
  }

  expect(type, msg) {
    let tok = this.next();
    
    if (msg === undefined) {
      msg = type;
      
      for (let tk of this.lexer.tokdef) {
        if (tk.name === type && tk.example) {
          msg = tk.example;
        }
      }
    }
    
    if (tok === undefined || tok.type !== type) {
      this.error(tok, "Expected " + msg);
    }
    return tok.value;
  }
}

function test_parser() {
  let basic_types = new set(["int", "float", "double", "vec2", "vec3", "vec4", "mat4", "string"]);
  let reserved_tokens = new set(["int", "float", "double", "vec2", "vec3", "vec4", "mat4", "string", "static_string", "array"]);

  function tk(name, re, func) {
    return new tokdef(name, re, func);
  }

  let tokens = [tk("ID", /[a-zA-Z]+[a-zA-Z0-9_]*/, function (t) {
    if (reserved_tokens.has(t.value)) {
      t.type = t.value.toUpperCase();
    }
    return t;
  }), tk("OPEN", /\{/), tk("CLOSE", /}/), tk("COLON", /:/), tk("JSCRIPT", /\|/, function (t) {
    let js = "";
    let lexer = t.lexer;
    while (lexer.lexpos < lexer.lexdata.length) {
      let c = lexer.lexdata[lexer.lexpos];
      if (c === "\n")
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
  let __iter_rt = __get_iter(reserved_tokens);
  let rt;
  while (1) {
    let __ival_rt = __iter_rt.next();
    if (__ival_rt.done) {
      break;
    }
    rt = __ival_rt.value;
    tokens.push(tk(rt.toUpperCase()));
  }
  let a = "\n  Loop {\n    eid : int;\n    flag : int;\n    index : int;\n    type : int;\n\n    co : vec3;\n    no : vec3;\n    loop : int | eid(loop);\n    edges : array(e, int) | e.eid;\n\n    loops : array(Loop);\n  }\n  ";

  function errfunc(lexer) {
    return true;
  }

  let lex = new lexer(tokens, errfunc);
  console.log("Testing lexical scanner...");
  lex.input(a);
  let token;
  while (token = lex.next()) {
    console.log(token.toString());
  }
  let parser = new parser(lex);
  parser.input(a);

  function p_Array(p) {
    p.expect("ARRAY");
    p.expect("LPARAM");
    let arraytype = p_Type(p);
    let itername = "";
    if (p.optional("COMMA")) {
      itername = arraytype;
      arraytype = p_Type(p);
    }
    p.expect("RPARAM");
    return {type: "array", data: {type: arraytype, iname: itername}}
  }

  function p_Type(p) {
    let tok = p.peek();
    if (tok.type === "ID") {
      p.next();
      return {type: "struct", data: "\"" + tok.value + "\""}
    }
    else if (basic_types.has(tok.type.toLowerCase())) {
      p.next();
      return {type: tok.type.toLowerCase()}
    }
    else if (tok.type === "ARRAY") {
      return p_Array(p);
    }
    else {
      p.error(tok, "invalid type " + tok.type);
    }
  }

  function p_Field(p) {
    let field = {};
    console.log("-----", p.peek().type);
    field.name = p.expect("ID", "struct field name");
    p.expect("COLON");
    field.type = p_Type(p);
    field.set = undefined;
    field.get = undefined;
    let tok = p.peek();
    if (tok.type === "JSCRIPT") {
      field.get = tok.value;
      p.next();
    }
    tok = p.peek();
    if (tok.type === "JSCRIPT") {
      field.set = tok.value;
      p.next();
    }
    p.expect("SEMI");
    return field;
  }

  function p_Struct(p) {
    let st = {};
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

  let ret = p_Struct(parser);
  console.log(JSON.stringify(ret));
}

var struct_parseutil = /*#__PURE__*/Object.freeze({
  __proto__: null,
  token: token,
  tokdef: tokdef,
  PUTIL_ParseError: PUTIL_ParseError,
  lexer: lexer,
  parser: parser
});

"use strict";

class NStruct {
  constructor(name) {
    this.fields = [];
    this.id = -1;
    this.name = name;
  }
}

//the discontinuous id's are to make sure
//the version I originally wrote (which had a few application-specific types)
//and this one do not become totally incompatible.
const StructEnum = {
  T_INT          : 0,
  T_FLOAT        : 1,
  T_DOUBLE       : 2,
  T_STRING       : 7,
  T_STATIC_STRING: 8, //fixed-length string
  T_STRUCT       : 9,
  T_TSTRUCT      : 10,
  T_ARRAY        : 11,
  T_ITER         : 12,
  T_SHORT        : 13,
  T_BYTE         : 14,
  T_BOOL         : 15,
  T_ITERKEYS     : 16,
  T_UINT         : 17,
  T_USHORT       : 18,
  T_STATIC_ARRAY : 19,
  T_SIGNED_BYTE  : 20
};

const ValueTypes = new Set([
  StructEnum.T_INT,
  StructEnum.T_FLOAT,
  StructEnum.T_DOUBLE,
  StructEnum.T_STRING,
  StructEnum.T_STATIC_STRING,
  StructEnum.T_SHORT,
  StructEnum.T_BYTE,
  StructEnum.T_BOOL,
  StructEnum.T_UINT,
  StructEnum.T_USHORT,
  StructEnum.T_SIGNED_BYTE

]);

let StructTypes = {
  "int"          : StructEnum.T_INT,
  "uint"         : StructEnum.T_UINT,
  "ushort"       : StructEnum.T_USHORT,
  "float"        : StructEnum.T_FLOAT,
  "double"       : StructEnum.T_DOUBLE,
  "string"       : StructEnum.T_STRING,
  "static_string": StructEnum.T_STATIC_STRING,
  "struct"       : StructEnum.T_STRUCT,
  "abstract"     : StructEnum.T_TSTRUCT,
  "array"        : StructEnum.T_ARRAY,
  "iter"         : StructEnum.T_ITER,
  "short"        : StructEnum.T_SHORT,
  "byte"         : StructEnum.T_BYTE,
  "bool"         : StructEnum.T_BOOL,
  "iterkeys"     : StructEnum.T_ITERKEYS,
  "sbyte"        : StructEnum.T_SIGNED_BYTE
};

let StructTypeMap = {};

for (let k in StructTypes) {
  StructTypeMap[StructTypes[k]] = k;
}

function gen_tabstr(t) {
  let s = "";
  for (let i = 0; i < t; i++) {
    s += "  ";
  }
  return s;
}

function StructParser() {
  let basic_types = new Set([
    "int", "float", "double", "string", "short", "byte", "sbyte", "bool", "uint", "ushort"
  ]);

  let reserved_tokens = new Set([
    "int", "float", "double", "string", "static_string", "array",
    "iter", "abstract", "short", "byte", "sbyte", "bool", "iterkeys", "uint", "ushort",
    "static_array"
  ]);

  function tk(name, re, func) {
    return new tokdef(name, re, func);
  }

  let tokens = [
    tk("ID", /[a-zA-Z_$]+[a-zA-Z0-9_\.$]*/, function (t) {

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
    tk("JSCRIPT", /\|/, function (t) {
      let js = "";
      let lexer = t.lexer;
      while (lexer.lexpos < lexer.lexdata.length) {
        let c = lexer.lexdata[lexer.lexpos];
        if (c === "\n")
          break;
        js += c;
        lexer.lexpos++;
      }

      while (js.trim().endsWith(";")) {
        js = js.slice(0, js.length - 1);
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
    tk("NEWLINE", /\n/, function (t) {
      t.lexer.lineno += 1;
    }, "newline"),
    tk("SPACE", / |\t/, function (t) {
    }, "whitespace")
  ];

  reserved_tokens.forEach(function (rt) {
    tokens.push(tk(rt.toUpperCase()));
  });

  function errfunc(lexer) {
    return true;
  }

  let lex = new lexer(tokens, errfunc);
  let parser$1 = new parser(lex);

  function p_Static_String(p) {
    p.expect("STATIC_STRING");
    p.expect("SOPEN");
    let num = p.expect("NUM");
    p.expect("SCLOSE");
    return {type: StructEnum.T_STATIC_STRING, data: {maxlength: num}}
  }

  function p_DataRef(p) {
    p.expect("DATAREF");
    p.expect("LPARAM");
    let tname = p.expect("ID");
    p.expect("RPARAM");
    return {type: StructEnum.T_DATAREF, data: tname}
  }

  function p_Array(p) {
    p.expect("ARRAY");
    p.expect("LPARAM");
    let arraytype = p_Type(p);

    let itername = "";
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

    let arraytype = p_Type(p);
    let itername = "";

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
    let arraytype = p_Type(p);
    let itername = "";

    p.expect("COMMA");
    let size = p.expect("NUM");

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

    let arraytype = p_Type(p);
    let itername = "";

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
    let type = p.expect("ID");
    p.expect("RPARAM");
    return {type: StructEnum.T_TSTRUCT, data: type}
  }

  function p_Type(p) {
    let tok = p.peek();

    if (tok.type === "ID") {
      p.next();
      return {type: StructEnum.T_STRUCT, data: tok.value}
    } else if (basic_types.has(tok.type.toLowerCase())) {
      p.next();
      return {type: StructTypes[tok.type.toLowerCase()]}
    } else if (tok.type === "ARRAY") {
      return p_Array(p);
    } else if (tok.type === "ITER") {
      return p_Iter(p);
    } else if (tok.type === "ITERKEYS") {
      return p_IterKeys(p);
    } else if (tok.type === "STATIC_ARRAY") {
      return p_StaticArray(p);
    } else if (tok.type === "STATIC_STRING") {
      return p_Static_String(p);
    } else if (tok.type === "ABSTRACT") {
      return p_Abstract(p);
    } else if (tok.type === "DATAREF") {
      return p_DataRef(p);
    } else {
      p.error(tok, "invalid type " + tok.type);
    }
  }

  function p_ID_or_num(p) {
    let t = p.peeknext();

    if (t.type === "NUM") {
      p.next();
      return t.value;
    } else {
      return p.expect("ID", "struct field name");
    }
  }

  function p_Field(p) {
    let field = {};

    field.name = p_ID_or_num(p);
    p.expect("COLON");

    field.type = p_Type(p);
    field.set = undefined;
    field.get = undefined;

    let check = 0;

    let tok = p.peek();
    if (tok.type === "JSCRIPT") {
      field.get = tok.value;
      check = 1;
      p.next();
    }

    tok = p.peek();
    if (tok.type === "JSCRIPT") {
      check = 1;
      field.set = tok.value;
      p.next();
    }

    p.expect("SEMI");

    return field;
  }

  function p_Struct(p) {
    let name = p.expect("ID", "struct name");

    let st = new NStruct(name);

    let tok = p.peek();
    let id = -1;

    if (tok.type === "ID" && tok.value === "id") {
      p.next();
      p.expect("EQUALS");
      st.id = p.expect("NUM");
    }

    p.expect("OPEN");
    while (1) {
      if (p.at_end()) {
        p.error(undefined);
      } else if (p.optional("CLOSE")) {
        break;
      } else {
        st.fields.push(p_Field(p));
      }
    }

    return st;
  }

  parser$1.start = p_Struct;
  return parser$1;
}

const struct_parse = StructParser();

var struct_parser = /*#__PURE__*/Object.freeze({
  __proto__: null,
  NStruct: NStruct,
  StructEnum: StructEnum,
  ValueTypes: ValueTypes,
  StructTypes: StructTypes,
  StructTypeMap: StructTypeMap,
  struct_parse: struct_parse
});

/** dead file */

var struct_typesystem = /*#__PURE__*/Object.freeze({
  __proto__: null
});

"use strict";

var STRUCT_ENDIAN = true; //little endian

function setEndian(mode) {
  STRUCT_ENDIAN = !!mode;
}

let temp_dataview = new DataView(new ArrayBuffer(16));
let uint8_view = new Uint8Array(temp_dataview.buffer);

class unpack_context {
  constructor() {
    this.i = 0;
  }
}

function pack_byte(array, val) {
  array.push(val);
}

function pack_sbyte(array, val) {
  if (val < 0) {
    val = 256 + val;
  }

  array.push(val);
}

function pack_bytes(array, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    array.push(bytes[i]);
  }
}

function pack_int(array, val) {
  temp_dataview.setInt32(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
}

function pack_uint(array, val) {
  temp_dataview.setUint32(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
}

function pack_ushort(array, val) {
  temp_dataview.setUint16(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
}

function pack_float(array, val) {
  temp_dataview.setFloat32(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
}

function pack_double(array, val) {
  temp_dataview.setFloat64(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
  array.push(uint8_view[2]);
  array.push(uint8_view[3]);
  array.push(uint8_view[4]);
  array.push(uint8_view[5]);
  array.push(uint8_view[6]);
  array.push(uint8_view[7]);
}

function pack_short(array, val) {
  temp_dataview.setInt16(0, val, STRUCT_ENDIAN);

  array.push(uint8_view[0]);
  array.push(uint8_view[1]);
}

function encode_utf8(arr, str) {
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);

    while (c !== 0) {
      let uc = c & 127;
      c = c >> 7;

      if (c !== 0)
        uc |= 128;

      arr.push(uc);
    }
  }
}

function decode_utf8(arr) {
  let str = "";
  let i = 0;

  while (i < arr.length) {
    let c = arr[i];
    let sum = c & 127;
    let j = 0;
    let lasti = i;

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
}

function test_utf8() {
  let s = "a" + String.fromCharCode(8800) + "b";
  let arr = [];

  encode_utf8(arr, s);
  let s2 = decode_utf8(arr);

  if (s !== s2) {
    throw new Error("UTF-8 encoding/decoding test failed");
  }

  return true;
}

function truncate_utf8(arr, maxlen) {
  let len = Math.min(arr.length, maxlen);

  let last_codepoint = 0;
  let last2 = 0;

  let incode = false;
  let i = 0;
  let code = 0;
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

let _static_sbuf_ss = new Array(2048);

function pack_static_string(data, str, length) {
  if (length === undefined)
    throw new Error("'length' paremter is not optional for pack_static_string()");

  let arr = length < 2048 ? _static_sbuf_ss : new Array();
  arr.length = 0;

  encode_utf8(arr, str);
  truncate_utf8(arr, length);

  for (let i = 0; i < length; i++) {
    if (i >= arr.length) {
      data.push(0);
    } else {
      data.push(arr[i]);
    }
  }
}

let _static_sbuf = new Array(32);

/*strings are packed as 32-bit unicode codepoints*/
function pack_string(data, str) {
  _static_sbuf.length = 0;
  encode_utf8(_static_sbuf, str);

  pack_int(data, _static_sbuf.length);

  for (let i = 0; i < _static_sbuf.length; i++) {
    data.push(_static_sbuf[i]);
  }
}

function unpack_bytes(dview, uctx, len) {
  let ret = new DataView(dview.buffer.slice(uctx.i, uctx.i + len));
  uctx.i += len;

  return ret;
}

function unpack_byte(dview, uctx) {
  return dview.getUint8(uctx.i++);
}

function unpack_sbyte(dview, uctx) {
  return dview.getInt8(uctx.i++);
}

function unpack_int(dview, uctx) {
  uctx.i += 4;
  return dview.getInt32(uctx.i - 4, STRUCT_ENDIAN);
}

function unpack_uint(dview, uctx) {
  uctx.i += 4;
  return dview.getUint32(uctx.i - 4, STRUCT_ENDIAN);
}

function unpack_ushort(dview, uctx) {
  uctx.i += 2;
  return dview.getUint16(uctx.i - 2, STRUCT_ENDIAN);
}

function unpack_float(dview, uctx) {
  uctx.i += 4;
  return dview.getFloat32(uctx.i - 4, STRUCT_ENDIAN);
}

function unpack_double(dview, uctx) {
  uctx.i += 8;
  return dview.getFloat64(uctx.i - 8, STRUCT_ENDIAN);
}

function unpack_short(dview, uctx) {
  uctx.i += 2;
  return dview.getInt16(uctx.i - 2, STRUCT_ENDIAN);
}

let _static_arr_us = new Array(32);

function unpack_string(data, uctx) {
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
}

let _static_arr_uss = new Array(2048);

function unpack_static_string(data, uctx, length) {
  let str = "";

  if (length === undefined)
    throw new Error("'length' cannot be undefined in unpack_static_string()");

  let arr = length < 2048 ? _static_arr_uss : new Array(length);
  arr.length = 0;

  let done = false;
  for (let i = 0; i < length; i++) {
    let c = unpack_byte(data, uctx);

    if (c === 0) {
      done = true;
    }

    if (!done && c !== 0) {
      arr.push(c);
      //arr.length++;
    }
  }

  truncate_utf8(arr, length);
  return decode_utf8(arr);
}

var struct_binpack = /*#__PURE__*/Object.freeze({
  __proto__: null,
  get STRUCT_ENDIAN () { return STRUCT_ENDIAN; },
  setEndian: setEndian,
  temp_dataview: temp_dataview,
  uint8_view: uint8_view,
  unpack_context: unpack_context,
  pack_byte: pack_byte,
  pack_sbyte: pack_sbyte,
  pack_bytes: pack_bytes,
  pack_int: pack_int,
  pack_uint: pack_uint,
  pack_ushort: pack_ushort,
  pack_float: pack_float,
  pack_double: pack_double,
  pack_short: pack_short,
  encode_utf8: encode_utf8,
  decode_utf8: decode_utf8,
  test_utf8: test_utf8,
  pack_static_string: pack_static_string,
  pack_string: pack_string,
  unpack_bytes: unpack_bytes,
  unpack_byte: unpack_byte,
  unpack_sbyte: unpack_sbyte,
  unpack_int: unpack_int,
  unpack_uint: unpack_uint,
  unpack_ushort: unpack_ushort,
  unpack_float: unpack_float,
  unpack_double: unpack_double,
  unpack_short: unpack_short,
  unpack_string: unpack_string,
  unpack_static_string: unpack_static_string
});

let warninglvl = 2;
let debug = 0;

let _static_envcode_null = "";
let packer_debug, packer_debug_start, packer_debug_end;
let packdebug_tablevel = 0;

function _get_pack_debug() {
  return {
    packer_debug, packer_debug_start, packer_debug_end,
    debug, warninglvl
  }
}

class cachering extends Array {
  constructor(cb, tot) {
    super();
    this.length = tot;
    this.cur = 0;

    for (let i = 0; i < tot; i++) {
      this[i] = cb();
    }
  }

  static fromConstructor(cls, tot) {
    return new cachering(() => new cls(), tot);
  }

  next() {
    let ret = this[this.cur];

    this.cur = (this.cur + 1)%this.length;

    return ret;
  }
}

function gen_tabstr$1(tot) {
  let ret = "";

  for (let i = 0; i < tot; i++) {
    ret += " ";
  }

  return ret;
}

function setWarningMode(t) {
  if (typeof t !== "number" || isNaN(t)) {
    throw new Error("Expected a single number (>= 0) argument to setWarningMode");
  }

  warninglvl = t;
}

function setDebugMode(t) {
  debug = t;

  if (debug) {
    packer_debug = function () {
      let tab = gen_tabstr$1(packdebug_tablevel);

      if (arguments.length > 0) {
        console.warn(tab, ...arguments);
      } else {
        console.warn("Warning: undefined msg");
      }
    };
    packer_debug_start = function (funcname) {
      packer_debug("Start " + funcname);
      packdebug_tablevel++;
    };

    packer_debug_end = function (funcname) {
      packdebug_tablevel--;

      if (funcname) {
        packer_debug("Leave " + funcname);
      }
    };
  } else {
    packer_debug = function () {
    };
    packer_debug_start = function () {
    };
    packer_debug_end = function () {
    };
  }
}

setDebugMode(debug);

const StructFieldTypes = [];
const StructFieldTypeMap = {};

function packNull(manager, data, field, type) {
  StructFieldTypeMap[type.type].packNull(manager, data, field, type);
};

function toJSON(manager, val, obj, field, type) {
  return StructFieldTypeMap[type.type].toJSON(manager, val, obj, field, type);
};

function fromJSON(manager, val, obj, field, type, instance) {
  return StructFieldTypeMap[type.type].fromJSON(manager, val, obj, field, type, instance);
};

function unpack_field(manager, data, type, uctx) {
  let name;

  if (debug) {
    name = StructFieldTypeMap[type.type].define().name;
    packer_debug_start("R " + name);
  }

  let ret = StructFieldTypeMap[type.type].unpack(manager, data, type, uctx);

  if (debug) {
    packer_debug_end();
  }

  return ret;
}

let fakeFields = new cachering(() => {
  return {type: undefined, get: undefined, set: undefined}
}, 256);

function fmt_type(type) {
  return StructFieldTypeMap[type.type].format(type);
}

function do_pack(manager, data, val, obj, field, type) {
  let name;

  if (debug) {
    name = StructFieldTypeMap[type.type].define().name;
    packer_debug_start("W " + name);
  }

  let typeid = type;
  if (typeof typeid !== "number") {
    typeid = typeid.type;
  }

  let ret = StructFieldTypeMap[typeid].pack(manager, data, val, obj, field, type);

  if (debug) {
    packer_debug_end();
  }

  return ret;
}

let _ws_env = [[undefined, undefined]];

class StructFieldType {
  static pack(manager, data, val, obj, field, type) {
  }

  static unpack(manager, data, type, uctx) {
  }

  static packNull(manager, data, field, type) {
    this.pack(manager, data, 0, 0, field, type);
  }

  static format(type) {
    return this.define().name;
  }

  static toJSON(manager, val, obj, field, type) {
    return val;
  }

  static fromJSON(manager, val, obj, field, type, instance) {
    return val;
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
  static define() {
    return {
      type: -1,
      name: "(error)"
    }
  }

  /**
   Register field packer/unpacker class.  Will throw an error if define() method is bad.
   */
  static register(cls) {
    if (StructFieldTypes.indexOf(cls) >= 0) {
      throw new Error("class already registered");
    }

    if (cls.define === StructFieldType.define) {
      throw new Error("you forgot to make a define() static method");
    }

    if (cls.define().type === undefined) {
      throw new Error("cls.define().type was undefined!");
    }

    if (cls.define().type in StructFieldTypeMap) {
      throw new Error("type " + cls.define().type + " is used by another StructFieldType subclass");
    }

    StructFieldTypes.push(cls);
    StructFieldTypeMap[cls.define().type] = cls;
  }
}

class StructIntField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_int(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_int(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_INT,
      name: "int"
    }
  }
}

StructFieldType.register(StructIntField);

class StructFloatField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_float(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_float(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_FLOAT,
      name: "float"
    }
  }
}

StructFieldType.register(StructFloatField);

class StructDoubleField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_double(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_double(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_DOUBLE,
      name: "double"
    }
  }
}

StructFieldType.register(StructDoubleField);

class StructStringField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    val = !val ? "" : val;

    pack_string(data, val);
  }

  static packNull(manager, data, field, type) {
    this.pack(manager, data, "", 0, field, type);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_string(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_STRING,
      name: "string"
    }
  }
}

StructFieldType.register(StructStringField);

class StructStaticStringField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    val = !val ? "" : val;

    pack_static_string(data, val, type.data.maxlength);
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

  static define() {
    return {
      type: StructEnum.T_STATIC_STRING,
      name: "static_string"
    }
  }
}

StructFieldType.register(StructStaticStringField);

class StructStructField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    let stt = manager.get_struct(type.data);

    packer_debug("struct", stt.name);

    manager.write_struct(data, val, stt);
  }

  static format(type) {
    return type.data;
  }

  static fromJSON(manager, val, obj, field, type, instance) {
    let stt = manager.get_struct(type.data);

    return manager.readJSON(val, stt, instance);
  }

  static toJSON(manager, val, obj, field, type) {
    let stt = manager.get_struct(type.data);
    return manager.writeJSON(val, stt);
  }

  static unpackInto(manager, data, type, uctx, dest) {
    let cls2 = manager.get_struct_cls(type.data);

    packer_debug("struct", cls2 ? cls2.name : "(error)");
    return manager.read_object(data, cls2, uctx, dest);
  }

  static packNull(manager, data, field, type) {
    let stt = manager.get_struct(type.data);

    packer_debug("struct", type);

    for (let field2 of stt.fields) {
      let type2 = field2.type;

      packNull(manager, data, field2, type2);
    }
  }

  static unpack(manager, data, type, uctx) {
    let cls2 = manager.get_struct_cls(type.data);
    packer_debug("struct", cls2 ? cls2.name : "(error)");

    return manager.read_object(data, cls2, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_STRUCT,
      name: "struct"
    }
  }
}

StructFieldType.register(StructStructField);

class StructTStructField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    let cls = manager.get_struct_cls(type.data);
    let stt = manager.get_struct(type.data);

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

    pack_int(data, stt.id);
    manager.write_struct(data, val, stt);
  }

  static fromJSON(manager, val, obj, field, type, instance) {
    let stt = manager.get_struct(val._structName);

    return manager.readJSON(val, stt, instance);
  }

  static toJSON(manager, val, obj, field, type) {
    let stt = manager.get_struct(val.constructor.structName);
    let ret = manager.writeJSON(val, stt);

    ret._structName = "" + stt.name;

    return ret;
  }

  static packNull(manager, data, field, type) {
    let stt = manager.get_struct(type.data);

    pack_int(data, stt.id);
    packNull(manager, data, field, {type: StructEnum.T_STRUCT, data: type.data});
  }

  static format(type) {
    return "abstract(" + type.data + ")";
  }

  static unpackInto(manager, data, type, uctx, dest) {
    let id = unpack_int(data, uctx);

    packer_debug("-int " + id);
    if (!(id in manager.struct_ids)) {
      packer_debug("tstruct id: " + id);
      console.trace();
      console.log(id);
      console.log(manager.struct_ids);
      throw new Error("Unknown struct type " + id + ".");
    }

    let cls2 = manager.get_struct_id(id);

    packer_debug("struct name: " + cls2.name);

    cls2 = manager.struct_cls[cls2.name];

    return manager.read_object(data, cls2, uctx, dest);
    //packer_debug("ret", ret);
  }

  static unpack(manager, data, type, uctx) {
    let id = unpack_int(data, uctx);

    packer_debug("-int " + id);
    if (!(id in manager.struct_ids)) {
      packer_debug("tstruct id: " + id);
      console.trace();
      console.log(id);
      console.log(manager.struct_ids);
      throw new Error("Unknown struct type " + id + ".");
    }

    let cls2 = manager.get_struct_id(id);

    packer_debug("struct name: " + cls2.name);
    cls2 = manager.struct_cls[cls2.name];

    return manager.read_object(data, cls2, uctx);
    //packer_debug("ret", ret);
  }

  static define() {
    return {
      type: StructEnum.T_TSTRUCT,
      name: "tstruct"
    }
  }
}

StructFieldType.register(StructTStructField);

class StructArrayField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    if (val === undefined) {
      console.trace();
      console.log("Undefined array fed to struct struct packer!");
      console.log("Field: ", field);
      console.log("Type: ", type);
      console.log("");
      packer_debug("int 0");
      pack_int(data, 0);
      return;
    }

    packer_debug("int " + val.length);
    pack_int(data, val.length);

    let d = type.data;

    let itername = d.iname;
    let type2 = d.type;

    let env = _ws_env;
    for (let i = 0; i < val.length; i++) {
      let val2 = val[i];
      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;
      do_pack(manager, data, val2, obj, fakeField, type2);
    }
  }

  static packNull(manager, data, field, type) {
    pack_int(data, 0);
  }

  static format(type) {
    if (type.data.iname !== "" && type.data.iname !== undefined) {
      return "array(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    } else {
      return "array(" + fmt_type(type.data.type) + ")";
    }
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }

  static fromJSON(manager, val, obj, field, type, instance) {
    let ret = instance || [];

    ret.length = 0;

    for (let i = 0; i < val.length; i++) {
      let val2 = fromJSON(manager, val[i], val, field, type.data.type, undefined);

      if (val2 === undefined) {
        console.log(val2);
        console.error("eeek");
        process.exit();
      }

      ret.push(val2);
    }

    return ret;
  }

  static toJSON(manager, val, obj, field, type) {
    val = val || [];
    let json = [];

    let itername = type.data.iname;

    for (let i = 0; i < val.length; i++) {
      let val2 = val[i];
      let env = _ws_env;

      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);

        //console.log("VAL2", val2, toJSON(manager, val2, val, field, type.data.type));
      }

      json.push(toJSON(manager, val2, val, field, type.data.type));
    }

    return json;
  }

  static unpackInto(manager, data, type, uctx, dest) {
    let len = unpack_int(data, uctx);
    dest.length = 0;

    for (let i = 0; i < len; i++) {
      dest.push(unpack_field(manager, data, type.data.type, uctx));
    }
  }

  static unpack(manager, data, type, uctx) {
    let len = unpack_int(data, uctx);
    packer_debug("-int " + len);

    let arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }

    return arr;
  }

  static define() {
    return {
      type: StructEnum.T_ARRAY,
      name: "array"
    }
  }
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
        val.forEach(function (item) {
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

    /* save space for length */
    let starti = data.length;
    data.length += 4;

    let d = type.data, itername = d.iname, type2 = d.type;
    let env = _ws_env;

    let i = 0;
    forEach(function (val2) {
      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      //XXX not sure I really need this fakeField stub here. . .
      let fakeField = fakeFields.next();
      fakeField.type = type2;
      do_pack(manager, data, val2, obj, fakeField, type2);

      i++;
    }, this);

    /* write length */
    temp_dataview.setInt32(0, i, STRUCT_ENDIAN);

    data[starti++] = uint8_view[0];
    data[starti++] = uint8_view[1];
    data[starti++] = uint8_view[2];
    data[starti++] = uint8_view[3];
  }

  static fromJSON() {
    return StructArrayField.fromJSON(...arguments);
  }

  static toJSON(manager, val, obj, field, type) {
    val = val || [];
    let json = [];

    let itername = type.data.iname;

    for (let val2 of val) {
      let env = _ws_env;

      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);

        //console.log("VAL2", val2, toJSON(manager, val2, val, field, type.data.type));
      }

      json.push(toJSON(manager, val2, val, field, type.data.type));
    }

    return json;
  }

  static packNull(manager, data, field, type) {
    pack_int(data, 0);
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }

  static format(type) {
    if (type.data.iname !== "" && type.data.iname !== undefined) {
      return "iter(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    } else {
      return "iter(" + fmt_type(type.data.type) + ")";
    }
  }

  static unpackInto(manager, data, type, uctx, arr) {
    let len = unpack_int(data, uctx);
    packer_debug("-int " + len);

    arr.length = 0;

    for (let i = 0; i < len; i++) {
      arr.push(unpack_field(manager, data, type.data.type, uctx));
    }

    return arr;
  }

  static unpack(manager, data, type, uctx) {
    let len = unpack_int(data, uctx);
    packer_debug("-int " + len);

    let arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }

    return arr;
  }

  static define() {
    return {
      type: StructEnum.T_ITER,
      name: "iter"
    }
  }
}

StructFieldType.register(StructIterField);

class StructShortField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_short(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_short(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_SHORT,
      name: "short"
    }
  }
}

StructFieldType.register(StructShortField);

class StructByteField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_byte(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_byte(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_BYTE,
      name: "byte"
    }
  }
}

StructFieldType.register(StructByteField);

class StructSignedByteField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_sbyte(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_sbyte(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_SIGNED_BYTE,
      name: "sbyte"
    }
  }
}

StructFieldType.register(StructSignedByteField);

class StructBoolField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_byte(data, !!val);
  }

  static unpack(manager, data, type, uctx) {
    return !!unpack_byte(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_BOOL,
      name: "bool"
    }
  }
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

      pack_int(data, 0);
      return;
    }

    let len = 0.0;
    for (let k in val) {
      len++;
    }

    packer_debug("int " + len);
    pack_int(data, len);

    let d = type.data, itername = d.iname, type2 = d.type;
    let env = _ws_env;

    let i = 0;
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

      let f2 = {type: type2, get: undefined, set: undefined};
      do_pack(manager, data, val2, obj, f2, type2);

      i++;
    }
  }

  static fromJSON() {
    return StructArrayField.fromJSON(...arguments);
  }

  static toJSON(manager, val, obj, field, type) {
    val = val || [];
    let json = [];

    let itername = type.data.iname;

    for (let k in val) {
      let val2 = val[k];
      let env = _ws_env;

      if (itername !== "" && itername !== undefined && field.get) {
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);

        //console.log("VAL2", val2, toJSON(manager, val2, val, field, type.data.type));
      }

      json.push(toJSON(manager, val2, val, field, type.data.type));
    }

    return json;
  }

  static packNull(manager, data, field, type) {
    pack_int(data, 0);
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }

  static format(type) {
    if (type.data.iname !== "" && type.data.iname !== undefined) {
      return "iterkeys(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
    } else {
      return "iterkeys(" + fmt_type(type.data.type) + ")";
    }
  }

  static unpackInto(manager, data, type, uctx, arr) {
    let len = unpack_int(data, uctx);
    packer_debug("-int " + len);

    arr.length = 0;

    for (let i = 0; i < len; i++) {
      arr.push(unpack_field(manager, data, type.data.type, uctx));
    }

    return arr;
  }

  static unpack(manager, data, type, uctx) {
    let len = unpack_int(data, uctx);
    packer_debug("-int " + len);

    let arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = unpack_field(manager, data, type.data.type, uctx);
    }

    return arr;
  }

  static define() {
    return {
      type: StructEnum.T_ITERKEYS,
      name: "iterkeys"
    }
  }
}

StructFieldType.register(StructIterKeysField);

class StructUintField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_uint(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_uint(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_UINT,
      name: "uint"
    }
  }
}

StructFieldType.register(StructUintField);


class StructUshortField extends StructFieldType {
  static pack(manager, data, val, obj, field, type) {
    pack_ushort(data, val);
  }

  static unpack(manager, data, type, uctx) {
    return unpack_ushort(data, uctx);
  }

  static define() {
    return {
      type: StructEnum.T_USHORT,
      name: "ushort"
    }
  }
}

StructFieldType.register(StructUshortField);

//let writeEmpty = writeEmpty = function writeEmpty(stt) {
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

    for (let i = 0; i < type.data.size; i++) {
      let i2 = Math.min(i, Math.min(val.length - 1, type.data.size));
      let val2 = val[i2];

      //*
      if (itername !== "" && itername !== undefined && field.get) {
        let env = _ws_env;
        env[0][0] = itername;
        env[0][1] = val2;
        val2 = manager._env_call(field.get, obj, env);
      }

      do_pack(manager, data, val2, val, field, type.data.type);
    }
  }

  static useHelperJS(field) {
    return !field.type.data.iname;
  }

  static fromJSON() {
    return StructArrayField.fromJSON(...arguments);
  }

  static packNull(manager, data, field, type) {
    let size = type.data.size;
    for (let i = 0; i < size; i++) {
      packNull(manager, data, field, type.data.type);
    }
  }

  static toJSON(manager, val, obj, field, type) {
    return StructArrayField.toJSON(...arguments);
  }

  static format(type) {
    let type2 = StructFieldTypeMap[type.data.type.type].format(type.data.type);

    let ret = `static_array[${type2}, ${type.data.size}`;

    if (type.data.iname) {
      ret += `, ${type.data.iname}`;
    }
    ret += `]`;

    return ret;
  }

  static unpackInto(manager, data, type, uctx, ret) {
    packer_debug("-size: " + type.data.size);

    ret.length = 0;

    for (let i = 0; i < type.data.size; i++) {
      ret.push(unpack_field(manager, data, type.data.type, uctx));
    }

    return ret;
  }

  static unpack(manager, data, type, uctx) {
    packer_debug("-size: " + type.data.size);

    let ret = [];

    for (let i = 0; i < type.data.size; i++) {
      ret.push(unpack_field(manager, data, type.data.type, uctx));
    }

    return ret;
  }

  static define() {
    return {
      type: StructEnum.T_STATIC_ARRAY,
      name: "static_array"
    }
  }
}

StructFieldType.register(StructStaticArrayField);

var structEval = eval;

function setStructEval(val) {
  structEval = val;
}

var nGlobal;

if (typeof globalThis !== "undefined") {
  nGlobal = globalThis;
} else if (typeof window !== "undefined") {
  nGlobal = window;
} else if (typeof global !== "undefined") {
  nGlobal = global;
} else if (typeof globals !== "undefined") {
  nGlobal = globals;
} else if (typeof self !== "undefined") {
  nGlobal = self;
}

const DEBUG = {};

function updateDEBUG() {
  for (let k in Object.keys(DEBUG)) {
    delete DEBUG[k];
  }

  if (typeof nGlobal.DEBUG === "object") {
    for (let k in nGlobal.DEBUG) {
      DEBUG[k] = nGlobal.DEBUG[k];
    }
  }
}

"use strict";

let warninglvl$1 = 2;

var truncateDollarSign = true;
var manager;

function setTruncateDollarSign(v) {
  truncateDollarSign = !!v;
}

function _truncateDollarSign(s) {
  let i = s.search("$");

  if (i > 0) {
    return s.slice(0, i).trim();
  }

  return s;
}

function unmangle(name) {
  if (truncateDollarSign) {
    return _truncateDollarSign(name);
  } else {
    return name;
  }
}

let _static_envcode_null$1 = "";

//truncate webpack-mangled names

function gen_tabstr$2(tot) {
  let ret = "";

  for (let i = 0; i < tot; i++) {
    ret += " ";
  }

  return ret;
}

let packer_debug$1, packer_debug_start$1, packer_debug_end$1;

function update_debug_data() {
  let ret = _get_pack_debug();

  packer_debug$1 = ret.packer_debug;
  packer_debug_start$1 = ret.packer_debug_start;
  packer_debug_end$1 = ret.packer_debug_end;
  warninglvl$1 = ret.warninglvl;
}

update_debug_data();

function setWarningMode$1(t) {
  setWarningMode(t);

  if (typeof t !== "number" || isNaN(t)) {
    throw new Error("Expected a single number (>= 0) argument to setWarningMode");
  }

  warninglvl$1 = t;
}

function setDebugMode$1(t) {
  setDebugMode(t);
  update_debug_data();
}

let _ws_env$1 = [[undefined, undefined]];

function do_pack$1(data, val, obj, thestruct, field, type) {
  StructFieldTypeMap[field.type.type].pack(manager, data, val, obj, field, type);
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

class STRUCT {
  constructor() {
    this.idgen = 0;
    this.allowOverriding = true;

    this.structs = {};
    this.struct_cls = {};
    this.struct_ids = {};

    this.compiled_code = {};
    this.null_natives = {};

    function define_null_native(name, cls) {
      let obj = define_empty_class(name);

      let stt = struct_parse.parse(obj.STRUCT);

      stt.id = this.idgen++;

      this.structs[name] = stt;
      this.struct_cls[name] = cls;
      this.struct_ids[stt.id] = stt;

      this.null_natives[name] = 1;
    }

    define_null_native.call(this, "Object", Object);
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

  //defined_classes is an array of class constructors
  //with STRUCT scripts, *OR* another STRUCT instance
  //

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
    if (internal_only === undefined)
      internal_only = false;
    if (no_helper_js === undefined)
      no_helper_js = false;

    let s = "";
    if (!internal_only) {
      s += stt.name;
      if (stt.id !== -1)
        s += " id=" + stt.id;
      s += " {\n";
    }
    let tab = "  ";

    function fmt_type(type) {
      return StructFieldTypeMap[type.type].format(type);

      if (type.type === StructEnum.T_ARRAY || type.type === StructEnum.T_ITER || type.type === StructEnum.T_ITERKEYS) {
        if (type.data.iname !== "" && type.data.iname !== undefined) {
          return "array(" + type.data.iname + ", " + fmt_type(type.data.type) + ")";
        } else {
          return "array(" + fmt_type(type.data.type) + ")";
        }
      } else if (type.type === StructEnum.T_STATIC_STRING) {
        return "static_string[" + type.data.maxlength + "]";
      } else if (type.type === StructEnum.T_STRUCT) {
        return type.data;
      } else if (type.type === StructEnum.T_TSTRUCT) {
        return "abstract(" + type.data + ")";
      } else {
        return StructTypeMap[type.type];
      }
    }

    let fields = stt.fields;
    for (let i = 0; i < fields.length; i++) {
      let f = fields[i];
      s += tab + f.name + " : " + fmt_type(f.type);
      if (!no_helper_js && f.get !== undefined) {
        s += " | " + f.get.trim();
      }
      s += ";\n";
    }
    if (!internal_only)
      s += "}";
    return s;
  }

  validateStructs(onerror) {
    function getType(type) {
      switch (type.type) {
        case StructEnum.T_ITERKEYS:
        case StructEnum.T_ITER:
        case StructEnum.T_STATIC_ARRAY:
        case StructEnum.T_ARRAY:
          return getType(type.data.type);
        case StructEnum.T_TSTRUCT:
          return type;
        case StructEnum.T_STRUCT:
        default:
          return type;
      }
    }

    function formatType(type) {
      let ret = {};

      ret.type = type.type;

      if (typeof ret.type === "number") {
        for (let k in StructEnum) {
          if (StructEnum[k] === ret.type) {
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

    function throwError(stt, field, msg) {
      let buf = STRUCT.formatStruct(stt);

      console.error(buf + "\n\n" + msg);

      if (onerror) {
        onerror(msg, stt, field);
      } else {
        throw new Error(msg);
      }
    }

    for (let k in this.structs) {
      let stt = this.structs[k];

      for (let field of stt.fields) {
        if (field.name === "this") {
          let type = field.type.type;

          if (ValueTypes.has(type)) {
            throwError(stt, field, "'this' cannot be used with value types");
          }
        }

        let type = getType(field.type);

        if (type.type !== StructEnum.T_STRUCT && type.type !== StructEnum.T_TSTRUCT) {
          continue;
        }

        if (!(type.data in this.structs)) {
          let msg = stt.name + ":" + field.name + ": Unknown struct " + type.data + ".";
          throwError(stt, field, msg);
        }
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

  //defaults to structjs.manager
  parse_structs(buf, defined_classes) {
    if (defined_classes === undefined) {
      defined_classes = manager;
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

      for (let k in manager.struct_cls) {
        defined_classes.push(manager.struct_cls[k]);
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

  /** adds all structs referenced by cls inside of srcSTRUCT
   *  to this */
  registerGraph(srcSTRUCT, cls) {
    if (!cls.structName) {
      console.warn("class was not in srcSTRUCT");
      return this.register(cls);
    }

    let recStruct;

    let recArray = (t) => {
      switch (t.type) {
        case StructEnum.T_ARRAY:
          return recArray(t.data.type);
        case StructEnum.T_ITERKEYS:
          return recArray(t.data.type);
        case StructEnum.T_STATIC_ARRAY:
          return recArray(t.data.type);
        case StructEnum.T_ITER:
          return recArray(t.data.type);
        case StructEnum.T_STRUCT:
        case StructEnum.T_TSTRUCT: {
          let st = srcSTRUCT.structs[t.data];
          let cls = srcSTRUCT.struct_cls[st.name];

          return recStruct(st, cls);
        }
      }
    };

    recStruct = (st, cls) => {
      if (!(cls.structName in this.structs)) {
        this.add_class(cls, cls.structName);
      }

      for (let f of st.fields) {
        if (f.type.type === StructEnum.T_STRUCT || f.type.type === StructEnum.T_TSTRUCT) {
          let st2 = srcSTRUCT.structs[f.type.data];
          let cls2 = srcSTRUCT.struct_cls[st2.name];

          recStruct(st2, cls2);
        } else if (f.type.type === StructEnum.T_ARRAY) {
          recArray(f.type);
        } else if (f.type.type === StructEnum.T_ITER) {
          recArray(f.type);
        } else if (f.type.type === StructEnum.T_ITERKEYS) {
          recArray(f.type);
        } else if (f.type.type === StructEnum.T_STATIC_ARRAY) {
          recArray(f.type);
        }
      }
    };

    let st = srcSTRUCT.structs[cls.structName];
    recStruct(st, cls);
  }

  register(cls, structName) {
    return this.add_class(cls, structName);
  }

  unregister(cls) {
    if (!cls || !cls.structName || !(cls.structName in this.struct_cls)) {
      console.warn("Class not registered with nstructjs", cls);
      return;
    }


    let st = this.structs[cls.structName];

    delete this.structs[cls.structName];
    delete this.struct_cls[cls.structName];
    delete this.struct_ids[st.id];
  }

  add_class(cls, structName) {
    //do not register Object
    if (cls === Object) {
      return;
    }

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
      stt.id = this.idgen++;

    this.structs[cls.structName] = stt;
    this.struct_cls[cls.structName] = cls;
    this.struct_ids[stt.id] = stt;
  }

  isRegistered(cls) {
    if (!cls.hasOwnProperty("structName")) {
      return false;
    }

    return cls === this.struct_cls[cls.structName];
  }

  get_struct_id(id) {
    return this.struct_ids[id];
  }

  get_struct(name) {
    if (!(name in this.structs)) {
      console.warn("Unknown struct", name);
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

  _env_call(code, obj, env) {
    let envcode = _static_envcode_null$1;
    if (env !== undefined) {
      envcode = "";
      for (let i = 0; i < env.length; i++) {
        envcode = "let " + env[i][0] + " = env[" + i.toString() + "][1];\n" + envcode;
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
        func = structEval(code2);
      } catch (err) {
        console.warn(err.stack);

        console.warn(code2);
        console.warn(" ");
        throw err;
      }
      this.compiled_code[fullcode] = func;
    } else {
      func = this.compiled_code[fullcode];
    }
    try {
      return func.call(obj, obj, env);
    } catch (err) {
      console.warn(err.stack);

      let code2 = "func = function(obj, env) { " + envcode + "return " + code + "}";
      console.warn(code2);
      console.warn(" ");
      throw err;
    }
  }

  write_struct(data, obj, stt) {
    function use_helper_js(field) {
      let type = field.type.type;
      let cls = StructFieldTypeMap[type];
      return cls.useHelperJS(field);
    }

    let fields = stt.fields;
    let thestruct = this;
    for (let i = 0; i < fields.length; i++) {
      let f = fields[i];
      let t1 = f.type;
      let t2 = t1.type;

      if (use_helper_js(f)) {
        let val;
        let type = t2;
        if (f.get !== undefined) {
          val = thestruct._env_call(f.get, obj);
        } else {
          val = f.name === "this" ? obj : obj[f.name];
        }

        if (DEBUG.tinyeval) {
          console.log("\n\n\n", f.get, "Helper JS Ret", val, "\n\n\n");
        }

        do_pack$1(data, val, obj, thestruct, f, t1);
      } else {
        let val = f.name === "this" ? obj : obj[f.name];
        do_pack$1(data, val, obj, thestruct, f, t1);
      }
    }
  }

  /**
   @param data : array to write data into,
   @param obj  : structable object
   */
  write_object(data, obj) {
    let cls = obj.constructor.structName;
    let stt = this.get_struct(cls);

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
    if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
      data = new DataView(data.buffer);
    } else if (data instanceof Array) {
      data = new DataView(new Uint8Array(data).buffer);
    }

    return this.read_object(data, cls_or_struct_id, uctx);
  }

  /**
   @param data array to write data into,
   @param obj structable object
   */
  writeObject(data, obj) {
    return this.write_object(data, obj);
  }

  writeJSON(obj, stt = undefined) {
    let cls = obj.constructor;
    stt = stt || this.get_struct(cls.structName);

    function use_helper_js(field) {
      let type = field.type.type;
      let cls = StructFieldTypeMap[type];
      return cls.useHelperJS(field);
    }

    let toJSON$1 = toJSON;

    let fields = stt.fields;
    let thestruct = this;
    let json = {};

    for (let i = 0; i < fields.length; i++) {
      let f = fields[i];
      let val;
      let t1 = f.type;

      let json2;

      if (use_helper_js(f)) {
        if (f.get !== undefined) {
          val = thestruct._env_call(f.get, obj);
        } else {
          val = f.name === "this" ? obj : obj[f.name];
        }

        if (DEBUG.tinyeval) {
          console.log("\n\n\n", f.get, "Helper JS Ret", val, "\n\n\n");
        }

        json2 = toJSON$1(this, val, obj, f, t1);
      } else {
        val = f.name === "this" ? obj : obj[f.name];
        json2 = toJSON$1(this, val, obj, f, t1);
      }

      if (f.name !== 'this') {
        json[f.name] = json2;
      } else { //f.name was 'this'?
        let isArray = Array.isArray(json2);
        isArray = isArray || f.type.type === StructTypes.T_ARRAY;
        isArray = isArray || f.type.type === StructTypes.T_STATIC_ARRAY;

        if (isArray) {
          json.length = json2.length;

          for (let i = 0; i < json2.length; i++) {
            json[i] = json2[i];
          }
        } else {
          Object.assign(json, json2);
        }
      }
    }

    return json;
  }

  /**
   @param data : DataView or Uint8Array instance
   @param cls_or_struct_id : Structable class
   @param uctx : internal parameter
   */
  read_object(data, cls_or_struct_id, uctx, objInstance) {
    let cls, stt;

    if (data instanceof Array) {
      data = new DataView(new Uint8Array(data).buffer);
    }

    if (typeof cls_or_struct_id === "number") {
      cls = this.struct_cls[this.struct_ids[cls_or_struct_id].name];
    } else {
      cls = cls_or_struct_id;
    }

    if (cls === undefined) {
      throw new Error("bad cls_or_struct_id " + cls_or_struct_id);
    }

    stt = this.structs[cls.structName];

    if (uctx === undefined) {
      uctx = new unpack_context();

      packer_debug$1("\n\n=Begin reading " + cls.structName + "=");
    }
    let thestruct = this;

    let this2 = this;

    function unpack_field(type) {
      return StructFieldTypeMap[type.type].unpack(this2, data, type, uctx);
    }

    function unpack_into(type, dest) {
      return StructFieldTypeMap[type.type].unpackInto(this2, data, type, uctx, dest);
    }

    let was_run = false;

    function makeLoader(stt) {
      return function load(obj) {
        if (was_run) {
          return;
        }

        was_run = true;

        let fields = stt.fields;
        let flen = fields.length;

        for (let i = 0; i < flen; i++) {
          let f = fields[i];

          if (f.name === 'this') {
            //load data into obj directly
            unpack_into(f.type, obj);
          } else {
            obj[f.name] = unpack_field(f.type);
          }
        }
      }
    }

    let load = makeLoader(stt);

    if (cls.prototype.loadSTRUCT !== undefined) {
      let obj = objInstance;

      if (!obj && cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT(load);
      } else if (!obj) {
        obj = new cls();
      }

      obj.loadSTRUCT(load);

      if (!was_run) {
        console.warn(""+cls.structName + ".prototype.loadSTRUCT() did not execute its loader callback!");
        load(obj);
      }

      return obj;
    } else if (cls.fromSTRUCT !== undefined) {
      if (warninglvl$1 > 1)
        console.warn("Warning: class " + unmangle(cls.name) + " is using deprecated fromSTRUCT interface; use newSTRUCT/loadSTRUCT instead");
      return cls.fromSTRUCT(load);
    } else { //default case, make new instance and then call load() on it
      let obj = objInstance;

      if (!obj && cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT(load);
      } else if (!obj) {
        obj = new cls();
      }

      load(obj);

      return obj;
    }
  }

  readJSON(json, cls_or_struct_id, objInstance = undefined) {
    let cls, stt;

    if (typeof cls_or_struct_id === "number") {
      cls = this.struct_cls[this.struct_ids[cls_or_struct_id].name];
    } else if (cls_or_struct_id instanceof NStruct) {
      cls = this.get_struct_cls(cls_or_struct_id.name);
    } else {
      cls = cls_or_struct_id;
    }

    if (cls === undefined) {
      throw new Error("bad cls_or_struct_id " + cls_or_struct_id);
    }

    stt = this.structs[cls.structName];

    packer_debug$1("\n\n=Begin reading " + cls.structName + "=");
    let thestruct = this;
    let this2 = this;
    let was_run = false;
    let fromJSON$1 = fromJSON;

    function makeLoader(stt) {
      return function load(obj) {
        if (was_run) {
          return;
        }

        was_run = true;

        let fields = stt.fields;
        let flen = fields.length;

        for (let i = 0; i < flen; i++) {
          let f = fields[i];

          let val;

          if (f.name === 'this') {
            val = json;
          } else {
            val = json[f.name];
          }

          if (val === undefined) {
            console.warn("nstructjs.readJSON: Missing field " + f.name + " in struct " + stt.name);
            continue;
          }

          let instance = f.name === 'this' ? obj : objInstance;

          let ret = fromJSON$1(this2, val, obj, f, f.type, instance);

          if (f.name !== 'this') {
            obj[f.name] = ret;
          }
        }
      }
    }

    let load = makeLoader(stt);

    if (cls.prototype.loadSTRUCT !== undefined) {
      let obj = objInstance;

      if (!obj && cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT(load);
      } else if (!obj) {
        obj = new cls();
      }

      obj.loadSTRUCT(load);
      return obj;
    } else if (cls.fromSTRUCT !== undefined) {
      if (warninglvl$1 > 1)
        console.warn("Warning: class " + unmangle(cls.name) + " is using deprecated fromSTRUCT interface; use newSTRUCT/loadSTRUCT instead");
      return cls.fromSTRUCT(load);
    } else { //default case, make new instance and then call load() on it
      let obj = objInstance;

      if (!obj && cls.newSTRUCT !== undefined) {
        obj = cls.newSTRUCT(load);
      } else if (!obj) {
        obj = new cls();
      }

      load(obj);

      return obj;
    }
  }
};

//main struct script manager
manager = new STRUCT();

/**
 * Write all defined structs out to a string.
 *
 * @param nManager STRUCT instance, defaults to nstructjs.manager
 * @param include_code include save code snippets
 * */
function write_scripts(nManager = manager, include_code = false) {
  let buf = "";

  nManager.forEach(function (stt) {
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
    } else {
      buf += c;
    }
  }

  return buf;
}

"use strict";

let nbtoa, natob;

if (typeof btoa === "undefined") {
  nbtoa = function btoa(str) {
    let buffer = new Buffer("" + str, 'binary');
    return buffer.toString('base64');
  };

  natob = function atob(str) {
    return new Buffer(str, 'base64').toString('binary');
  };
} else {
  natob = atob;
  nbtoa = btoa;
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

function versionToInt(v) {
  v = versionCoerce(v);
  let mul = 64;
  return ~~(v.major*mul*mul*mul + v.minor*mul*mul + v.micro*mul);
}

let ver_pat = /[0-9]+\.[0-9]+\.[0-9]+$/;

function versionCoerce(v) {
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
}

function versionLessThan(a, b) {
  return versionToInt(a) < versionToInt(b);
}

class FileParams {
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
}

//used to define blocks
class Block {
  constructor(type_magic, data) {
    this.type = type_magic;
    this.data = data;
  }
}

class FileeError extends Error {
}

class FileHelper {
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
    this.unpack_ctx = new unpack_context();

    let magic = unpack_static_string(dataview, this.unpack_ctx, 4);

    if (magic !== this.magic) {
      throw new FileError("corrupted file");
    }

    this.version = {};
    this.version.major = unpack_short(dataview, this.unpack_ctx);
    this.version.minor = unpack_byte(dataview, this.unpack_ctx);
    this.version.micro = unpack_byte(dataview, this.unpack_ctx);

    let struct = this.struct = new STRUCT();

    let scripts = unpack_string(dataview, this.unpack_ctx);
    this.struct.parse_structs(scripts, manager);

    let blocks = [];
    let dviewlen = dataview.buffer.byteLength;

    while (this.unpack_ctx.i < dviewlen) {
      //console.log("reading block. . .", this.unpack_ctx.i, dviewlen);

      let type = unpack_static_string(dataview, this.unpack_ctx, 4);
      let datalen = unpack_int(dataview, this.unpack_ctx);
      let bstruct = unpack_int(dataview, this.unpack_ctx);
      let bdata;

      //console.log(type, datalen, bstruct);

      if (bstruct === -2) { //string data, e.g. JSON
        bdata = unpack_static_string(dataview, this.unpack_ctx, datalen);
      } else {
        bdata = unpack_bytes(dataview, this.unpack_ctx, datalen);
        bdata = struct.read_object(bdata, bstruct, new unpack_context());
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
    this.struct = manager;
    this.blocks = blocks;

    let data = [];

    pack_static_string(data, this.magic, 4);
    pack_short(data, this.version.major);
    pack_byte(data, this.version.minor & 255);
    pack_byte(data, this.version.micro & 255);

    let scripts = write_scripts();
    pack_string(data, scripts);

    let struct = this.struct;

    for (let block of blocks) {
      if (typeof block.data === "string") { //string data, e.g. JSON
        pack_static_string(data, block.type, 4);
        pack_int(data, block.data.length);
        pack_int(data, -2); //flag as string data
        pack_static_string(data, block.data, block.data.length);
        continue;
      }

      let structName = block.data.constructor.structName;
      if (structName === undefined || !(structName in struct.structs)) {
        throw new Error("Non-STRUCTable object " + block.data);
      }

      let data2 = [];
      let stt = struct.structs[structName];

      struct.write_object(data2, block.data);

      pack_static_string(data, block.type, 4);
      pack_int(data, data2.length);
      pack_int(data, stt.id);

      pack_bytes(data, data2);
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

    return nbtoa(str);
  }

  makeBlock(type, data) {
    return new Block(type, data);
  }

  readBase64(base64) {
    let data = natob(base64);
    let data2 = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      data2[i] = data.charCodeAt(i);
    }

    return this.read(new DataView(data2.buffer));
  }
}

var struct_filehelper = /*#__PURE__*/Object.freeze({
  __proto__: null,
  versionToInt: versionToInt,
  versionCoerce: versionCoerce,
  versionLessThan: versionLessThan,
  FileParams: FileParams,
  Block: Block,
  FileeError: FileeError,
  FileHelper: FileHelper
});

/** truncate webpack mangled names. defaults to true
 *  so Mesh$1 turns into Mesh */
function truncateDollarSign$1(value = true) {
  setTruncateDollarSign(value);
}

function validateStructs(onerror) {
  return manager.validateStructs(onerror);
}

/**
 true means little endian, false means big endian
 */
function setEndian$1(mode) {
  let ret = STRUCT_ENDIAN;

  setEndian(mode);

  return ret;
}

function getEndian() {
  return STRUCT_ENDIAN;
}

function setAllowOverriding(t) {
  return manager.allowOverriding = !!t;
}

function isRegistered(cls) {
  return manager.isRegistered(cls);
}

/** Register a class with nstructjs **/
function register(cls, structName) {
  return manager.register(cls, structName);
}

function unregister(cls) {
  manager.unregister(cls);
}

function inherit(child, parent, structName = child.name) {

  return STRUCT.inherit(...arguments);
}

/**
 @param data : DataView
 */
function readObject(data, cls, __uctx = undefined) {
  return manager.readObject(data, cls, __uctx);
}

/**
 @param data : Array instance to write bytes to
 */
function writeObject(data, obj) {
  return manager.writeObject(data, obj);
}

function writeJSON(obj) {
  return manager.writeJSON(obj);
}

function readJSON(json, class_or_struct_id) {
  return manager.readJSON(json, class_or_struct_id);
}

export { STRUCT, _truncateDollarSign, struct_binpack as binpack, struct_filehelper as filehelper, getEndian, inherit, isRegistered, manager, struct_parser as parser, struct_parseutil as parseutil, readJSON, readObject, register, setAllowOverriding, setDebugMode$1 as setDebugMode, setEndian$1 as setEndian, setTruncateDollarSign, setWarningMode$1 as setWarningMode, truncateDollarSign$1 as truncateDollarSign, struct_typesystem as typesystem, unpack_context, unregister, validateStructs, writeJSON, writeObject, write_scripts };
