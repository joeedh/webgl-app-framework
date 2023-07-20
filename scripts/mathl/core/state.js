import {termPrint, termColor} from '../util/util.js';
import {VarType, ArrayType} from './types.js';
import {PUTLParseError} from '../util/parseutil.js';


export const opnames = {
  "*" : "mul",
  "/" : "div",
  "-" : "sub",
  "+" : "add",
  "%" : "mod",
  "!=": "nequals",
  "==": "equals",
  ">=": "gequals",
  "<=": "lequals",
  ">" : "greater",
  "<" : "less",
  "^" : "bxor",
  "&" : "band",
  "|" : "bor",
  "+=" : "assign_plus",
  "-=" : "assign_minus",
  "*=" : "assign_mul",
  "/=" : "assign_div",
  "&=" : "assign_band",
  "|=" : "assign_bor",
  "^=" : "assign_bxor",
};

function exit(msg) {
  if (typeof process !== "undefined" && process.exit) {
    process.exit(-1);
  } else {
    throw new PUTLParseError(msg);
  }
}

export function formatLines(s, line = 0, lexpos = -1, col, count = 5) {
  s = s.split("\n");
  let out = '';

  let maxline = Math.ceil(Math.log(s.length)/Math.log(10));

  let start = Math.max(line - 2, 0);
  let end = Math.min(line + count, s.length);

  for (let i = start; i < end; i++) {
    let l = s[i];
    let si = "" + (i + 1);
    while (si.length < maxline) {
      si = " " + si;
    }

    if (i === line) {
      let l2 = '';
      for (let j = 0; j < l.length; j++) {
        let c = l[j];

        if (j >= col - 2 && j <= col + 2) {
          c = termColor(c, "red")
        }
        l2 += c;
      }

      l = l2;
    }

    l = termPrint(l);
    l = `  ${si}: ${l}`;

    //if (i === line) {
    //  l = termPrint(termColor(l, "red"));
    //}
    out += l + "\n";
  }

  return out;
}

//export const ParseFlags = {
//  IGNORE_SEMI : 1
//};
let castFuncs = new Set(["float", "int", "bool"]);

function isBrowser() {
  if (typeof window !== "undefined") {
    return window.navigator && window.document;
  } else if (typeof self !== "undefined") {
    return true;
  }

  return false;
}

export class ParseState {
  constructor(source, filename = "(anonymous)", parser, preprocessed = "") {
    this.parser = undefined;
    this.lexer = undefined;

    this.throwError = isBrowser();

    this.temp_idgen = 0;

    this.preprocessed = preprocessed;

    this.poly_namemap = {};
    this.poly_keymap = {};

    this.scope = {};
    this.localScope = {};

    this.scopestack = [];
    this.types = {};

    this.inputs = {};
    this.outputs = {};
    this.uniforms = {};

    this.functions = {};

    this.reset();

    this.source = source;
    this.filename = filename;

    this.builtinFuncs = new Set([
      "cos", "sin", "fract", "abs", "floor", "vec3", "vec2", "vec4", "mat4", "mat3", "float", "int",
      "sqrt", "log", "pow", "exp", "acos", "asin", "tan", "atan", "atan2", "normalize",
      "dot", "cross", "reflect", "step", "smoothstep", "int", "bool", "trunc"
    ]);

    //this.flag = 0;
  }

  get col() {
    return this.lexer ? this.lexer.lexpos - this.lexer.line_lexstart : -1;
  }

  get lexpos() {
    return this.lexer ? this.lexer.lexpos : -1;
  }

  get line() {
    return this.lexer ? this.lexer.linemap[this.lexer.lexpos] : -1;
  }

  newTempId() {
    return `$tmp${this.temp_idgen++}`;
  }

  placeVarDecl(n, type, name = this.newTempId()) {
    let ASTNode = n.constructor;

    let v = new ASTNode("VarDecl");
    v.value = name;

    type = this.resolveType(type);

    if (!type) {
      this.error(n, "Unknown type " + arguments[1]);
    }

    let tn = new ASTNode("VarType");
    tn.value = type;

    v.push(tn);

    if (n.type === "StatementList") {
      n.prepend(n);
      return v;
    }

    let p = n;
    let lastp = p;

    while (p) {
      if (p.type === "StatementList") {
        p.insert(p.indexOf(lastp), v);
        return v;
      }

      lastp = p;
      p = p.parent;
    }

    this.error(n, "Failed to place variable declaration");
  }

  addPolyFunc(name, rtype, args, type2) {
    if (type2 === "") {
      type2 = this.getType(type2);
    }
    if (rtype === "") {
      rtype = type2;
    }

    if (typeof name === "object") {
      if (name.constructor.name === "ASTNode") {
        if (name.type === "Ident") {
          name = name.value;
        } else if (name.type === "VarType") {
          name = name.value.getTypeNameSafe();
        }
      } else if (name instanceof VarType) {
        name = name.getTypeNameSafe();
      }
    }
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "") {
        args[i] = type2;
      }
    }

    rtype = this.resolveType(rtype);

    let key = this.buildPolyKey(name, rtype, args, type2);

    this.poly_keymap[key] = {
      name, args, type: rtype, key
    };

    if (!(name in this.poly_namemap)) {
      this.poly_namemap[name] = new Set();
    }

    this.poly_namemap[name].add({
      type: rtype,
      args,
      key,
      name
    });

    this.addFunc(name, rtype, args, key);
  }

  addFunc(name, rtype, args, key = name) {
    args = args.filter(f => typeof f === "string" ? this.getType(f) : f);
    if (typeof type === "string") {
      rtype = this.getType(name);
    }

    this.functions[key] = {
      type: rtype,
      args,
      name,
      key
    };
  }

  copy() {
    let p = new ParseState(this.source, this.filename, undefined, this.preprocessed);

    p.parser = this.parser ? this.parser.copy() : undefined;
    p.lexer = this.parser ? this.parser.lexer : undefined;

    p.scope = Object.assign({}, this.scope);
    p.localScope = Object.assign({}, this.localScope);
    p.scopestack = this.scopestack.map(f => Object.assign({}, f));
    p.types = Object.assign({}, this.types);
    p.inputs = Object.assign({}, this.inputs);
    p.outputs = Object.assign({}, this.outputs);
    p.uniforms = Object.assign({}, this.uniforms);

    p.filename = this.filename;
    p.source = this.source;

    return p;
  }

  buildPolyKey(name, rtype, args, type2) {
    if (type2 && typeof type2 === "string") {
      type2 = this.getType(type2);
    }

    if (typeof rtype === "string") {
      rtype = rtype === "" ? type2 : this.getType(rtype);
    }

    if (typeof name === "object") {
      if (name.constructor.name === "ASTNode") {
        if (name.type === "VarType") {
          name = name.value;
        } else if (name.type === "Ident") {
          name = name.value;
        } else {
          this.error(name, "Bad type node");
        }
      }

      if (typeof name === "object" && name instanceof VarType) {
        name = name.getTypeNameSafe();
      }
    }

    let key = `_$_${name}_${rtype.getTypeNameSafe()}_`;

    let t = rtype.getTypeNameSafe();

    let nonfloat = !castFuncs.has(t);

    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] === "string") {
        if (args[i] === "") {
          args[i] = type2;
        } else {
          args[i] = this.getType(args[i]);
        }
      }

      let tname = args[i].getTypeNameSafe();

      nonfloat = nonfloat || !castFuncs.has(tname);

      key += tname;
    }

    if (!nonfloat && !this.hasType(name)) {
      //return name;
    }
    return key;
  }

  resetScopeStack() {
    this.scopestack.length = 0;
    this.localScope = {};
    this.scope = {};

    let lists = [this.inputs, this.outputs, this.uniforms];
    for (let list of lists) {
      for (let k in list) {
        this.setScope(k, list[k]);
      }
    }

    return this;
  }

  reset() {
    this.scopestack = [];
    this.poly_keymap = {};
    this.poly_namemap = {};
    this.functions = {};
    this.constructors = {};
    this.types = {};
    this.localScope = {};
    this.scope = {};

    this.inputs = {};
    this.outputs = {};
    this.uniforms = {};

    this.addType(new VarType("void"), "void");

    let f = this.addType(new VarType("float"), "float");
    let i = this.addType(new VarType("int"), "int");
    let b = this.addType(new VarType("bool"), "bool");
    let v2 = this.addType(new ArrayType(f, 2, "vec2"), "vec2");
    let v3 = this.addType(new ArrayType(f, 3, "vec3"), "vec3");
    let v4 = this.addType(new ArrayType(f, 4, "vec4"), "vec4");
    let m3 = this.addType(new ArrayType(v3, 3, "mat3"), "mat3");
    let m4 = this.addType(new ArrayType(v4, 4, "mat4"), "mat4");


    let keys = [
      "", "float", "vec2", "vec3", "vec4"
    ];

    let sizes = {
      "float": 1,
      "int"  : 1,
      "bool" : 1,
      "vec2" : 2,
      "vec3" : 3,
      "vec4" : 4
    };

    let out = [];
    let visit = new Set();

    let push = (list) => {
      let listkey = JSON.stringify(list);
      if (!visit.has(listkey)) {
        visit.add(listkey);
        out.push(list);
      }
    }
    let getsize = (f) => {
      let size = 0;
      for (let item of f) {
        size += sizes[item];
      }
      return size;
    }

    let rec = (a, size = a, lst = [], depth = 0) => {
      if (a <= 0 || a > size) {
        return [];
      }

      if (depth > size) {
        return [keys[a]];
      }

      if (getsize(lst) === size) {
        push(lst);
      }

      for (let i = 1; i <= size; i++) {
        let lst2 = lst.concat([keys[i]]);

        rec(i, size, lst2, depth + 1);
      }
    }

    let constructors = {};

    for (let i = 1; i <= 4; i++) {
      out.length = 0;
      rec(i);

      let key = keys[i];
      key = this.getType(key);


      for (let args of out) {
        let key2 = this.buildPolyKey(key, key, args, key);
        this.addPolyFunc(key, key, args, key);

        constructors[key2] = [keys[i], args];
      }
    }

    this.constructors = constructors;

    for (let i = 2; i <= 4; i++) {
      let key = "vec" + i;

      this.addPolyFunc("normalize", "", ["", ""], key);
      this.addPolyFunc("dot", "float", ["", ""], key);
      this.addPolyFunc("cross", "", ["", ""], key);
    }

    this.addPolyFunc("atan2", "float", ["float", "float"], "float");

    for (let i = 0; i < 2; i++) {
      let key = i ? "mat4" : "mat3";
      this.addPolyFunc("invert", "", [""], key);
      this.addPolyFunc("transpose", "", [""], key);
    }

    for (let key of keys) {
      if (key === "") {
        continue;
      }

      this.addPolyFunc("exp", "", [""], key);
      this.addPolyFunc("abs", "", [""], key);
      this.addPolyFunc("min", "", ["", ""], key);
      this.addPolyFunc("max", "", ["", ""], key);
      this.addPolyFunc("fract", "", [""], key);
      this.addPolyFunc("step", "", ["", ""], key);
      this.addPolyFunc("pow", "", ["", ""], key);
      this.addPolyFunc("sin", "", [""], key);
      this.addPolyFunc("cos", "", [""], key);
      this.addPolyFunc("asin", "", [""], key);
      this.addPolyFunc("acos", "", [""], key);
      this.addPolyFunc("atan", "", [""], key);
      this.addPolyFunc("tan", "", [""], key);
      this.addPolyFunc("floor", "", [""], key);
      this.addPolyFunc("ceil", "", [""], key);
      this.addPolyFunc("mod", "", [""], key);
      this.addPolyFunc("sqrt", "", [""], key);
      this.addPolyFunc("pow", "", [""], key);
      this.addPolyFunc("log", "", [""], key);
    }

    this.addPolyFunc("trunc", "int", ["int"], "int");

    return this;
  }

  error(node, msg) {
    //console.log(node)

    if (!node) {
      console.error(`\nError: ${msg}`);
    } else {
      console.warn(this);
      console.warn(formatLines(this.source, node.line, node.lexpos, node.col, 45));

      let s = `\nError: ${this.filename}:${node.line + 1}: ${msg}`;
      console.error(s + "\n");
    }

    if (this.throwError) {
      throw new Error("Error: " + msg);
    } else {
      exit(-1);
    }
  }

  getType(name) {
    return this.types[name];
  }

  setReturnType(t) {
    this.setScope("$__return__$", t);
  }

  getReturnType(t) {
    return this.getScope("$__return__$");
  }

  setScope(k, v) {
    this.localScope[k] = v;
    this.scope[k] = v;
  }

  resolveType(t) {
    if (typeof t === "string") {
      t = this.getType(t);
    }

    if (!(t instanceof VarType)) {
      if (typeof t === "object" && t.type === "VarType") {
        t = t.value;
      }

      if (typeof t === "object" && t.type === "Ident") {
        t = t.value;
      }
    }

    if (typeof t === "object" && t instanceof VarType) {
      let name = t.getTypeName();
      if (!(name in this.types)) {
        this.error(arguments[0], "Unknown type " + name);
      }

      let t2 = this.types[name];
      if (t2 instanceof ArrayType && !(t instanceof ArrayType)) {
        return t2;
      }

      return t;
    }

    if (typeof t === "object" && t.type === "VarRef") {
      let vref = t;
      if (vref[0] instanceof ArrayType) {
        return this.resolveType(vref[0].type);
      } else {
        return this.resolveType(vref[0]);
      }
    }
  }

  typesEqual(a, b) {
    if (a === undefined || b === undefined) {
      console.log("A:" + a, "B:" + b);
      throw new Error("undefined arguments to typesEqual");
    }

    a = this.resolveType(a);
    b = this.resolveType(b);

    if (!a) {
      console.log("" + a);
      this.error(undefined, "bad type " + arguments[0]);
    }

    if (!b) {
      console.log("" + b);
      this.error(undefined, "bad type " + arguments[1]);
    }

    if (!a || !b) {
      return false;
    }
    return a.getTypeName() === b.getTypeName();
  }

  getScope(k) {
    return this.resolveType(this.scope[k]);
  }

  hasType(name) {
    return name in this.types;
  }

  addType(type, name) {
    this.types[name] = type;
    return type;
  }

  pushScope() {
    this.scopestack.push([this.scope, this.localScope]);
    this.localScope = {};
    this.scope = Object.assign({}, this.scope);
  }

  popScope() {
    [this.scope, this.localScope] = this.scopestack.pop();
  }
}

let statestack = [];

export let state = new ParseState();

export function pushParseState(source = state.source, filename = state.filename, parser, preprocessed) {
  statestack.push(state);

  state = new ParseState(source, filename, parser, preprocessed);

  return state;
}

export function popParseState() {
  state = statestack.pop();
}

export function genLibraryCode() {
  let s = '';

  let names = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];

  let builtins = {
    cos  : 1,
    sin  : 1,
    sqrt : 1,
    exp  : 1,
    log  : 1,
    floor: 1,
    ceil : 1,
    abs  : 1,
    min  : 2,
    max  : 2,
    acos : 1,
    asin : 1,
    atan : 1,
    fract: 1,
  };
  let ctx = new ParseState();

  let keys = ["float", "vec2", "vec3", "vec4", "int", "bool"];
  let sizemap = {
    int  : 1,
    bool : 1,
    float: 1,
    vec2 : 2,
    vec3 : 3,
    vec4 : 4
  };

  function genMathFunc(name, args, type) {
    let size = sizemap[type];

    let ntype = ctx.resolveType(type);
    args = [].concat(args);

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "") {
        args[i] = ntype;
      } else {
        args[i] = ctx.resolveType(args[i]);
      }
    }

    let key = ctx.buildPolyKey(name, ntype, args, ntype);
    s += `${ntype.getTypeNameSafe()} ${key}(`;

    let tname = ntype.getTypeNameSafe();

    let i = 0;
    for (let arg of args) {
      if (i > 0) {
        s += ", "
      }

      s += `${arg.getTypeNameSafe()} ${names[i]}`;
      i++;
    }
    s += ') {\n';

    s += `  ${tname} r;\n`;

    for (let j = 0; j < size; j++) {
      s += `  r[${j}] = `

      let s2 = `${name}(`;
      for (let i = 0; i < args.length; i++) {
        if (i > 0) {
          s2 += ", ";
        }
        s2 += names[i];
        if (ctx.typesEqual(args[i], ntype)) {
          s2 += `[${j}]`;
        }
      }
      s2 += `);\n`

      s += s2;
    }

    s += `  return r;\n`;
    s += '}\n';
  }

  for (let k in builtins) {
    let v = builtins[k];
    let args;

    if (typeof v === "number") {
      args = [];
      for (let i = 0; i < v; i++) {
        args.push("");
      }
    } else {
      args = v;
    }

    for (let key of keys) {
      if (key === "float" || key === "int" || key === "bool") {
        continue;
      }
      genMathFunc(k, args, key);
    }
  }

  for (let key of keys) {
    if (key === "float" || key === "int" || key === "bool") {
      continue;
    }

    genMathFunc("pow", ["", ""], key);
    genMathFunc("pow", ["float", ""], key);
    genMathFunc("pow", ["", "float"], key);
    genMathFunc("step", ["", ""], key);
    genMathFunc("step", ["float", ""], key);
    genMathFunc("step", ["", "float"], key);
  }

  let transformAssignOp = (op) => {
    if (op.length === 2 && op.endsWith("=") && op !== "==" && op !== "!=" && op !== ">=" && op !== "<=") {
      op = op[0];
    }
    return op;
  }

  for (let op in opnames) {
    let name = opnames[op];

    op = transformAssignOp(op);

    s += `
  int _$_$_int_${name}_int_int(int a, int b) {
    return trunc(a ${op} b);
  }
  int _$_$_${name}_int_int(int a, int b) {
    return trunc(a ${op} b);
  }
  
  `;
  }


  for (let key of keys) {
    if (key === "float" || key === "int" || key === "bool") {
      continue;
    }

    for (let op in opnames) {
      let name = opnames[op];
      if (op === "**" || op === "%") {
        continue;
      }

      op = transformAssignOp(op);

      s += `${key} _$_$_${name}_${key}_${key}(${key} a, ${key} b) {\n`
      s += `  ${key} r;\n`;

      let size = sizemap[key];

      for (let i = 0; i < size; i++) {
        s += `  r[${i}] = a[${i}] ${op} b[${i}];\n`;
      }
      s += `\n  return r;\n`;
      s += `}\n`
    }

    for (let op in opnames) {
      let name = opnames[op];
      if (op === "**" || op === "%") {
        continue;
      }

      for (let step = 0; step < 2; step++) {
        if (step) {
          s += `${key} _$_$_${name}_float_${key}(float a, ${key} b) {\n`;
        } else {
          s += `${key} _$_$_${name}_${key}_float(${key} a, float b) {\n`;
        }
        s += `  ${key} r;\n`;
        for (let i = 0; i < sizemap[key]; i++) {
          if (step) {
            s += `  r[${i}] = a ${op} b[${i}];\n`;
          } else {
            s += `  r[${i}] = a[${i}] ${op} b;\n`;
          }
        }
        s += `  return r;\n`;
        s += "}\n";
      }
    }
  }

  for (let k in ctx.constructors) {
    let [type, args] = ctx.constructors[k];
    args = args.map(f => f.getTypeNameSafe());

    s += `${type} ${k}(`;

    for (let i = 0; i < args.length; i++) {
      if (i > 0) {
        s += ", ";
      }

      s += `${args[i]} ${names[i]}`;
    }

    s += `) {\n  ${type} r;\n`;

    let i = 0;
    let size = sizemap[type];
    let ai = 0;
    let aj = 0;
    let arg = args[ai];

    for (let i = 0; i < size; i++) {
      if (arg === "float" || arg === "int" || arg === "bool") {
        s += `  r[${i}] = ${names[ai]};\n`;
        aj++;
      } else {
        s += `  r[${i}] = ${names[ai]}[${aj++}];\n`;
      }

      if (aj >= sizemap[arg]) {
        ai++;
        aj = 0;
        arg = args[ai];
      }
    }

    s += "  return r;\n"
    s += "}\n";
  }

  s += `
  
int int_cast(float f) {
  return f;
}

int int_cast(int f) {
  return f;
}

float float_cast(float f) {
  return f;
}

float float_cast(int f) {
  return f;
}

float float_cast(bool b) {
  return b ? 1.0 : 0.0;
}

bool bool_cast(float f) {
  return f != 0.0;
}

bool bool_cast(bool b) {
  return b;
}

bool bool_cast(int i) {
  return i != 0;
}
  
vec4 _$_$_mul_mat4_vec4(mat4 m, vec4 v) {
  vec4 r;
  
  r[0] = m[0][0]*v[0] + m[1][0]*v[1] + m[2][0]*v[2] + m[3][0]*v[3];
  r[1] = m[0][1]*v[0] + m[1][1]*v[1] + m[2][1]*v[2] + m[3][1]*v[3];
  r[2] = m[0][2]*v[0] + m[1][2]*v[1] + m[2][2]*v[2] + m[3][2]*v[3];
  r[3] = m[0][3]*v[0] + m[1][3]*v[1] + m[2][3]*v[2] + m[3][3]*v[3];
  
  return r;
}

`;

  //console.log(ctx.
  //console.log(s, s.length);
  //process.exit();
  return s;
}

export const libraryCode = genLibraryCode();

