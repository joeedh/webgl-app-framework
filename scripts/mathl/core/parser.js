import * as state from './state.js';
import * as parseutil from '../util/parseutil.js';
import * as util from '../util/util.js';
import * as cconst from './const.js';
import {ASTNode} from './ast.js';
import {indent, strong, stronglog, log, termColor, termPrint} from '../util/util.js';

globalThis.count =function count(s, chr) {
  let ci=0;

  for (let i=0; i<s.length; i++) {
    if (s[i] === chr) {
      ci++;
    }
  }

  return ci;
}

let tk = (id, re, func) => new parseutil.tokdef(id, re, func);

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
  tk("ASSIGNPLUS", /\+=/),
  tk("ASSIGNMINUS", /-=/),
  tk("LPAREN", /\(/),
  tk("RPAREN", /\)/),
  tk("STRLIT", /"[^"\n\r]*"/, (t) => { // /".*(?<!\\)"/ <- not working outside of Chrome
    return t;
  }),
  tk("NL", /[\n\r]/, (t) => {
    if (t.value === "\n") {
      t.lexer.lineno++;
      t.lexer.line_lexstart = t.lexer.lexpos;
    }
    //drop token by not returning it
  }),
  tk("WS", /[ \t]/, (t) => {
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

export let lexer = new parseutil.lexer(tokens, (t) => {
  console.log("Token error");
  return true;
});

let _parser = new parseutil.parser(lexer);


let binops = new Set([
  ".", "/", "*", "**", "^", "%", "&", "+", "-", "&&", "||", "&", "|", "<",
  ">", "==", "<=", ">=", "=", "+=", "-="//, "(", ")"
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
    ["=", "+=", "-="],
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


let primtypes = new Set(["number", "boolean", "string", "symbol"])

export function printobj(obj) {
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


import {getParser} from '../parser/parser.js';

/*
export function setSlots(ctx, ast) {
  let bad = new Set([
    "StatementList", "Function", "StructDecl"
  ]);

  let rec = (n) => {
    if (n.type === "VarDecl") {
      console.log(""+n);
      process.exit()
    }

    for (let n2 of n) {
      //if (!bad.has(n2.type)) {
        rec(n2);
      //}
    }
  }

  console.log("setSlots");
  console.log(ast.type);
  process.exit()
  let n = ast;
  if (n.type === "Program") {
    for (let n2 of n) {
      if (n2.type === "StatementList") {
        for (let n3 of n2) {
          rec(n3);
        }
      } else {
        rec(ast);
      }
    }
  } else if (n.type === "StatementList") {
    for (let n2 of n) {
      rec(n2);
    }
  }
}*/

export function parse_intern(src, ctx=state.state) {
  let ret;

  let parser = getParser();

  state.state.parser = parser;
  parser.lexer.line_lexstart = 0;
  state.state.lexer = parser.lexer;

  let ast = parser.parse(src);

  if (ast) {
    //setSlots(state, ast);
  }

  ret = state.state;
  ret.ast = ast;
  //parser.printTokens(src);
  return ret;
}

export function parse_intern_old(s, ctx=state.state, start="Run") {
  let p = parser.copy();

  ctx._parser = p;
  ctx.lexer = p.lexer;
  ctx.lexer.line_lexstart = 0;

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
      //t = p.next();
    }

    if (t === undefined) {
      p.error(undefined, "Expected a value");
      return;
    }

    let n = new ASTNode();
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

        let n2 = new ASTNode();

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

    let n = new ASTNode("Number");
    n.value = t.value;

    return n;
  }

  function ArrayLookup(id=Value()) {
    logstart("ArrayLookup");

    p.expect("LSBRACKET");

    let n = new ASTNode("ArrayLookup");

    n.push(id);
    n.push(expectInt());
    p.expect("RSBRACKET");

    logend("ArrayLookup");
    return n;
  }

  function FunctionCall(id=Value()) {
    logstart("FunctionCall");

    let n = new ASTNode("Call");

    //p.expect("LPAREN");
    let args;

    if (p.peek_i(1).type === "RPAREN") {
      args = new ASTNode("ExprList");
    } else {
      args = Expr();

      if (args.type !== "ExprList") {
        let n2 = new ASTNode("ExprList");
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
      //p.next();
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

    if (r instanceof ASTNode) {
      right = r;
    } else {
      if (r.prec > prec) {
        if (!n) {
          n = new ASTNode("BinOp")
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
          n = new ASTNode();
          n.op = r.op;
          n.prec = precedence[r.op];
          //n.right
        } else {
          right = BinOp(Value(), depth + 2);
        }
      }
    }

    n = new ASTNode("BinOp", op);

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
        ret = FunctionCall(ret);
        log("" + ret);
        return ret;
        //throw new Error("lparen");
      } else if (t.type === "LSBRACKET") {
        ret = ArrayLookup(ret);
        t = p.peeknext();
      }
      //console.log(t.toString()) //, n.toString())

      if (binops.has(t.value)) {
        ret = BinOp(ret);
      } else if (t.type === "COMMA") {
        let n = new ASTNode();
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

        t = p.peeknext();
        if (t.type === "RPAREN") {
        //  p.next();
        }

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
          ret = new ASTNode("NullStatement");
        }
        return ret;
      } else {
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

    let n = new ASTNode("Type");
    n.value = ctx.getType(type);

    logend("VarType");
    return n;
  }

  function VarDecl() {
    logstart("VarDecl");

    let type = VarType();

    let t = p.peeknext();
    if (t && t.type === "LPAREN") {
      let id = type;
      if (id.type !== "Ident") {
        id = new ASTNode("Ident");
        id.value = type.value.getTypeName();
      }

      return FunctionCall(id);
    }

    let id = p.expect("ID");

    let n = new ASTNode("VarDecl");
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

    p.expect("SEMI");

    if (ret === undefined) {
      ret = new ASTNode("NullStatement");
    }

    logend("Statement");
    return ret;
  }

  function FunctionDef() {
    logstart("FunctionDef");

    let type = VarType();
    let name = p.expect("ID");

    p.expect("LPAREN");

    let fn = new ASTNode("Function");
    fn.value = name;

    fn.push(type);
    let args = new ASTNode("ExprList");

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

      let n = new ASTNode("VarDecl");
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
    logend("FunctionDef");
    return fn;
  }

  function StatementList() {
    logstart("StatementList");

    let n = new ASTNode("StatementList");
    while (!p.at_end()) {
      let t = p.peek_i(0);

      if (t && t.type === "RBRACE") {
        break;
      }

      let n2 = Statement();
      n.push(n2);
    }

    logend("StatementList");
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

    ctx.ast = new ASTNode("Program");

    while (!p.at_end()) {
      logstart("Run");
      ctx.ast.push(TopStatement());
      logend("Run");
    }

    return ctx.ast;
  }

  function Intern() {
    logstart("Intern");
    let ret = new ASTNode("StatementList");

    while (!p.at_end()) {
      if (isFuncDefNext()) {
        ret.push(FunctionDef())
      } else {
        ret.push(Statement());
      }

      while (p.optional("SEMI")) {

      }
    }

    if (ret.length === 1) {
      ret = ret[0];
    }

    ctx.ast = ret;
    logend("Intern");
  }

  p.errfunc = (tok) => {
    log(ctx.ast);
    return true;
  }

  let starts = {
    Run, Statement, Expr, TopStatement, FunctionDef, StatementList, Intern
  };

  Run.Statement = Statement;
  Run.TopStatement = TopStatement;
  Run.Expr = Expr;

  p.start = starts[start];
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

import {internalCodeGen} from '../generators/internal.js';

export function parse(src, startNode, args, lineOff=0, lexposOff=0, column=0) {
  let src2 = '';
  let argi = 0;

  if (startNode !== undefined && startNode.constructor === Array) {
    column = lexposOff ?? 0;
    lexposOff = lineOff ?? 0;
    lineOff = args ?? 0;
    args = startNode;
    startNode = undefined;
  }

  for (let i=0; i<src.length; i++) {
    let c = src[i];
    let n = src[Math.min(i+1, src.length-1)];
    let n2 = src[Math.min(i+2, src.length-1)];
    let n3 = src[Math.min(i+3, src.length-1)];

    if (c === "$" && (n === "s" || n === "n")) {
      let ai = argi;

      if (!isNaN(parseInt(n2))) {
        n2 = parseInt(n2);
        ai = n2-1;
        i++;
      } else {
        argi++;
      }

      let sub = args[ai];
      if (typeof sub === "object" && sub instanceof ASTNode) {
        sub = internalCodeGen.genCode(sub);
      }

      src2 += sub;
      i += 1;
    } else {
      src2 += c;
    }
  }

  util.silence();

  console.log(src2);

  src2 = `
  void __TAG__() {
    ${src2}
  }
  `;

  state.pushParseState(src2,"internal");
  let ret = parse_intern(src2, undefined).ast;
  state.popParseState();

  let found = false;

  let findtag = (n) => {
    if (found) {
      return;
    }

    if (n.type === "Function" && n.value === "__TAG__") {
      ret = n[2];
      found = true;
      return;
    }

    for (let n2 of n) {
      findtag(n2);
    }
  }

  findtag(ret);

  util.unsilence();

  let retnode;
  let find = (n) => {
    if (retnode) {
      return;
    }

    if (n.type === startNode) {
      retnode = n;
      return;
    }

    for (let n2 of n) {
      find(n2);
    }
  }

  let rec = (n) => {
    n.line = lineOff;
    n.lexpos = lexposOff;
    n.col = column;

    for (let n2 of n) {
      rec(n2);
    }
  }

  if (startNode) {
    find(ret);
  } else {
    retnode = ret;
  }

  if (retnode && retnode.type === "Program" && startNode !== "Program") {
    retnode.type = "StatementList";
  }

  if (retnode) {
    rec(retnode);
  }

  return retnode;
}

//util.silence();

function test() {
  let ast = parse_intern(`ssss(1, 2);`).ast;
  console.log(internalCodeGen.genCode(ast))
//util.unsilence();

  parse(`
void main() {
  point.x += $n1;
  point.z += $s2;
}
`, "Call", [ast, "b"]);

}
