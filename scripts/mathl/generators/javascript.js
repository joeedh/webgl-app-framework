import {ArrayType, VarType} from '../core/types.js';
import * as util from '../util/util.js';
import {CodeGenerator} from './generator_base.js';
import {strong, indent, stronglog, log, termColor, termPrint} from '../util/util.js';

export let jslib = `
  let fract = function(f) { return f - Math.floor(f);};
  let abs = Math.abs, sin = Math.sin, cos = Math.cos, log = Math.log, pow = Math.pow;
  let acos = Math.acos, asin = Math.asin, atan = Math.atan, atan2 = Math.atan2;
  let sqrt = Math.sqrt, exp = Math.exp, min = Math.min, max = Math.max, floor = Math.floor;
  let ceil = Math.ceil;

  function cachering(func, count) {
    this.list = new Array(count);
    this.length = count;
    
    for (let i=0; i<this.length; i++) {
      this.list[i] = func();
    }
    
    this.cur = 0;
  }
  
  cachering.prototype = Object.create(Object.prototype);
  cachering.prototype.next = function() {
      let ret = this.list[this.cur];
      
      this.cur = (this.cur + 1) % this.length;
      return ret;
  };
  cachering.prototype.push = function() {
    return this[this.cur++];
  };
  cachering.prototype.pop = function() {
    return [this.cur--];
  };
  
  let vec2cache = new cachering(() => [0, 0], 2048);
  
  let vec3cache = new cachering(() => [0, 0, 0], 2048);
  let vec4cache = new cachering(() => [0, 0, 0, 0], 2048);
  let mat3cache = new cachering(() => [[0,0,0], [0,0,0], [0,0,0]], 2048);
  let mat4cache = new cachering(() => [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]], 2048);

  let vec2stack = new cachering(() => [0, 0], 128);
  let vec3stack = new cachering(() => [0, 0, 0], 128);
  let vec4stack = new cachering(() => [0, 0, 0, 0], 128);
  let mat3stack = new cachering(() => [[0,0,0], [0,0,0], [0,0,0]], 128);
  let mat4stack = new cachering(() => [[0,0,0,0], [0,0,0,0], [0,0,0,0], [0,0,0,0]], 128);
    
`

export class JSGenerator extends CodeGenerator {
  constructor(ctx, args) {
    super(ctx, args)
  }

  static generatorDefine() {
    return {
      typeName: "js"
    }
  }

  genCode(ast=this.ctx.ast) {
    let ctx = this.ctx;

    let outs = '';

    function out(s) {
      outs += s;
    }


    let inputs = '';
    for (let k in ctx.inputs) {
      if (inputs.length > 0) {
        inputs += ", ";
      } else {
        inputs = "let ";
      }

      inputs += k;
    }
    if (inputs.length > 0) {
      inputs += ";";
    }

    for (let k in ctx.uniforms) {
      let n = ctx.uniforms[k];
      let type = n[0];

      let init = "0";
      let setter = `    ${k} = val;`

      if (type.value instanceof ArrayType) {
        setter = '';

        init = "[";
        for (let i = 0; i < type.value.size; i++) {
          if (i > 0) {
            init += ",";
          }

          setter += `    ${k}[${i}] = val[${i}];\n`;

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
      out("  " + s + "\n\n")
    }

    outs = `${jslib}
    
    program = function() {\n  let __outs;\n  ${inputs}\n\n` + outs;

    let outmap = {};
    let oi = 0;

    for (let k in ctx.outputs) {
      outmap[k] = oi++;
    }
    let totoutput = oi;

    let tlvl = 1;

    let usestack = false;

    let state = {
      stack     : [],
      stackcur  : 0,
      stackscope: {},
      scope     : {},
      pushNode  : undefined,
      copy() {
        let ret = Object.assign({}, this);

        ret.scope = Object.assign({}, this.scope);
        ret.stackscope = Object.assign({}, this.stackscope);

        ret.copy = this.copy;

        return ret;
      },
      vardecl(name, type) {
        this.stackscope[name] = type;
        this.stack.push(name);
        return this.stackcur++;
      },
      leave() {
        if (usestack) {
          for (let k in this.stackscope) {
            let type = this.stackscope[k];
            out(indent(tlvl) + `    ${type}stack_cur--;\n`);
            this.stack.pop();
            this.stackcur--;
          }
        }

        this.stackscope = {}
        return this;
      }
    };

    let statestack = [];

    function push(pushNode) {
      let s = state.copy();
      statestack.push(state);

      state = s;
      state.pushNode = pushNode;

      return s;
    }

    function pop(pushNode) {
      if (state.pushNode === pushNode) {
        let s = state;

        state.leave();
        state = statestack.pop();
        return s;
      }
    }

    function rec(n) {
      if (n.type === "ArrayLookup") {
        rec(n[0]);
        out("[");
        rec(n[1]);
        out("]");
      } else if (n.type === "VarDecl") {
        let ok = n.value in ctx.inputs || n.value in ctx.outputs || n.value in ctx.uniforms;

        let inFunc = false;

        let p = n.parent;
        while (p !== undefined) {
          if (p.type === "Function") {
            inFunc = true;
            break;
          }
          p = p.parent;
        }

        if (ok && inFunc) {
          let n2;

          n2 = n.value in ctx.inputs ? ctx.inputs[n.value] : undefined;
          n2 = n.value in ctx.outputs ? ctx.outputs[n.value] : undefined;
          n2 = n.value in ctx.uniforms ? ctx.uniforms[n.value] : undefined;

          if (n2 === ctx.getScope(n.value)) {
            ok = false;
          }
        }

        if (!ok) {
          out(`let ${n.value}`);
          if (n.length > 1 && n[1].length > 0) {
            out(" = ");
            rec(n[1]);
          } else {
            let type = ctx.resolveType(n[0].value);
            type = type.getTypeNameSafe();

            if (type === "vec2" || type === "vec3" || type === "vec4" || type === "mat4" || type === "mat3") {
              out(" = ");

              if (usestack) {
                let i = state.vardecl(n.value, type);
                out(`${type}stack[${type}stack_cur++];\n`);
              } else {
                out(`${type}cache.next();`);
              }
            }
          }

          out(";");
        }
      } else if (n.type === "Return") {
        let i1, i2, off, type, p, tname;
        let tab = indent(tlvl+2);

        if (usestack) {
          out("{\n");
          i1 = state.stackcur;
          pop(state.pushNode);

          i2 = state.stackcur;
          off = i2 - i1;

          let p = n;
          while (p) {
            if (p.ntype) {
              type = p.ntype;
              break;
            }
            p = p.parent;
          }

          type = type ?? ctx.getReturnType();
          tname = type.getTypeNameSafe();

          out(`${tab}${tname}stack[${tname}stack_cur]`);
          out(`.load(${tname}stack[${tname}stack_cur + (${off})]);\n`);
          out(`${tab}${tname}stack_cur++;\n`);
        }

        out(tab + "return")
        if (n.length > 0) {
          out(" ");
          for (let n2 of n) {
            rec(n2);
          }
          out(";");
        }
        if (usestack) {
          out("\n" + indent(tlvl) + "}\n");
        }
      } else if (n.type === "Trinary") {
        out("((");
        rec(n[0]);
        out(") ? (");
        rec(n[1]);
        out(") : (");
        rec(n[2]);
        out("))");
      } else if (n.type === "If") {
        out("if (");
        rec(n[0]);
        out(") {\n");
        rec(n[1][0]);
        out(indent(tlvl) + "}");

        if (n[1].length > 1) {
          out(" else {\n");
          if (n[1][1].type === "If") {
            tlvl++;
            out(indent(tlvl));
          }
          rec(n[1][1]);
          if (n[1][1].type === "If") {
            tlvl--;
          }
          out(indent(tlvl) + "}\n");
        } else {
          out("\n");
        }

      } else if (n.type === "BinOp" || n.type === "Assign") {
        let paren = false;

        if (n.parent && n.parent.type === "BinOp") {
          paren = n.parent.prec < n.prec;
        }

        if (paren) {
          out("(");
        }
        rec(n[0]);

        if (n.op !== ".") {
          out(' ' + n.op + ' ');
        } else {
          out(n.op);
        }

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
        if (n[0].type === "VarType") {
          out(n[0].value.getTypeName());
        } else {
          rec(n[0]);
        }
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
      } else if (n.type === "FloatConstant") {
        out(n.value.toFixed(7));
      } else if (n.type === "IntConstant") {
        out(""+n.value);
      } else if (n.type === "Precision") {
        return; //do nothing
      } else if (n.type === "Function") {
        let fname = n.polyKey ?? n.value;

        if (n.value === "main") {
          fname = "main";
        }

        out(`\n  function ${fname}(`);
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

        push(n);
        rec(n[2]);
        pop(n);

        tlvl--;

        out(indent(tlvl) + "}\n");
      } else if (n.type === "StatementList") {
        let noScope = n.noScope;

        if (!noScope) {
          push(n);
        }

        for (let c of n) {
          out(indent(tlvl));

          let slen = outs.length;

          rec(c)

          outs = outs.trim();

          if (!outs.endsWith(";") && !outs.endsWith("}")) {
            out(";");
          }
          out("\n");

        }

        if (!noScope) {
          pop(n);
        }
      } else {
        for (let n2 of n) {
          rec(n2);
        }
      }
    }

    rec(ast);

    let argset = '';
    outs += "  let __$func = function(outs";

    for (let k in ctx.inputs) {
      outs += `, \$${k}`;
      argset += `    ${k} = \$${k};\n`
    }
    outs += ") {\n";

    let footer = `
    __outs = outs;
${argset}
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
}
CodeGenerator.register(JSGenerator);
