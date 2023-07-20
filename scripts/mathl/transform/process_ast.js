import {ASTNode, traverse, visit, scopeWalk, walk} from '../core/ast.js';
import * as util from '../util/util.js';

function exit() {
  process.exit(0);
}

function log() {
  //console.log(...arguments);
}

let typeConv = new Set([
  "float", "int", "bool"
]);

export const swizzlesizes = {
  1: "float",
  2: "vec2",
  3: "vec3",
  4: "vec4",
};

import {opnames} from '../core/state.js';

export const swizzlemap = {
  x: 0,
  y: 1,
  z: 2,
  w: 3,
  r: 0,
  g: 1,
  b: 2,
  a: 3,
  u: 0,
  v: 1,
  t: 2
};

export const swizzlecode = `

vec2 swizzle_vec3_xy(vec3 v) {
  return vec2(v[0], v[1]);
}
`;


function makeSwizzles2() {
  let map = {};
  let codeset = {};
  let codeget = {};

  let axes = "xyzw";

  let out = [];
  let out2 = [];

  let typemap = {
    2: 'vec2',
    3: 'vec3',
    4: 'vec4'
  };

  let rec = (s, axes2, axis, depth) => {
    if (depth < 0) {
      return "";
    }

    s += axes[axis];
    axes2.push(axis);

    let type = typemap[s.length];

    if (s.length > 1) {
      map[s] = axes2;

      let code2 = '';
      let code = type + "(";
      for (let i = 0; i < s.length; i++) {
        if (i > 0) {
          code += ", ";
        }

        code2 += `\$n1[${axes2[i]}] = $n2[${i}];\n`;
        code += `$n1[${axes2[i]}]`;
      }

      code += ")";

      codeget[s] = code + ";";
      codeset[s] = code2;
    }
    //out.push(s);
    //out.push(axes2);

    for (let i = 0; i < axes.length; i++) {
      let axes3 = axes2.concat([]);

      if (s.search(axes[i]) < 0) {
        rec(s, axes3, i, depth - 1);
      }
    }
    return s;
  }

  function gen(axesin) {
    axes = axesin;
    for (let i = 0; i < axes.length; i++) {
      rec("", [], i, axes.length);
    }
  }

  gen("xyzw");
  gen("rgba");
  gen("uvt");

  return {
    map,
    codeget,
    codeset
  };
}

export let swizzlemap2 = makeSwizzles2();

export function transformSwizzleSimple(ast, ctx) {
  scopeWalk(ast, ctx, {
    BasicMemberLookup(node, ctx) {
      let type = ctx.getScope("this");
      let member = node[1].value;

      if (node[1].type !== "Ident") {
        return;
      }

      if (!(member in swizzlemap)) {
        return; //not a simple swizzle
      }

      let idx = new ASTNode("IntConstant");
      node.copyPosTo(idx);

      idx.value = swizzlemap[member];

      let n2 = new ASTNode("ArrayLookup")

      n2.push(node[0]);
      n2.push(idx);

      node.copyPosTo(n2);
      node.copyPosTo(idx);

      let p = node.parent;

      let ntype = ctx.resolveType(swizzlesizes[member.length]);
      node.parent.ntype = ntype;
      n2.ntype = ntype;

      node.parent.replace(node, n2);

      //console.log(""+node");
      //console.log(node);
    }
  })
}

import {parse} from '../core/parser.js';
import {ArrayType, DynamicArrayType, VarType} from '../core/types.js';

export function transformSwizzleComplex(ast, ctx) {

  let typemap = {
    1: "float",
    2: "vec2",
    3: "vec3",
    4: "vec4"
  };

  scopeWalk(ast, ctx, {
    BasicMemberLookup(node, ctx) {

      let type = ctx.getScope("this");
      let member = node[1].value;

      //if (!type && node[0].type === "Ident") {
      //  type = ctx.resolveType(ctx.getScope(node[0].value));
      //}

      if (node[1].type !== "Ident") {
        return;
      }

      if (member.length < 2 || !(member in swizzlemap2.map)) {
        return; //not a simple swizzle
      }

      type = ctx.resolveType(typemap[member.length]);

      let axes = swizzlemap2.map[member];

      if (ASTNode.isAssign(node.parent) && node === node.parent[0]) {
        let val = node.parent[1];

        let op = node.parent.op;

        let v = ctx.placeVarDecl(node.parent, type);
        v._istemp = true;

        let id = new ASTNode("Ident");
        id.value = v.value;

        //node.parent.replace(node, id);
        let exprlist = new ASTNode("ExprList");

        let an = new ASTNode("Assign");
        an.op = op;
        an.push(id.copy())
        an.push(val);
        exprlist.push(an);

        for (let i = 0; i < member.length; i++) {
          let an = new ASTNode("Assign");

          an.op = op;
          let base = node[0].copy();
          let lookup = new ASTNode("ArrayLookup");
          lookup.push(base);
          lookup.push(axes[i]);

          an.push(lookup);

          lookup = new ASTNode("ArrayLookup")
          lookup.push(id.copy())
          lookup.push(i);

          an.push(lookup);

          exprlist.push(an);
        }

        node.parent.parent.replace(node.parent, exprlist);
      }
    }
  })

  scopeWalk(ast, ctx, {
    BasicMemberLookup(node, ctx) {
      let type = ctx.getScope("this");
      let member = node[1].value;

      if (node[1].type !== "Ident") {
        return;
      }

      if (member.length < 2 || !(member in swizzlemap2.map)) {
        return; //not a simple swizzle
      }

      let axes = swizzlemap2.map[member];

      if (!(ASTNode.isAssign(node.parent) && node === node.parent[0])) {
        let code = swizzlemap2.codeget[member];

        let n2 = parse(code, "Call", [node[0]], node.line, node.lexpos);
        //console.log(""+code, ""+n2)
        //process.exit();

        if (n2.type !== "Call") {
          throw new Error("internal parse error");
        }

        let ntype = ctx.resolveType(swizzlesizes[member.length]);
        //node.parent.ntype = ntype;
        //n2.ntype = ntype;

        node.parent.replace(node, n2);
      }
    }
  });
}

export function transformOps(ast, ctx) {
  function safeTypeGet(n) {
    if (n.ntype) {
      return n.ntype;
    }

    if (n.type === "Ident") {
      n.ntype = ctx.resolveType(ctx.getScope(n.value));
    } else if (n.type === "IntConstant") {
      n.ntype = ctx.resolveType("int");
    } else if (n.type === "FloatConstant") {
      n.ntype = ctx.resolveType("float");
    } else if (n.type === "VarType") {
      n.ntype = ctx.resolveType(n.value);
    } else if (n.type === "BoolConstant" || n.type === "BooleanConstant") {
      n.ntype = ctx.resolveType("bool");
    }

    return n.ntype;
  }

  let types = {
    float: ctx.resolveType("float"),
    vec2 : ctx.resolveType("vec2"),
    vec3 : ctx.resolveType("vec3"),
    mat4 : ctx.resolveType("mat4"),
    mat3 : ctx.resolveType("mat3"),
    int  : ctx.resolveType("int"),
    bool : ctx.resolveType("bool"),
  };

  scopeWalk(ast, ctx, {
    Assign(node, ctx) {
      if (node.op === "=") {
        return;
      }

      this.BinOp(node, ctx);
    },
    BinOp(node, ctx) {
      let isAssign = node.type === "Assign";

      let p = node;
      while (p) {
        if (p.type === "Function" && p.value.startsWith("_$_$_")) {
          return;
        }
        p = p.parent;
      }
      let t1 = safeTypeGet(node[0]);
      let t2 = safeTypeGet(node[1]);

      if (!t1 || !t2) {
        log("" + node);
        ctx.error(node, "Type system could not resolve types");
      }

      let isint1 = ctx.typesEqual(t1, types["int"]);
      let isint2 = ctx.typesEqual(t2, types["int"]);

      if (isint1 ^ isint2) {
        log("" + node);
        ctx.error(node, "Cannot do mixed math on integer and floats");
      }

      let isbase1 = ctx.typesEqual(t1, types["float"]) || ctx.typesEqual(t1, types["bool"]);
      let isbase2 = ctx.typesEqual(t2, types["float"]) || ctx.typesEqual(t1, types["bool"]);

      if (isbase1 && isbase2) {
        return;
      }

      let key = opnames[node.op];
      let key1 = t1.getTypeNameSafe();
      let key2 = t2.getTypeNameSafe();

      if (!key) {
        ctx.error(node, `Unsupported op ${node.op} for ${key1}/${key2}`);
      }

      //key = "_$_$_" + key + "_" + key1 + "_" + key2;
      key = `_$_$_${key}_${key1}_${key2}`;

      if (!key in ctx.poly_keymap) {
        ctx.error(node, "Unknown operator overload function " + key);
      }

      let id = new ASTNode("Ident");
      id.value = key;

      let call = new ASTNode("Call");

      call.ntype = t1.getComponents() > t2.getComponents() ? t1 : t2;
      call.push(id);

      let args = new ASTNode("ExprList");
      args.push(node[0]);
      args.push(node[1]);

      call.push(args);

      if (isAssign) {
        node.op = "=";
        node.replace(node[1], call);
      } else {
        node.parent.replace(node, call);
      }
    }
  }, false, true);

  //process.exit();
}

function getFinders(ctx, typemap, argmap) {
  function findType(n, ignoreCalls = false, arrDepth = 0) {
    if (n.type === "Ident") {
      return ctx.resolveType(ctx.scope[n.value]);
    } else if (n.type === "BinOp") {
      let t1 = findType(n[0], ignoreCalls, arrDepth);
      let t2 = findType(n[1], ignoreCalls, arrDepth);

      if (!t1 || !t2) {
        return undefined; //t1 ?? t2;
      }

      t1 = ctx.resolveType(t1);
      t2 = ctx.resolveType(t2);

      let n1 = t1.getComponents();
      let n2 = t2.getComponents();

      return n1 === 1 ? t2 : t1;
    } else if (ASTNode.isAssign(n)) {
      if (n.ntype) {
        return n.ntype;
      }
      return findType(n[0], ignoreCalls, arrDepth);
    } else if (n.type === "VarDecl") {
      return n[0];
    } else if (n.type === "ArrayLookup") {
      let type;

      type = findType(n[0], ignoreCalls, arrDepth - 1);

      if (!(type instanceof ArrayType) && !(type instanceof DynamicArrayType)) {
        log("type:", "" + type)
        ctx.error(n, "Not an array");
      }

      if (arrDepth > 0) {
        return ctx.resolveType(type);
      } else {
        return ctx.resolveType(type.type);
      }
    } else if (n.type === "Call") {
      if (typemap.has(n)) {
        return typemap.get(n);
      }
      if (ignoreCalls) {
        return;
      }

      Call(n, ctx, false);

      return typemap.get(n);
    } else if (n.type === "FloatConstant") {
      return ctx.getType("float");
    } else if (n.type === "IntConstant") {
      return ctx.getType("int");
    } else if (n.type === "UnaryOp") {
      return findType(n[0], ignoreCalls, arrDepth);
    } else if (n.type === "PostDec" || n.type === "PreDec" || n.type === "PostInc" || n.type === "PreInc") {
      return findType(n[0], ignoreCalls, arrDepth);
    }
  }

  function Call(node, ctx, process = true) {
    let name = node[0];
    let type;

    if (name.type === "VarType") {
      type = name.value;
      name = name.value.getTypeName();

      typemap.set(node, type);
    } else {
      name = name.value;

      if (node.parent) {
        type = findTypeUp(node.parent);
      }

      if (!type) {
        ctx.error(node, "Unknown type for function " + name);
      }
    }
    if (typeConv.has(name)) {
      name += "_cast";
    }

    let args = [];

    let i = 0;
    for (let arg of node[1]) {
      let type2 = ctx.resolveType(findType(arg));
      if (!type2) {
        log("" + arg.parent.parent.parent);
        ctx.error(arg, "Unknown type for argument " + (i + 1));
      }

      args.push(type2);

      i++;
    }

    type = ctx.resolveType(type);

    let key = ctx.buildPolyKey(name, type, args);

    if (!(key in ctx.functions)) {
      console.log("" + node.parent.parent)
      ctx.error(node, "Unknown function " + key);
    }

    argmap.set(node, args);
    typemap.set(node, type);
  }


  function buildPolyCandidates(p, idx=0) {
    let type;

    if (argmap.has(p)) {
      let ftype = argmap.get(p);

      return ftype[idx];
    }

    let candidates = [];

    let name = p[0];
    if (name.type === "VarType") {
      name = name.value.getTypeName();
    } else {
      name = name.value;
    }
    name = name.trim();

    if (typeConv.has(name)) {
      name += "_cast";
    }

    let fs = ctx.poly_namemap[name];
    if (fs && fs.size === 1) {
      for (let f of fs) {
        if (f.args.length !== p[1].length) {
          ctx.error(p, "Wrong number of function parameters for ", name);
        }

        p.ntype = f.type;

        for (let i = 0; i < p[1].length; i++) {
          p[1].ntype = f.args[i].ntype;
        }


        return [f];
      }
    }

    let funcs = ctx.poly_namemap[name];
    if (!funcs) {
      console.log("" + p);
      ctx.error(p, "Unknown function " + name);
    }

    let args = [];
    for (let arg of p[1]) {
      args.push(findType(arg, true));
    }

    let match;

    if (p.ntype !== undefined) {
      type = p.ntype;
    } else if (typemap.has(p)) {
      type = typemap.get(p);
    } else {
      //all candidates return types will be returned?
    }

    let resolveType = (n) => {
      if (typeof n === "string" || n instanceof VarType) {
        return ctx.resolveType(n);
      }

      if (n.type === "FloatConstant") {
        return resolveType("float");
      }
      if (n.type === "IntConstant") {
        return resolveType("int");
      }
      if (n.type === "BoolConstant" || n.type === "BooleanConstant") {
        return resolveType("bool");
      }

      if (n.type === "VarType") {
        return resolveType(n.value);
      }

      if (n.type === "Ident") {
        return resolveType(ctx.getScope(n.value));
      }

      if (n.ntype) {
        return resolveType(n.ntype);
      }

      if (n.type === "BinOp") {
        return resolveType(n[0]) || resolveType(n[1]);
      }
    }

    if (type) {
      type = ctx.resolveType(type);
    } else {
      type = findType(p, true);
    }

    for (let c of funcs) {
      if (type !== undefined && !ctx.typesEqual(type, c.type)) {
        continue;
      }
      if (c.args.length !== args.length) {
        continue;
      }

      let ok = true;
      let totmatch = 0;

      for (let i = 0; i < c.args.length; i++) {
        if (args[i] !== undefined && !ctx.typesEqual(args[i], c.args[i])) {
          ok = false;
          break;
        }

        if (args[i] !== undefined) {
          totmatch++;
        }
      }

      if (totmatch === c.args.length) {
        match = c;
      }

      if (ok) {
        candidates.push(Object.assign({totmatch}, c));
      }
    }

    candidates = candidates.filter(f => f.key in ctx.poly_keymap);

    return candidates;
  }

  function guessPolyFunc(p, idx) {
    let candidates = buildPolyCandidates(p, idx);

    if (idx < 0 || idx === undefined) {
      ctx.error(node, "Internal parser error");
    }


    let count = 0;
    for (let c of candidates) {
      if (c.totmatch === c.args.length) {
        count++;
      }
    }

    if (candidates.length === 0) {
      let key = name + "(";
      for (let i = 0; i < args.length; i++) {
        let arg = args[i];

        if (i > 0) {
          key += ", ";
        }

        if (!args) {
          key += "<unknown>";
        } else {
          key += arg.getTypeNameSafe();
        }
      }

      console.warn(node, "No overloaded function found for " + key);
    }
    if (count > 0) {
      let msg = "Ambiguous polymorphic function call; candidates are:\n"
      for (let c of candidates) {
        msg += "  " + c.key + "\n";
      }
      ctx.error(node, msg);
    }

    let match;

    if (count === 0) {
      candidates.sort((a, b) => b.totmatch - a.totmatch);
      match = candidates[0];
    }

    //XXX ideally we should branch the parser here and try each remaining candidate in turn
    if (!match) {
      console.log("" + node);
      ctx.error(node, "Failed to resolve polymorphic function call");
    }

    let type = ctx.resolveType(match.args[idx]);

    return type;
  }

  function findTypeUp(n) {
    let p = n;
    let type;
    let lastp = p;
    let lastp2 = p;

    //console.log("\n");

    let arrDepth = 0;

    while (p) {
      log(util.termColor(p.type, "green"));

      if (ASTNode.isAssign(p)) {
        if (p.ntype !== undefined) {
          return p.ntype;
        }
        type = findType(p, true, arrDepth);
        break;
      } else if (p.type === "Return") {
        type = ctx.getReturnType();
        break;
      } else if (p.type === "VarDecl") {
        type = p[0];
        break;
      } else if (p.type === "StatementList") {
        break;
      } else if (p.type === "ArrayLookup" && p[0] === lastp) {
        log(util.termColor("  left", "green"));

        arrDepth++;
      } else if (p.type === "ArrayLookup" && p[0] !== lastp) {
        log(util.termColor("  right", "green"));
        let type2 = findType(p[0], true);
        if (type2) {
          type = ctx.resolveType(type2);
        }

        if (type && arrDepth > 0) {
          return type;
        }

        //arrDepth++;
      } else if (p.type === "Call" && p !== n) {
        let idx = p[1].indexOf(lastp2);

        type = guessPolyFunc(p, idx);
        break;
      }

      lastp2 = lastp;
      lastp = p;
      p = p.parent;
    }

    return type;
  }

  return {findType, findTypeUp, Call, guessPolyFunc, buildPolyCandidates};
}

export function transformPolymorphism(ast, ctx) {
  let typemap = new Map();
  let argmap = new Map();
  let doneset = new Set();

  let {findType, buildPolyCandidates, findTypeUp, Call} = getFinders(ctx, typemap, argmap);

  scopeWalk(ast, ctx, {
    Call(node, ctx) {
      if (doneset.has(node)) {
        return;
      }

      let args = [];
      let type;

      let name = node[0];
      if (name.type === "VarType") {
        type = ctx.resolveType(name.value);
        name = name.value.getTypeNameSafe();
      } else {
        name = name.value;
        type = node.ntype;
      }
      if (typeConv.has(name)) {
        name += "_cast";
      }

      if (name.startsWith("_$_")) {
        doneset.add(node);
        return;
      }

      let count = 0;

      for (let arg of node[1]) {
        args.push(arg.ntype);
        if (arg.ntype) {
          count++;
        }
      }

      let bad = count === 0;
      let cs;

      if (!bad && count < args.length || !type) {
        cs = buildPolyCandidates(node, type);

        if (type && cs.length > 1) {
          bad = true;
        } else if (!type && cs.length > 1) {
          for (let func of cs) {
            func.totmatch = 0;

            for (let i = 0; i < args.length; i++) {
              let ok = args[i] !== undefined;
              ok = ok && ctx.typesEqual(args[i], func.args[i]);

              if (ok) {
                func.totmatch++;
              }
            }
          }

          cs = cs.filter(f => f.totmatch > 0);
          if (cs.length > 1) {
            let cs2 = cs.map(f => f.key).join("\n");
            ctx.error("Could not resolve polymorphic function; candidates were:" + cs2);
          }
        }
      }

      if (bad) {
        console.log("" + type);
        console.log(cs);
        console.log("" + node);
        ctx.error(node, "Could not resolve polymorphic function call");
      }

      let func;
      if (count === args.length && type) {
        //we can build key directly
        let key = ctx.buildPolyKey(name, type, args);
        func = ctx.poly_keymap[key];

        if (!func) {
          //console.log(""+node.parent.parent);
          ctx.error(node, "Unknown function " + name + " (" + key + ")");
        }
        log(key, func, "" + node)
      } else if (cs && cs.length === 1) {
        func = cs[0];
      } else { //should not happen;
        log(type, "" + node, cs)
        buildPolyCandidates(node, type);
        ctx.error(node, "internal parse error");
      }

      let n2 = new ASTNode("Ident");

      /*
      if (node.line > 999 && node.line < 1005) {
        console.log("\n\n\n");
        console.log(""+type);
        console.log(cs);
        console.log("\n");
        console.log(""+node);
        console.log(func);
        console.log(ctx.resolveType(func.type));
        console.log(ctx.resolveType(func.type).getTypeNameSafe());
        console.log("\n\n\n");
        //process.exit()
      }*/

      n2.value = func.key;

      node.ntype = ctx.resolveType(func.type);

      node.set(0, n2);
      node._haskey = true;

      doneset.add(node);
    }
  }, false, true);
}

export function initFuncKeyes(ast, ctx) {
  scopeWalk(ast, ctx, {
    Function(node, ctx) {
      let type = node[0].value;

      let args = [];
      for (let arg of node[1]) {
        args.push(arg[0].value);
      }

      if (node.value.startsWith("_$_")) {
        ctx.addFunc(node.value, type, args);
      } else {
        let key = ctx.buildPolyKey(node.value, type, args);
        node.polyKey = key;

        ctx.addPolyFunc(node.value, type, args);
      }
    }
  })
}

export function propagateTypes(ast, ctx, stage = 0) {
  let typemap = new Map();
  let argmap = new Map();

  let {findType, buildPolyCandidates, findTypeUp, Call} = getFinders(ctx, typemap, argmap);

  let found = false;

  function update(node, type) {
    if (!node.ntype || !ctx.typesEqual(type, node.ntype)) {
      log("Type update", "" + node.ntype, "" + type);
      found = true;
    }

    node.ntype = ctx.resolveType(type);
  }


  function findTypeSimple(n) {
    if (typeof n === "string") {
      return ctx.resolveType(n);
    }

    if (n.ntype) {
      return n.ntype;
    }

    if (n.type === "Ident") {
      return ctx.resolveType(ctx.scope[n.value]);
    }

    if (n.type === "VarType") {
      return ctx.resolveType(n.value);
    }

    if (n.type === "IntConstant") {
      return ctx.getType("int");
    }

    if (n.type === "FloatConstant") {
      return ctx.getType("float");
    }
  }

  scopeWalk(ast, ctx, {
    Assign(node, ctx) {
      let t1 = ctx.resolveType(findTypeSimple(node[0]));
      let t2 = ctx.resolveType(findTypeSimple(node[1]));

      if (t1) {
        update(node, t1);
        update(node[0], t1);

        if (!t2) {
          update(node[1], t1);
          node[1].ntype = t1;
        }
      }
    },
    Call(node, ctx) {
      let args = [];

      if (node._haskey) {
        return;
      }

      for (let arg of node[1]) {
        let type = findTypeSimple(arg);

        if (type) {
          update(arg, type);
        }
        args.push(type);
      }

      let name = node[0];
      if (name.type === "VarType") {
        let t1 = ctx.resolveType(name.value);
        if (t1) {
          update(node, t1);
        }

        name = name.value.getTypeName();
      } else {
        name = name.value;
      }

      let func;

      if (name.startsWith("_$_")) {
        func = ctx.poly_keymap[name];
      } else {
        let cs = buildPolyCandidates(node);
        if (cs.length === 1) {
          func = cs[0];
        }
      }

      if (func) {
        for (let i = 0; i < node[1].length; i++) {
          node[1].ntype = ctx.resolveType(func.args[i]);
        }

        let t = ctx.resolveType(func.type);

        if (!node.ntype || !ctx.typesEqual(t, node.ntype)) {
          node.ntype = t;
        }
      }
    },
    ArrayLookup(node, ctx) {
      let t1 = ctx.resolveType(findTypeSimple(node[0]));

      if (t1) {
        update(node, t1.type);
      }
    },
    BinOp(node, ctx) {
      let t1 = findTypeSimple(node[0]);
      let t2 = findTypeSimple(node[1]);

      if (t1 && t2) {
        t1 = ctx.resolveType(t1);
        t2 = ctx.resolveType(t2);

        let type = t1.getComponents() > t2.getComponents() ? t1 : t2;
        update(node, type);
      }
    },
    Return(node, ctx) {
      if (node.length === 0) {
        return;
      }

      let type = ctx.getReturnType() ?? findTypeSimple(node[0]);

      if (type) {
        update(node, type);
      }
    },
    UnaryOp(node, ctx) {
      let type = findTypeSimple(node[0]);
      if (type) {
        update(node, type);
      }
    },
    PostDec(node, ctx) {
      this.UnaryOp(node, ctx);
    },
    PreDec(node, ctx) {
      this.PostDec(node, ctx);
    },
    PostInc(node, ctx) {
      this.PostDec(node, ctx);
    },
    PreInc(node, ctx) {
      this.PreDec(node, ctx);
    }
  }, false, true);

  //console.log("FOUND", found);
}

export function transformAst(ast, ctx) {
  log("Processing AST tree. . .");

  transformSwizzleSimple(ast, ctx);
  transformSwizzleComplex(ast, ctx);

  //initialzie poly keys for function definitions
  initFuncKeyes(ast, ctx);

  if (1) {
    for (let i = 0; i < 3; i++) {
      propagateTypes(ast, ctx);
    }

    transformPolymorphism(ast, ctx);

    propagateTypes(ast, ctx);
    propagateTypes(ast, ctx);
    transformPolymorphism(ast, ctx);
    propagateTypes(ast, ctx);
    propagateTypes(ast, ctx);
  }

  transformOps(ast, ctx);
}
