import {ASTNode, traverse, visit, scopeWalk, walk} from '../core/ast.js';
import {sym, call, avar, binop, Sym, VarSym, ArrayVarSym, ValueSym} from './sym.js';
import {ArrayType, VarType} from '../core/types.js';
import {Precedence} from '../parser/parser.js';
import * as util from '../util/util.js';

let tag_idgen = 0;
let dolog = 1;

function log() {
  if (dolog) {
    console.log(...arguments);
  }
}

function logassign(type, a, b) {
  let msg = util.termPrint(util.termColor(`${type}: ${a} = ${b}`, "orange"));
  log(msg);
}

export class Differentiator {
  constructor(ctx, node) {
    this.ast = node;
    this.ctx = ctx;
    this.tag = Symbol("dvtag:" + tag_idgen);

    this.finalNode = undefined;
    tag_idgen++;
  }

  tagFinalNode(node) {
    node[this.tag] = true;
    this.finalNode = node;
  }

  buildTrees() {
    let ctx = this.ctx;

    function printScope(obj) {
      let s = "{\n";
      for (let k in obj) {
        s += `  ${k} : ${obj[k]},\n`;
      }
      s += "}\n";
      return s;
    }

    ctx.resetScopeStack();
    let stack = [];

    let MAXSTACK = 14;

    function _push(item) {
      log("push " + item);

      if (this.stack.length > MAXSTACK) {
        throw new Error("stack overflow");
      }

      stack.push(item);
    }

    function _pop() {
      let item = stack.pop();
      log("pop " + item);
      return item;
    }

    let funcs = {};

    let _state = {
      stack,
      scope: {},
      push : _push,
      pop  : _pop
    };

    function copyState(state) { //does not copy stack
      return {
        stack: state.stack,
        scope: Object.assign({}, state.scope),
        push : _push,
        pop  : _pop
      };
    }

    let scopestack = [];

    function pushState(state) {
      let tab = util.indent(scopestack.length);
      log(util.termColor(tab+"pushState", "green"));

      ctx.pushScope();
      let ret = copyState(state);

      scopestack.push(state);

      return ret;
    }

    function popState() {
      let tab = util.indent(scopestack.length-1);
      log(util.termColor(tab+"popState", "green"));

      let ret = scopestack.pop();
      ctx.popScope();

      return ret;
    }

    let symMap = new Map();

    let valtypes = new Set(["IntConstant", "FloatConstant"]);

    function getvname(node, state, visit) {
      if (typeof node === "number" || typeof node === "string") {
        return node;
      }

      if (node instanceof ASTNode && valtypes.has(node.type)) {
        return node.value;
      }

      if (node instanceof ASTNode && node.type === "Ident") {
        return getvname(node.value);
      }

      if (node instanceof VarType) {
        return getvname(node.getBaseName());
      }

      /*
      if (node instanceof ASTNode && node.type === "ArrayLookup") {
        let name = getvname(node[0]);
        let idx = getvname(node[1]);
        return `${name}[${idx}]`
      }*/

      return "<error>";
    }

    function getvar(n, state) {
      if (typeof n === "string") {
        return n in state.scope ? state.scope[n] : n;
      }

      if (n instanceof ASTNode && n.type === "Ident") {
        return getvar(n.value);
      }

      if (n instanceof VarSym) {
        let name = n.value;

        if (!(name in state.scope)) {
          return n;
        }

        if (n.idx instanceof ValueSym) {
          n.idx = n.idx.value;
        }

        if (n instanceof ArrayVarSym) {
          return state.scope[name][n.idx];
        } else {
          return state.scope[name];
        }
      } else if (n instanceof Sym) {
        return n;
      }

      return n; //sym("<error>");
    }

    let handlers = {
      BinOp(node, state, visit) {
        visit(state, node[0]);
        let a = getvar(state.pop(), state);

        visit(state, node[1]);

        let b = getvar(state.pop(), state);

        let bsym = binop(a, b, node.op);
        symMap.set(node, bsym);
        state.push(bsym);
      },
      FloatConstant(n, state, visit) {
        let s = sym(n.value);
        symMap.set(n, s);
        state.push(s);
      },
      IntConstant(n, state, visit) {
        let s = sym(n.value);
        symMap.set(n, s);
        state.push(s);
      },
      ArrayLookup(n, state, visit) {
        let name;

        if (n[0].type === "VarType") {
          name = n[0].getBaseName();
        } else {
          name = getvname(n[0], state, visit);
        }

        if (typeof name === "object" && name instanceof VarSym) {
          name = name.value;
        }

        visit(state, n[1]);
        let idx = state.pop();

        let s = avar(name, idx);

        symMap.set(n, s);
        state.stack.push(s);
      },
      BasicMemberLookup(n, state, visit) {
        ctx.error(n, "implement me!");
      },
      Assign(n, state, visit) {
        let a;

        visit(state, n[1]);
        let b = state.pop();

        if (n[0].type === "ArrayLookup") {
          visit(n[0]);
          a = state.stack.pop();
        } else {
          a = getvname(n[0], state, visit);
        }
        //visit(state, n[0]);
        //let a = state.pop();

        if (typeof a === "string") {
          a = sym(a);
        }

        if (!(a.value in state.scope)) {
          ctx.error(n, "Unknown variable " + a.value);
        }

        b = getvar(b, state);

        if (typeof b !== "object") {
          b = sym(b);
        }

        symMap.set(n, b);

        state.scope[a.value] = b;

        logassign("assign", a, b);
      },
      Ident(n, state, visit) {
        let s = sym(n.value);
        //s = getvar(s, state);

        symMap.set(n, s);
        state.push(s);
      },
      Call(n, state, visit) {
        let name;
        if (n[0].type === "VarType") {
          if (n[0].value instanceof ArrayType && n[0].value.alias) {
            name = n[0].value.alias;
          } else {
            name = n[0].value.getBaseName();
          }
        } else {
          //let name = n[0].value;
          visit(state, n[0]);
          name = state.stack.pop();
        }

        if (name instanceof VarSym) {
          name = name.value;
        }

        let args = [];
        for (let arg of n[1]) {
          if (typeof arg !== "object") {
            args.push(getvar(arg, state));
          } else {
            visit(state, arg);
            args.push(getvar(state.stack.pop(), state));
          }
        }

        if (ctx.builtinFuncs.has(name)) {
          let ret = call(name, args);
          symMap.set(n, ret);
          stack.push(ret);
        } else {
          let func = funcs[name];
          if (!func) {
            ctx.error(n, "Unknown function " + name);
          }
          state = pushState(state);
          state._calling = true;

          if (func[1].length !== args.length) {
            ctx.error(n, "Wrong number of arguments for " + func.value);
          }

          for (let i=0; i<func[1].length; i++) {
            let name = func[1][i].value;
            state.scope[name] = args[i];

            logassign("func param", name, args[i]);
          }

          log(printScope(state.scope));
          visit(state, func[2]);

          let val = state.stack.pop();

          log("----------->", ""+val, ""+state.scope[val]);

          symMap.set(n, val);
          stack.push(val);


          popState();
        }
      },
      Return(n, state, visit) {
        visit(state, n);

        if (n.length > 0) {
          let ret = state.pop();

          let idx = undefined;

          if (ret instanceof ASTNode && ret.type === "Ident") {
            ret = ret.value;
          } else if (ret instanceof ArrayVarSym) {
            ret = ret.value;
            idx = ret.idx;
          } else if (ret instanceof VarSym) {
            ret = ret.value;
          }

          if (typeof ret === 'string') {
            if (!(ret in state.scope)) {
              ctx.error(n, "Unknown variable " + ret);
            }

            ret = state.scope[ret];

            if (idx !== undefined) {
              ret = ret[idx];
            }
          }

          state.stack.push(ret);
        }
      },
      VarDecl(n, state, visit) {
        let type = n[0].value;
        let qual = "";
        if (typeof type === "object" && type.qualifier) {
          qual = type.qualifier.value;
        }
        let value;

        if (n.length > 1 && n[1].length > 0) {
          visit(state, n[1]);
          value = getvar(state.pop(), state);
        }

        if (value !== undefined) {
          log("Value:", ""+value, ":Value");
        }
        //set type system scope
        ctx.setScope(n.value, n[0]);

        if (value !== undefined) {
          logassign("declare", n.value, value);

          state.scope[n.value] = value;
          return;
        }

        let rec = (n, name) => {
          if (typeof n === "object" && n instanceof Array) {
            for (let i=0; i<n.length; i++) {
              n[i] = rec(n[i], `${name}[${i}]`);
            }
          } else {
            return name;
          }
        }

        type = ctx.resolveType(n[0].value);

        let zero = type.makeZero();
        if (qual === "in" || qual === "uniform") {
          if (typeof zero === "number") {
            zero = n.value;
          } else {
            rec(zero, n.value);
          }

          state.scope[n.value] = zero;

          logassign("declare", n.value, zero);
        } else {//IIRC glsl defaults to zero;
          state.scope[n.value] = zero;

          logassign("declare", n.value, zero);
        }
      },
      Function(node, state, visit) {
        state = pushState(state);

        funcs[node.value] = node;
        if (!state._calling) {
          visit(state, node[1]);
        }
        state._calling = false;

        visit(state, node[2]);

        popState();
      }
    };

    log("Traversing");
    traverse(this.ast, _state, handlers, dolog);

    let lines = [];

    for (let [node, sym] of symMap) {
      lines.push(node.lineStr());
    }

    lines.sort();
    lines.reverse()

    console.log(lines.join("\n"));
    console.log("\n" + this.finalNode.lineStr());

    let final = this.finalNode;
    if (symMap.has(final)) {
      let tree = symMap.get(final);
      console.log(""+tree);
      console.log("final");
    }

    this.symMap = symMap;
    process.exit()
  }

  run() {
    this.buildTrees();
  }
}

/** param should be a VarRef AST node */
export function dfAst(ctx, param) {
  let dvstate = new Differentiator(ctx, ctx.ast);

  console.log("Differentiating...");

  if (param.type !== "VarRef") {
    throw new Error("expected a VarRef for param");
  }

  //get final value
  let ast = ctx.ast;
  let main;
  for (let n of ast) {
    if (n.type === "Function" && n.value === "main") {
      main = n;
      break;
    }
  }

  if (!main) {
    throw new Error("no main function");
  }

  let node = undefined;

  let rec = (n) => {
    if (n.type === "Assign" && ASTNode.equalsVarRef(n[0], param)) {
      node = n;
    }

    for (let n2 of n) {
      rec(n2);
    }
  }

  rec(main)
  //console.log(""+node);

  //tag it
  dvstate.tagFinalNode(node);

  //interpret main function
  dvstate.run();
}