import * as parseutil from '../path.ux/scripts/util/parseutil.js';
import * as util from '../path.ux/scripts/util/util.js';

function exit() {
  process.exit();
}

let tk = (n, r, f) => new parseutil.tokdef(n, r, f);

function strong() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    s += arguments[i] + " ";
  }

  return util.termColor(s, "red");
}

function stronglog() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    if (i > 0) {
      s += ' ';
    }

    s += arguments[i];
  }

  console.log(util.termPrint(strong(s)));
}

function log() {
  let s = '';

  for (let i = 0; i < arguments.length; i++) {
    if (i > 0) {
      s += ' ';
    }
    s += arguments[i];
  }

  console.log(util.termPrint(s));
}


let count = (str, match) => {
  let c = 0;
  do {
    let i = str.search(match);
    if (i < 0) {
      break;
    }

    c++;

    str = str.slice(i + 1, str.length);
  } while (1);

  return c;
}


let keywords = new Set([
  "in", "out", "uniform", "if", "else", "while", "do", "for", "return",
  "switch", "default", "case", "break", "continue", "struct", "function"
]);

let tokens = [
  tk("ID", /[a-zA-Z$_]+[a-zA-Z0-9$_]*/, (t) => {
    if (keywords.has(t.value)) {
      t.type = t.value.toUpperCase();
    }

    return t;
  }),
  tk("NUM", /-?[0-9]+(\.[0-9]*)?/, t => {
    t.origValue = ""+t.value;
    t.value = parseFloat(t.value);

    return t;
  }),
  tk("LPAREN", /\(/),
  tk("RPAREN", /\)/),
  tk("STRLIT", /"[^"]*"/, (t) => { // /".*(?<!\\)"/ <- not working outside of Chrome
    let v = t.value;
    t.lexer.lineno += count(t.value, "\n");
    return t;
  }),
  tk("WS", /[ \t\n\r]/, (t) => {
    t.lexer.lineno += count(t.value, "\n");
    //drop token by not returning it
  }),
  tk("COMMA", /\,/),
  tk("COLON", /:/),
  tk("LSBRACKET", /\[/),
  tk("RSBRACKET", /\]/),
  tk("LBRACE", /\{/),
  tk("RBRACE", /\}/),
  tk("DOT", /\./),
  tk("PLUS", /\+/),
  tk("MINUS", /\-/),
  tk("TIMES", /\*/),
  tk("DIVIDE", /\//),
  tk("EXP", /\*\*/),
  tk("LAND", /\&\&/),
  tk("BAND", /\&/),
  tk("LOR", /\|\|/),
  tk("BOR", /\|/),
  tk("EQUALS", /=/),
  tk("LEQUALS", /\<\=/),
  tk("GEQUALS", /\>\=/),
  tk("LTHAN", /\</),
  tk("GTHAN", /\>/),
  tk("MOD", /\%/),
  tk("XOR", /\^/),
  tk("BITINV", /\~/),
  tk("SEMI", /;/)
];

let lex = new parseutil.lexer(tokens, (t) => {
  console.log("Token error");
  return true;
});

let parser = new parseutil.parser(lex);

let binops = new Set([
  ".", "/", "*", "**", "^", "%", "&", "+", "-", "&&", "||", "&", "|", "<",
  ">", "==", "=", "<=", ">="//, "(", ")"
]);

let precedence;

if (1) {
  let table = [
    ["call"],
    ["array"],
    ["."],
    ["**"],
    ["*", "/"],
    ["+", "-"],
    ["="],
    //["("],
    //[")"],
//    [","],
//    ["("]
  ]

  let pr = {};
  for (let i = 0; i < table.length; i++) {
    for (let c of table[i]) {
      pr[c] = i;
    }
  }

  precedence = pr;
}


function indent(n, chr = "  ", color = "blue") {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += chr;
  }

  return util.termColor(s, color);
}

export class Node extends Array {
  constructor(type) {
    super();
    this.type = type;
    this.parent = undefined;
  }

  push(n) {
    n.parent = this;
    return super.push(n);
  }

  remove(n) {
    let i = this.indexOf(n);

    if (i < 0) {
      console.log(n);
      throw new Error("item not in array");
    }

    while (i < this.length) {
      this[i] = this[i + 1];
      i++;
    }

    n.parent = undefined;
    this.length--;

    return this;
  }

  insert(starti, n) {
    let i = this.length - 1;
    this.length++;

    if (n.parent) {
      n.parent.remove(n);
    }

    while (i > starti) {
      this[i] = this[i - 1];
      i--;
    }

    n.parent = this;
    this[starti] = n;

    return this;
  }

  replace(n, n2) {
    if (n2.parent) {
      n2.parent.remove(n2);
    }

    this[this.indexOf(n)] = n2;
    n.parent = undefined;
    n2.parent = this;

    return this;
  }

  toString(t = 0) {
    let tab = indent(t, "-");

    let typestr = this.type;

    if (this.value !== undefined) {
      typestr += " : " + this.value;
    } else if (this.op !== undefined) {
      typestr += " (" + this.op + ")";
    }

    let s = tab + typestr + " {";

    if (this.length === 0) {
      s += "}\n";
    } else {
      s += "\n"
      for (let c of this) {
        s += c.toString(t + 1);
      }
      s += tab + "}\n";
    }

    if (t === 0) {
      s = termColor(s, "cyan")
    }

    return s;
  }
}

let primtypes = new Set(["number", "boolean", "string", "symbol"])

function printobj(obj) {
  if (primtypes.has(typeof obj)) {
    return "" + obj;
  }

  if (obj.toString && obj.toString !== Object.prototype.toString) {
    return obj.toString();
  }

  let s = '{\n'
  for (let k in obj) {
    s += `  ${k}:  ${printobj(obj[k])},\n`;
  }
  s += '}\n';

  return s;
}

export function printcode(ctx) {
  let outs = '';
  function out(s) {
    outs += s;
  }


  for (let k in ctx.uniforms) {
    let n = ctx.uniforms[k];
    let type = n[0];

    let init = "0";
    let setter = `    ${k} = val;`

    if (type.value instanceof ArrayType) {
      setter = '';

      init = "[";
      for (let i=0; i<type.value.size; i++) {
        if (i > 0) {
          init += ",";
        }

        setter += `    ${k}[${i}] = val[${i}]\n`;

        init += "0";
      }
      init += "]"
    }


    let s = `
  
  let ${k} = ${init};
  function __set${k}(val) {
${setter}
  }
    `.trim();
    out("  " +s + "\n\n")
  }

  outs = "function() {\n  let __outs;\n\n" + outs;

  let outmap = {};
  let oi = 0;

  for (let k in ctx.outputs) {
    outmap[k] = oi++;
  }
  let totoutput = oi;

  let ast = ctx.ast;
  let tlvl = 1;

  function rec(n) {
    if (n.type === "BinOp") {
      let paren = false;

      if (n.parent && n.parent.type === "BinOp") {
        paren = n.parent.prec < n.prec;
      }

      if (paren) {
        out("(");
      }
      rec(n[0]);
      out(' ' + n.op + ' ');
      rec(n[1]);
      if (paren) {
        out(")");
      }
    } else if (n.type === "Ident") {
      if (n.value in ctx.outputs) {
        out(`__outs[${outmap[n.value]}]`)
      } else {
        out(n.value);
      }
    } else if (n.type === "Call") {
      rec(n[0]);
      out("(");
      rec(n[1])
      out(")");
    } else if (n.type === "ExprList") {
      let i = 0;
      for (let n2 of n) {
        if (i > 0) {
          out(", ");
        }

        rec(n2);
        i++;
      }
    } else if (n.type === "Number") {
      out(n.value);
    } else if (n.type === "Function") {
      out(indent(tlvl) + `function ${n.value}(`);
      let i = 0;

      for (let c of n[1]) {
        if (i > 0) {
          out(", ");
        }
        out(c.value)
        i++;
      }
      out(") {\n");

      tlvl++;
      rec(n[2]);
      tlvl--;

      out(indent(tlvl) + "}\n");
    } else if (n.type === "StatementList") {
      for (let c of n) {
        out(indent(tlvl));
        rec(c)
        out(";\n");
      }
    } else {
      for (let n2 of n) {
        rec(n2);
      }
    }
  }

  rec(ast);


  outs += "  let __$func = function(outs";

  for (let k in ctx.inputs) {
    outs += ", " + k;
  }
  outs += ") {\n";

  let footer = `
    __outs = outs;
    main();

  `.trim();

  out("    " + footer + "\n");

  outs += "  }\n";

  outs += '  return {\n    call : __$func,\n';

  function buildType(t) {
    if (t instanceof VarType) {
      return t.type;
    } else if (t instanceof ArrayType) {
      return t.name;
    }
    return t;
  }
  for (let k in ctx.uniforms) {
    outs += `    get ${k}() {return ${k}},\n`;
    outs += `    set ${k}(val) {__set${k}(val)},\n`;

  }

  let os1 = `    outputs: {\n`;
  let os2 = `    outputTypes: {\n`;
  for (let k in ctx.outputs) {
    let type = buildType(ctx.outputs[k][0].value);
    os1 += `      ${k} : ${outmap[k]},\n`;
    os2 += `      ${k} : "${type}",\n`;
  }

  os1 += '    },\n';
  os2 += '    },\n';


  outs += os1 + os2;

  outs += `    outputCount: ${totoutput}\n`;
  outs += '  }\n';

  outs += '}\n';
  return outs;
}

export class VarType {
  constructor(type) {
    this.type = type;
  }

  toString() {
    return `VarType(${this.type})`;
  }
}

export class ArrayType extends VarType {
  constructor(type, size) {
    super();

    this.type = type;
    this.size = size;
  }

  toString() {
    return `ArrayType(${this.type, this.size})`;
  }
}

export class ParseContext {
  constructor() {
    this.scope = {};
    this.localScope = {};

    this.scopestack = [];
    this.types = {};

    this.inputs = {};
    this.outputs = {};
    this.uniforms = {};

    this.addType(new VarType("void"), "void");

    let f = this.addType(new VarType("float"), "float");
    let i = this.addType(new VarType("int"), "int");
    let b = this.addType(new VarType("bool"), "bool");
    let v2 = this.addType(new ArrayType(f, 2), "vec2");
    let v3 = this.addType(new ArrayType(f, 3), "vec3");
    let v4 = this.addType(new ArrayType(f, 4), "vec4");
    let m3 = this.addType(new ArrayType(v3, 3), "mat3");
    let m4 = this.addType(new ArrayType(v4, 4), "mat4");
  }

  getType(name) {
    return this.types[name];
  }

  setScope(k, v) {
    this.localScope[k] = v;
    this.scope[k] = v;
  }

  getScope(k) {
    return this.scope[k];
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

export function parse(s) {
  let ctx = new ParseContext();

  let p = parser;

  let binstack = [];
  let tablvl = 0;

  let idstack = [];
  let idgen = 1;
  let curid = 0;

  let flvl = 0;

  function _dolog() {
    let s = '';
    for (let i = 0; i < arguments.length; i++) {
      if (i > 0) {
        s += ' ';
      }

      s += arguments[i];
    }

    s = strong(s);
    s = indent(flvl, '=', 'blue') + s;

    let s2 = "" + curid;
    while (s2.length < 2) {
      s2 = " " + s2;
    }
    s = "" + s2 + "" + s

    let t = p.peek_i(0);
    let tv;

    if (t) {
      tv = "" + t.value;
      while (tv.length < 2) {
        tv = " " + tv;
      }
    } else {
      tv = "  ";
    }
    s = "" + tv + " " + s;

    return s;
  }

  function logstart() {
    idstack.push(curid);
    curid = idgen++;

    let ret = _dolog(...arguments);

    flvl++;
    log(ret);

    return ret;
  }

  function logend() {
    curid = idstack.pop();

    if (curid === undefined) {
      throw new Error("log stack error");
    }

    flvl--;
    let ret = _dolog("End", ...arguments);
    log(ret);
    return ret;
  }

  function Value(t) {
    if (t === undefined) {
      t = p.next();
    }

    while (t && t.type === "RPAREN") {
      t = p.next();
    }

    if (t === undefined) {
      p.error(undefined, "Expected a value");
      return;
    }

    let n = new Node();
    n.value = t.value;

    if (t.type === "ID") {
      n.type = "Ident";
    } else if (t.type === "NUM") {
      n.type = "Number";
    } else if (t.type === "STRLIT") {
      n.type = "StrLit";
    } else if (t.type === "MINUS") {
      let t2 = p.peek_i(0);
      if (t2 && t2.type === "NUM") {
        p.next();
        n.type = "Number";
        n.value = -t2.value;
      } else if (t2 && t2.type === "ID") {
        p.next();
        n.type = "Negate";

        let n2 = new Node();

        n2.type = "Ident"
        n2.value = t2.value;
        n.push(n2);
      } else {
        p.error(t, "Expected a value, not '" + t.value + "'");
      }
    } else {
      p.error(t, "Expected a value, not '" + t.value + "'");
    }

    return n;
  }

  function expectInt() {
    let t = p.next();

    if (t.type !== "NUM" || t.origValue.search(/\./) >= 0) {
      p.error(n, "Expected an integer");
    }

    let n = new Node("Number");
    n.value = t.value;

    return n;
  }

  function ArrayLookup() {
    logstart("ArrayLookup");

    let id = Value();

    p.expect("LSBRACKET");

    let n = new Node("ArrayLookup");

    n.push(id);
    n.push(expectInt());
    p.expect("RSBRACKET");

    logend("ArrayLookup");
    return n;
  }

  function FunctionCall() {
    logstart("FunctionCall");
    let id = Value();

    let n = new Node("Call");

    //p.expect("LPAREN");
    let args;

    if (p.peek_i(1).type === "RPAREN") {
      args = new Node("ExprList");
    } else {
      args = Expr();

      if (args.type !== "ExprList") {
        let n2 = new Node("ExprList");
        n2.push(args);
        args = n2;
      }
    }
    //p.expect("RPAREN");

    n.push(id);
    n.push(args);

    logend("FunctionCall");
    return n;
  }

  function bin_next(depth = 0) {
    let a = p.peek_i(0);
    let b = p.peek_i(1);

    logstart("bin_next", a ? a.value : undefined, b ? b.value : undefined);

    if (b && b.type === "LSBRACKET") {
      let ret = ArrayLookup();

      logend("bin_next0");
      return ret;
    } else if (b && b.type === "LPAREN") {
      //function call
      let ret = FunctionCall();

      logend("bin_next1a");
      return ret;
    }
    if (a && a.type === 'LPAREN') {
      let ret = Expr();

      logend("bin_next1");
      return ret;
    }

    if (b && b.type === "RPAREN") {
      let ret = Value();
      p.next();
      logend("bin_next1b");
      return ret;
    }

    if (a && a.type === 'RPAREN') {
      p.next();
      let next = bin_next(depth);
      console.log("BINEXT", next);
      exit()

      logend("bin_next2");
      return next;

      b.type = a.type;
      b.value = a.value;
      p.next();

      let c = p.peek_i(2);
      if (c && binops.has(c.value)) {
        logend("bin_next3");
        return {
          value     : b,
          op        : c.value,
          prec      : -100,
          parenclose: true
        }
      }
    }

    if (b && binops.has(b.value)) {
      logend("bin_next4");
      return {
        value     : a,
        op        : b.value,
        prec      : precedence[b.value],
        parenclose: false
      }
    } else {
      if (!a) {
        p.error(undefined, "BinOp parse error");
      }

      let ret = Value();
      logend("bin_next5");
      return ret;
      //return Value(a);
    }
  }

  function BinOp(left, depth = 0) {
    let op = p.next();
    let right;

    logstart("BinOp", op);

    let n;
    let prec = precedence[op.value]

    let t = p.peek_i(0);
    if (t && t.type === "RPAREN") {
      logend("BinOp1", op);
      return left;
    } else if (!t) {
      logend("BinOp2", op);
      return left;
    }

    let r = bin_next(depth + 1);

    if (r instanceof Node) {
      right = r;
    } else {
      if (r.prec > prec) {
        if (!n) {
          n = new Node("BinOp")
          n.op = op.value;
          n.prec = precedence[op.value];
          n.push(left);
        }

        n.push(Value())

        logend("BinOp3", op);
        return n;
      } else {
        if (r && r.parenclose) {
          console.log("R", printobj(r), "R");
          console.log("" + left, "op", "" + op, "op")
          console.log("" + right);

          console.log("N", "" + n);
          console.log(bin_next());
          exit();

          //right = Value(r.value);
          n = new Node();
          n.op = r.op;
          n.prec = precedence[r.op];
          //n.right
        } else {
          right = BinOp(Value(), depth + 2);
        }
      }
    }

    n = new Node("BinOp", op);

    n.op = op.value;
    n.prec = precedence[op.value];

    n.push(left);
    n.push(right);

    logend("BinOp4", op ? op.value : undefined);

    return n;

  }

  function Expr() {
    logstart("Expr");

    let t = p.peek_i(0);

    if (t && t.type === "LPAREN") {
      p.next();
      let ret = Expr();
      //p.expect("RPAREN");

      logend("Expr1");
      return ret;
    }

    let ret = Start();
    logend("Expr2");
    return ret;
  }

  function Start() {
    tablvl++;

    logstart("Start");

    let ret = Value();

    while (!p.at_end()) {
      let t = p.peek_i(0);
      //log(indent(tablvl+1," ", "orange"), "token:", t);
      //log(""+ret)
      //let n = p.peek_i(1);

      if (t === undefined) {
        break;
        //return Value();
      }

      //console.log(t.type)
      if (t.type === "LPAREN") {
        log("" + ret);
        throw new Error("lparen");
      }
      //console.log(t.toString()) //, n.toString())

      if (binops.has(t.value)) {
        ret = BinOp(ret);
      } else if (t.value === ",") {
        let n = new Node();
        n.type = "ExprList";

        p.next();

        n.push(ret);
        let n2 = Expr();
        if (n2.type === "ExprList") {
          for (let c of n2) {
            n.push(c);
          }
        } else {
          n.push(n2);
        }

        tablvl--;
        logend("Start1");
        return n;
      } else if (t.type === "RPAREN") {
        //logend("Start2");
        log("" + ret);
        let t2 = p.peek_i(1);

        p.next();
        return ret;

        if (t2 && t2.value && binops.has(t2.value)) {
          ret = BinOp(ret);
        } else {
          logend("Start2");
          return ret;
        }

        log("t", "" + t2);

        logend("Start2b");
        return ret;
      } else if (t.type === "SEMI") {
        if (!ret) {
          ret = new Node("NullStatement");
        }
        return ret;
      } else {
        console.log("T", "" + t);
        let n = Value()
        ret.push(n);

        logend("Start3");
        return ret;
        //ret = Value();
        //break;
        log(ret.toString())
        p.error(t, "Unexpected token " + t.value);
      }
    }

    logend("Start4");

    tablvl--;
    return ret;
  }

  function TypeOpt() {

  }

  function VarType() {
    logstart("VarType");

    let type = p.expect("ID");

    if (!ctx.hasType(type)) {
      p.error(p.peek_i(0), "Unknown type " + type);
    }

    let n = new Node("Type");
    n.value = ctx.getType(type);

    logend("VarType");
    return n;
  }

  function VarDecl() {
    logstart("VarDecl");

    let type = VarType();

    console.log("TYPE", ""+type);

    let id = p.expect("ID");

    let n = new Node("VarDecl");
    n.push(type);
    n.value = id;
    n.modifiers = new Set();

    logend("VarDecl");

    return n;
  }

  function Statement() {
    logstart("Statement");

    let t = p.peeknext();

    if (!t) {
      p.error(undefined, "Statement error");
    }

    let ret = undefined;

    if (t.type === "ID" && ctx.hasType(t.value)) {
      let id = t.value;

      ret = VarDecl();
    } else if (t.type === "ID") {
      ret = Expr();
    }

    log(ret)
    p.expect("SEMI");

    if (ret === undefined) {
      ret = new Node("NullStatement");
    }

    logend("Statement");
    return ret;
  }

  function FunctionDef() {
    let type = VarType();
    let name = p.expect("ID");

    p.expect("LPAREN");

    let fn = new Node("Function");
    fn.value = name;

    fn.push(type);
    let args = new Node("ExprList");

    fn.push(args);

    ctx.pushScope();

    while (!p.at_end()) {
      let t = p.peeknext();

      if (t.type === "RPAREN") {
        break;
      } else if (t.type === "COMMA") {
        p.next();
        continue;
      }

      let type = VarType();
      let id = p.expect("ID");

      let n = new Node("VarDecl");
      n.value = id;
      n.push(type);

      ctx.setScope(id, type);

      args.push(n);
    }

    p.expect("RPAREN");
    p.expect("LBRACE");

    let body = StatementList();
    fn.push(body);

    p.expect("RBRACE");

    ctx.popScope();
    return fn;
  }

  function StatementList() {
    let n = new Node("StatementList");
    while (!p.at_end()) {
      let t = p.peek_i(0);

      if (t && t.type === "RBRACE") {
        break;
      }

      let n2 = Statement();
      n.push(n2);
    }
    return n;
  }
  function isType(t) {
    return t && t.type === "ID" && ctx.hasType(t.value);
  }

  function isInt(t) {
    return t && t.type === "NUM" && t.value === Math.floor(t.value);
  }

  function isFuncDefNext() {
    let t1 = p.peek_i(0);
    let t2 = p.peek_i(1);
    let t3 = p.peek_i(2);

    let ok = isType(t1);

    if (t2 && t2.value === "LSBRACKET") {
      let t4 = p.peek_i(3);
      let t5 = p.peek_i(4);
      let t6 = p.peek_i(5);
      ok = ok && t3 && isInt(t3);
      ok = ok && t4 && t4.value === "RSBRACKET";
      ok = ok && t5 && t5.type === "ID" && !isType(t5);
      ok = ok && t6 && t6.type === "LPAREN";
    } else {
      ok = ok && t2 && t2.type === "ID" && !isType(t2);
      ok = ok && t3 && t3.type === "LPAREN";
    }

    log(t1, t2, t3, isType(t1));
    log("isFuncDefNext:", ok);

    return ok;
    //let ok = t1 &&
  }
  function TopStatement() {
    logstart("TopStatement");

    let t = p.peeknext();

    if (t.type === "IN" || t.type === "OUT" || t.type === "UNIFORM") {
      let modifier = t.value;
      p.next();

      let ret = VarDecl();
      ret.modifiers.add(modifier);

      let map;
      if (t.type === "IN") {
        map = ctx.inputs;
      } else if (t.type === "OUT") {
        map = ctx.outputs;
      } else {
        map = ctx.uniforms;
      }

      if (ret.value in map || ret.value in ctx.scope) {
        p.error(t, ret.value + " is already declared");
      }

      ctx.scope[ret.value] = ret;
      map[ret.value] = ret;

      p.expect("SEMI");

      logend("TopStatement1");
      return ret;
    } else if (isFuncDefNext()) {
      let ret = FunctionDef();
      logend("TopStatement2");
      return ret;
    } else {
      let ret = Statement();
      logend("TopStatement3");
      return ret;
    }
  }

  function Run() {
    let ret = [];

    ctx.ast = new Node("Program");

    while (!p.at_end()) {
      logstart("Run");
      ctx.ast.push(TopStatement());
      logend("Run");
    }

    return ctx.ast;
  }

  p.errfunc = (tok) => {
    log(ctx.ast);
    return true;
  }

  p.start = Run;
  p.parse(s);

  return ctx;

  /*
  lex.input(s);
  let t = lex.next();
  while (t) {
    console.log(t.toString());
    t = lex.next();
  }
  //*/
}
