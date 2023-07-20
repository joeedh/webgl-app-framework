import * as parseutil from '../util/parseutil.js';
import * as util from '../util/util.js';
import {ASTNode} from './ast.js';
import {ParseState} from './state.js';
import {strong, stronglog, log, termColor, termPrint} from '../util/util.js';
import '../generators/all.js';
import {transformAst} from '../transform/process_ast.js';
import {initParser, getParser} from '../parser/parser.js';

let indent = util.indent;

function exit() {
  process.exit();
}

export {preprocess} from '../parser/preprocessor.js';
import {preprocess} from '../parser/preprocessor.js';

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

import {printobj} from './parser.js';

import {VarType, ArrayType} from './types.js';
import {CodeGenerator} from '../generators/generator_base.js';

import {parse_intern} from './parser.js';
import * as state from './state.js';

import {traverse, walk} from './ast.js';

export function findSlots(ctx, ast) {
  walk(ast, {
    VarDecl(n) {
      if (n.length === 0) {
        return;
      }

      let type = n[0];

      if (type) {
        type = type.value;
      }
      if (type) {
        type = type.qualifier;
      }

      if (type && typeof type !== "string" && type.type === "TypeQualifier") {
        type = type.value;
      }

      if (type && typeof type === "string") {
        type = type.trim();
      }

      if (type === "uniform") {
        ctx.uniforms[n.value] = n;
      } else if (type === "in") {
        ctx.inputs[n.value] = n;
      } else if (type === "out") {
        ctx.outputs[n.value] = n;
      }
    }

  });

  //console.log(ctx.uniforms, ctx.inputs, ctx.outputs);
}

import {libraryCode} from './state.js';

let compiledLibraryCode = undefined;

const lskey = "_mathl_library_code";
const libraryCodeVersion = 9;

function saveLibraryCode() {
  let s = JSON.stringify(compiledLibraryCode);
  if (typeof JSZip !== "undefined") {
    let s2 = '';

    for (let b of JSZip.deflate(s)) {
      s2 += String.fromCharCode(b);
    }

    s = btoa(s2);
  }

  localStorage[lskey] = s;
}

function loadLibraryCode() {
  let buf = localStorage[lskey];

  if (typeof JSZip !== "undefined") {
    buf = atob(buf);
    buf = JSZip.inflate(buf);

    let s = '';
    for (let b of buf) {
      s += String.fromCharCode(b);
    }

    buf = s;
  }

  let json = JSON.parse(buf);

  if (json.version !== libraryCodeVersion) {
    throw new Error("Bad stdlib version; will have to recompile. . .");
  }

  let node = new ASTNode();

  node.loadJSON(json);
  compiledLibraryCode = node;
}

function getLibraryCode() {
  const lskey = "_mathl_library_code";
  if (lskey in localStorage) {
    try {
      loadLibraryCode();
      return compiledLibraryCode;
    } catch (error) {
      console.error(error.stack);
      console.error(error.message);
      console.error("error loading saved builtin library nodes");
    }
  }

  let parser = getParser();
  state.pushParseState(libraryCode, "ibrary", undefined, libraryCode);
  state.popParseState();

  state.state.parser = parser;
  parser.lexer.line_lexstart = 0;
  state.state.lexer = parser.lexer;

  compiledLibraryCode = parser.parse(libraryCode);
  compiledLibraryCode.version = libraryCodeVersion;

  saveLibraryCode();

  return compiledLibraryCode;
}

export function parse(src, filename) {
  let ret;

  try {
    let src2 = preprocess(src);
    let parser = getParser();

    if (!compiledLibraryCode) {
      compiledLibraryCode = getLibraryCode();
    }

    state.pushParseState(src, filename, undefined, src2);
    //ret = parse_intern(src, state.state);

    state.state.parser = parser;
    parser.lexer.line_lexstart = 0;
    state.state.lexer = parser.lexer;

    let ast = parser.parse(src2);
    let ast2 = new ASTNode("Program");
    for (let node of compiledLibraryCode) {
      ast2.push(node.copy());
    }

    for (let node of ast) {
      ast2.push(node);
    }

    ast = ast2;

    findSlots(state.state, ast);

    ret = state.state;
    ret.ast = ast;

    if (0) {
      //XXX
      state.state.throwError = true;
      try {
        transformAst(ret.ast, ret);
      } catch (error) {
        console.error("parse error");
      }
    } else {
      transformAst(ret.ast, ret);
    }
    //parser.printTokens(src);

    state.popParseState();
  } catch (error) {
    state.popParseState();
    //util.print_stack(error);
    throw error;
  }

  return ret;
}

export function genCode(ctx, type, args={}) {
  let cls = CodeGenerator.getGenerator(type);
  let gen = new cls(ctx, args);

  return gen.genCode();
}

export function genJS(ctx, args={}) {
  return genCode(ctx,'js', args);
}

export {silence, unsilence} from '../util/util.js';

window._parseGlsl = parse;

export function compileJS(code, filename) {
  let ctx = parse(code, filename);
  let code2 = genJS(ctx);

  var program;

  try {
    eval(code2);
  } catch (error) {
    console.log(code2);

    console.error(error.stack);
    console.error(error.message, error);
    throw error;
  }

  let ret = program();

  ret.sourceState = ctx;
  ret.sourceCode = code2;
  return ret;
}
window._compileJS = compileJS;


