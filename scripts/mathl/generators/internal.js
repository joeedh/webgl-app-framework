import {CodeGenerator} from './generator_base.js';
import {traverse} from '../core/ast.js';

export class InternalCodeGen {
  constructor(ctx, args={}) {
    this.ctx = ctx;
    this.args = args;
  }

  genCode(ast) {
    let out = '';

    let _state = {
      indent : ''
    }

    let newState = (state) => {
      return {
        indent : state.indent
      }
    }

    traverse(ast, _state,{
      Number(node, state, visit) {
        out += node.value;
      },
      Ident(node, state, visit) {
        out += node.value;
      },
      IntConstant(node, state, visit) {
        out += node.value;
      },
      FloatConstant(node, state, visit) {
        out += node.value;
      },
      VarDecl(node, state, visit) {
        let type = node[0];
        let tname = "<error>";

        if (type && type.value) {
          tname = type.value.getTypeNameSafe();
        }

        if (type) {
          let t = type.value;
          let qual;
          if (t.qualifier) {
            qual = t.qualifier;
          }

          if (typeof qual === "object") {
            qual = qual.value;
          }

          if (qual) {
            tname = qual + " " + tname;
          }
        }
        out += tname + " " + node.value;
      },
      ArrayLookup(node, state, visit) {
        visit(state, node[0]);
        out += "["
        visit(state, node[1])
        out += "]"
      },
      Trinary(node, state, visit) {
        out += "(("
        visit(state, node[0]);
        out += ") ? (";
        visit(state, node[1]);
        out += ") : (";
        visit(state, node[2]);
        out += "))";
      },
      PreInc(node, state, visit) {
        out += "++";
        visit(state, node[0]);
      },
      PostInc(node, state, visit) {
        visit(state, node[0]);
        out += "++";
      },
      PreDec(node, state, visit) {
        out += "--";
        visit(state, node[0]);
      },
      PostDec(node, state, visit) {
        visit(state, node[0]);
        out += "--";
      },
      UnaryOp(node, state, visit) {
        out += node.op
        visit(state, node[0]);
      },
      Assign(node, state, visit) {
        visit(state, node[0]);
        out += " " + node.op + " ";
        visit(state, node[1]);
      },
      BinOp(node, state, visit) {
        let paren = node.op !== ".";
        paren = paren && node.parent && node.parent.type === "BinOp" && node.parent.prec < node.prec;

        if (paren) {
          out += "(";
        }

        visit(state, node[0])

        if (node.op !== ".") {
          out += ` ${node.op} `;
        } else {
          out += node.op
        }

        visit(state, node[1]);

        if (paren) {
          out += ")";
        }
      },
      Function(node, state, visit) {
        out += state.indent;
        out += node[0].value.getTypeName() + " ";

        out += node.value + "("
        let args = node[1];
        for (let i=0; i<args.length; i++) {
          if (i > 0) {
            out += ", ";
          }

          visit(state, args[i]);
        }

        out += ") {\n";

        let state2 = newState(state);
        state2.indent += "  ";

        //console.log(node[2].type)
        visit(state2, node[2]);

        out += state.indent + "}\n";
      },
      Return(node, state, visit) {
        out += "return";

        for (let n of node) {
          out += " ";
          visit(state, n);
        }
      },
      Call(node, state, visit) {
        if (node[0].type === "VarType") {
          out += node[0].value.getTypeName();
        } else {
          visit(state, node[0])
        }

        out += "("
        for (let i=0; i<node[1].length; i++) {
          if (i > 0) {
            out += ", ";
          }
          visit(state, node[1][i]);
        }

        out += ")";
      },
      ExprList(node, state, visit) {
        for (let i=0; i<node.length; i++ ){
          if (i > 0) {
            out += ", ";
          }

          visit(state, node[i]);
        }
      },
      StatementList(node, state, visit) {
        let indent = state.indent;

        for (let n of node) {
          out += indent;
          visit(state, n);
          out += ";\n";
        }
      }
    });

    return out;
  }

  static generatorDefine() {
    return {
      typeName: "internal"
    }
  }
}
CodeGenerator.register(InternalCodeGen);

export const internalCodeGen = new InternalCodeGen();
