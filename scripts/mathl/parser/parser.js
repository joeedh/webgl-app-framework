import * as jscc_util from './jscc_util.js';
import {token, tokdef, lexer, PUTLParseError} from "../util/parseutil.js";
import {VarType, ArrayType, DynamicArrayType} from '../core/types.js';

let tk = (n, r, f) => new tokdef(n, r, f);

let precedence2 = {
  "("    : 0,
  ")"    : 0,
  "["    : 1,
  "]"    : 1,
  "."    : 1,
  "++"   : 1,
  "--"   : 1,
  "*"    : 2,
  "/"    : 2,
  "%"    : 2,
  "+"    : 3,
  "-"    : 3,
  ">="   : 4,
  "<="   : 4,
  ">"    : 4,
  "<"    : 4,
  "!="   : 5,
  "=="   : 5,
  "&"    : 6,
  "^"    : 7,
  "|"    : 8,
  "&&"   : 9,
  "^^"   : 10,
  "||"   : 11
};

let count = (str, match) => {
  let c = 0;
  do {
    let i = str.search(match);
    if (i < 0) {
      break;
    }

    c++;

    str = str.slice(i+1, str.length);
  } while (1);

  return c;
}

let keywords = new Set([
  "CONST", "BOOL", "FLOAT", "DOUBLE", "INT", "UINT",
  "BREAK", "CONTINUE", "DO", "ELSE", "FOR", "IF", "DISCARD", "RETURN", "SWITCH", "CASE", "DEFAULT", "SUBROUTINE",
  "BVEC2", "BVEC3", "BVEC4", "IVEC2", "IVEC3", "IVEC4", "UVEC2", "UVEC3", "UVEC4", "VEC2", "VEC3", "VEC4",
  "MAT2", "MAT3", "MAT4", "CENTROID", "IN", "OUT", "INOUT",
  "UNIFORM", "PATCH", "SAMPLE", "BUFFER", "SHARED",
  "COHERENT", "VOLATILE", "RESTRICT", "READONLY", "WRITEONLY",
  "DVEC2", "DVEC3", "DVEC4", "DMAT2", "DMAT3", "DMAT4",
  "NOPERSPECTIVE", "FLAT", "SMOOTH", "LAYOUT",
  "MAT2X2", "MAT2X3", "MAT2X4",
  "MAT3X2", "MAT3X3", "MAT3X4",
  "MAT4X2", "MAT4X3", "MAT4X4",
  "DMAT2X2", "DMAT2X3", "DMAT2X4",
  "DMAT3X2", "DMAT3X3", "DMAT3X4",
  "DMAT4X2", "DMAT4X3", "DMAT4X4",
  "ATOMIC_UINT",
  "SAMPLER1D", "SAMPLER2D", "SAMPLER3D", "SAMPLERCUBE", "SAMPLER1DSHADOW", "SAMPLER2DSHADOW",
  "SAMPLERCUBESHADOW", "SAMPLER1DARRAY", "SAMPLER2DARRAY", "SAMPLER1DARRAYSHADOW",
  "SAMPLER2DARRAYSHADOW", "ISAMPLER1D", "ISAMPLER2D", "ISAMPLER3D", "ISAMPLERCUBE",
  "ISAMPLER1DARRAY", "ISAMPLER2DARRAY", "USAMPLER1D", "USAMPLER2D", "USAMPLER3D",
  "USAMPLERCUBE", "USAMPLER1DARRAY", "USAMPLER2DARRAY",
  "SAMPLER2DRECT", "SAMPLER2DRECTSHADOW", "ISAMPLER2DRECT", "USAMPLER2DRECT",
  "SAMPLERBUFFER", "ISAMPLERBUFFER", "USAMPLERBUFFER",
  "SAMPLERCUBEARRAY", "SAMPLERCUBEARRAYSHADOW",
  "ISAMPLERCUBEARRAY", "USAMPLERCUBEARRAY",
  "SAMPLER2DMS", "ISAMPLER2DMS", "USAMPLER2DMS",
  "SAMPLER2DMSARRAY", "ISAMPLER2DMSARRAY", "USAMPLER2DMSARRAY",
  "IMAGE1D", "IIMAGE1D", "UIMAGE1D", "IMAGE2D", "IIMAGE2D",
  "UIMAGE2D", "IMAGE3D", "IIMAGE3D", "UIMAGE3D",
  "IMAGE2DRECT", "IIMAGE2DRECT", "UIMAGE2DRECT",
  "IMAGECUBE", "IIMAGECUBE", "UIMAGECUBE",
  "IMAGEBUFFER", "IIMAGEBUFFER", "UIMAGEBUFFER",
  "IMAGE1DARRAY", "IIMAGE1DARRAY", "UIMAGE1DARRAY",
  "IMAGE2DARRAY", "IIMAGE2DARRAY", "UIMAGE2DARRAY",
  "IMAGECUBEARRAY", "IIMAGECUBEARRAY", "UIMAGECUBEARRAY",
  "IMAGE2DMS", "IIMAGE2DMS", "UIMAGE2DMS",
  "IMAGE2DMSARRAY", "IIMAGE2DMSARRAY", "UIMAGE2DMSARRAY",
  "STRUCT", "VOID", "WHILE",
  "INVARIANT", "PRECISE", "PRECISION"
]);

/*
  "HIGH_PRECISION", "MEDIUM_PRECISION", "LOW_PRECISION", "PRECISION"
  "Ident", "TYPE_NAME",
  "FIELD_SELECTION",
  "LEFT_OP", "RIGHT_OP",
  "FLOATCONSTANT", "DOUBLECONSTANT", "INTCONSTANT", "UINTCONSTANT", "BOOLCONSTANT",
  "INC_OP", "DEC_OP", "LE_OP", "GE_OP", "EQ_OP", "NE_OP",
  "AND_OP", "OR_OP", "XOR_OP", "MUL_ASSIGN", "DIV_ASSIGN", "ADD_ASSIGN",
  "MOD_ASSIGN", "LEFT_ASSIGN", "RIGHT_ASSIGN", "AND_ASSIGN", "XOR_ASSIGN", "OR_ASSIGN",
  "SUB_ASSIGN",
  "LPAREN", "RPAREN", "LSBRACKET", "RSBRACKET", "LBRACE", "RBRACE", "DOT",
  "COMMA", "COLON", "EQUAL", "SEMI", "BANG", "DASH", "TILDE", "PLUS", "STAR", "SLASH", "PERCENT",
  "LEFT_ANGLE", "RIGHT_ANGLE", "VERTICAL_BAR", "CARET", "AMPERSAND", "QUESTION",
*/

let tokendef = [
  tk("HIGH_PRECISION", /highp/),
  tk("MEDIUM_PRECISION", /mediump/),
  tk("LOW_PRECISION", /lowp/),
  tk("ID", /[a-zA-Z$_]+[a-zA-Z0-9$_]*/, (t) => {
    t.isKeyword = false;

    if (t.value in t.lexer.structs) {
      t.type = "TYPE_NAME";
      return t;
    }

    if (t.lexer.prev && t.lexer.prev.type === "DOT") {
      t.type = "FIELD_SELECTION";
      return t;
    }

    if (keywords.has(t.value.toUpperCase())) {
      t.isKeyword = true;
      t.type = t.value.toUpperCase();
      t.value = t.value.toLowerCase();
    }

    return t;
  }),
  tk("FLOATCONSTANT", /[0-9]+\.([0-9]*)?/, (t) => {
    t.value = parseFloat(t.value);
    return t;
  }),
  tk("INTCONSTANT", /[0-9]+/, (t) => {
    t.value = parseInt(t.value);
    return t;
  }),
  tk("UINTCONSTANT", /[0-9]+u/, (t) => {
    t.value = parseInt(t.value);
    return t;
  }),
  tk("BOOLCONSTANT", /(true|false)/),
  tk("DOUBLECONSTANT", /[0-9]+(\.[0-9]*)?d/, (t) => {
    t.value = t.value.slice(0, t.value.length-1);
    t.value = parseFloat(t.value);

    return t;
  }),
  tk("LPAREN", /\(/),
  tk("RPAREN", /\)/),
  tk("STRLIT", /".*(?<!\\)\"/, (t) => {
    let v = t.value;
    t.lexer.lineno += count(t.value, "\n");
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
  tk("QUESTION", /\?/),
  tk("LSBRACKET", /\[/),
  tk("RSBRACKET", /\]/),
  tk("LBRACE", /\{/),
  tk("RBRACE", /\}/),
  tk("DOT", /\./),
  tk("PLUS", /\+/),
  tk("NOT", /\!/),
  tk("MINUS", /\-/),
  tk("TIMES", /\*/),
  tk("DIV", /\//),
  tk("EXP", /\*\*/),
  tk("LAND", /\&\&/),
  tk("BITAND", /\&/),
  tk("LOR", /\|\|/),
  tk("BITOR", /\|/),
  tk("EQUALS", /==/),
  tk("NEQUALS", /\!=/),
  tk("ASSIGN", /=/),
  tk("LEQUALS", /\<\=/),
  tk("GEQUALS", /\>\=/),
  tk("LTHAN", /\</),
  tk("LSHIFT", /\<\</),
  tk("RSHIFT", /\>\>/),
  tk("GTHAN", /\>/),
  tk("MOD", /\%/),
  tk("XOR", /\^/),
  tk("LXOR", /\^\^/),
  tk("BITINV", /\~/),
  tk("INC", /\+\+/),
  tk("DEC", /\-\-/),
  tk("MUL_ASSIGN", /\*\=/),
  tk("DIV_ASSIGN", /\/\=/),
tk("PLUS_ASSIGN", /\+\=/),
  tk("MINUS_ASSIGN", /\-\=/),
  tk("COMMENT", /\/\/[^\n]*\n/, (t) => {
    //t.lexer.lineno++;
    t.lexer.lineno += count(t.value, "\n");
    //drop token by not returning it
  }),
  tk("MOD_ASSIGN", /\%\=/),
tk("LEFT_ASSIGN", /\<\<\=/),
  tk("RIGHT_ASSIGN", /\>\>\=/),
  tk("AND_ASSIGN", /\&\=/),
  tk("OR_ASSIGN", /\|\=/),
  tk("XOR_ASSIGN", /\^\=/),
  tk("SEMI", /;/)


];

export class GLSLLexer extends lexer {
  constructor() {
    super(tokendef, (t) => {
      console.log("Token error");
      return true;
    });

    this.scope = {};
    this.structs = {};
    this.scopestack = [];

    this.linemap = [];
  }

  pushScope() {
    this.scopestack.push(this.scope);
    this.scope = Object.assign({}, this.scope);
  }

  popScope() {
    this.scope = this.scopestack.pop();
  }

  input(data) {
    super.input(data);

    this.linemap = new Array(data.length);

    let li = 0;
    for (let i=0; i<data.length; i++) {
      this.linemap[i] = li;

      if (data[i] === "\n") {
        li++;
      }
    }

    this.scope = {};
    this.structs = {};
  }
}

let lex = new GLSLLexer();

let binops = new Set([
  ".", "/", "*", "**", "^", "%", "&", "+", "-", "&&", "||", "&", "|", "<",
  ">", "==", "=", "<=", ">="//, "(", ")"
]);

let precedence = [
  ["nonassoc", "LPAREN", "RPAREN"],
  ["left", "LSBRACKET", "RSBRACKET", "DOT", "INC", "DEC", "FIELD_SELECTOR"],
  ["right", "UNARY"],
  ["left", "TIMES", "DIV", "MOD"],
  ["left", "PLUS", "MINUS"],
  ["left", "LSHIFT", "RSHIFT"],
  ["left", "GEQUALS", "LEQUALS", "GTHAN", "LTHAN"],
  ["left", "NEQUALS", "EQUALS"],
  ["left", "BITAND"],
  ["left", "XOR"],
  ["left", "BITOR"],
  ["left", "LAND"],
  ["left", "LXOR"],
  ["left", "LOR"],
  ["right", "QUESTION", "COLON"],
  ["right", "ASSIGN", "MUL_ASSIGN", "DIV_ASSIGN", "PLUS_ASSIGN", "MINUS_ASSIGN", "MOD_ASSIGN", "OR_ASSIGN",
    "XOR_ASSIGN", "RIGHT_ASSIGN", "LEFT_ASSIGN", "AND_ASSIGN"],
  ["left", "COMMA"]
]

let opmap = {
  TIMES : "*",
  DIV : "/",
  MOD : "%",
  PLUS : "+",
  MINUS : "-",
  GTHAN : ">",
  LTHAN : "<",
  GEQUALS : ">=",
  LEQUALTS : "<=",
  NEQUALS : "!=",
  EQUALS : "==",
  ASSIGN : "=",
  MUL_ASSIGN : "*=",
  DIV_ASSIGN : "/=",
  PLUS_ASSIGN : "+=",
  MOD_ASSIGN :  "%=",
  OR_ASSIGN : "|=",
  AND_ASSIGN : "&=",
  LEFT_ASSIGN : "<<=",
  RIGHT_ASSIGN : ">>=",
  XOR_ASSIGN : "^=",
  MINUS_ASSIGN : "-=",
  XOR : "^",
  BITOR : "|",
  LAND : "&&",
  LOR : "||",
  LXOR : "^^",
  BITAND : "&",
  BITINV : "~",
  LSHIFT : "<<",
  RSHIFT : ">>",
  INC : "++",
  DEC : "--",
  DOT : "."
};

export const Precedence = {};
let pi =0;
for (let row of precedence) {
  for (let key of row.slice(1, row.length)) {
    Precedence[opmap[key]] = {
      prec : pi,
      assoc : row[0]
    }
  }
  pi++;
}

function indent(n, chr="  ") {
  let s = "";
  for (let i=0; i<n; i++) {
    s += chr;
  }

  return s;
}

import {ASTNode} from '../core/ast.js';

const Node = ASTNode;

export class Node1 extends Array {
  constructor(type) {
    super();
    this.type = type;
    this.parent = undefined;
  }

  [Symbol.toStringTag]() {
    return `${this.type}(${this.length})`;
  }

  push(n) {
    if (typeof n === "string") {
      let n2 = new Node("Ident");
      n2.value = n;
      n = n2;
    }

    n.parent = this;
    return super.push(n);
  }

  add(n) {
    this.push(n);
  }

  remove(n) {
    let i = this.indexOf(n);

    if (i < 0) {
      console.log(n);
      throw new Error("item not in array");
    }

    while (i < this.length) {
      this[i] = this[i+1];
      i++;
    }

    n.parent = undefined;
    this.length--;

    return this;
  }

  insert(starti, n) {
    let i = this.length-1;
    this.length++;

    if (n.parent) {
      n.parent.remove(n);
    }

    while (i > starti) {
      this[i] = this[i-1];
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

  toString(t=0) {
    let tab = indent(t, "-");

    let typestr = this.type;

    if (this.value !== undefined) {
      typestr +=  " : " + this.value;
    } else if (this.op !== undefined) {
      typestr += " (" + this.op + ")";
    }

    let s = tab + typestr + " {\n"
    for (let c of this) {
      s += c.toString(t+1);
    }
    s += tab + "}\n";

    return s;
  }
}

let BinOpHandler = (p) => {
  if (p.length === 2) {
    p[0] = p[1];
  } else {
    p[0] = new Node("BinOp");
    p[0].op = p[2];

    p[0].prec = precedence2[p[0].op];

    p[0].push(p[1]);
    p[0].push(p[3]);
  }
}

let parsedef = [
  {
    grammar : `var_expr: ID`,
    func    : (p) => {
      p[0] = new Node("Ident")
      p[0].value = p[1];
    }
  },
  {
    grammar : `intconstant: INTCONSTANT`,
    func : (p) => {
      p[0] = new Node("IntConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `floatconstant: FLOATCONSTANT`,
    func : (p) => {
      p[0] = new Node("FloatConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `boolconstant: BOOLCONSTANT`,
    func : (p) => {
      p[0] = new Node("BoolConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `uintconstant: UINTCONSTANT`,
    func : (p) => {
      p[0] = new Node("UIntConstant");
      p[0].value = p[1];
    }
  },

  {
    grammar : `expression: INTCONSTANT`,
    func : (p) => {
      p[0] = new Node("IntConstant");
      p[0].value = p[1];
    }
  },

  {
    grammar : `intconstant : INTCONSTANT`,
    func : (p) => {
      p[0] = new Node("IntConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `uintconstant : UINTCONSTANT`,
    func : (p) => {
      p[0] = new Node("UintConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `floatconstant : FLOATCONSTANT`,
    func : (p) => {
      p[0] = new Node("FloatConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `boolconstant : BOOLCONSTANT`,
    func : (p) => {
      p[0] = new Node("BoolConstant");
      p[0].value = p[1];
    }
  },
  {
    grammar : `primary_expression:  var_expr
                                  | intconstant
                                  | uintconstant
                                  | floatconstant
                                  | boolconstant
                                  | LPAREN expression RPAREN`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 4) {
        p[0] = p[2];
      }
    }
  },
  {
    grammar : `field_selection : FIELD_SELECTION`,
    func : (p) => {
      p[0] = new Node("Ident");
      p[0].value = p[1];
    }
  },
  {
    grammar : `postfix_expression: primary_expression
                                 | postfix_expression LSBRACKET integer_expression RSBRACKET
                                 | function_call
                                 | postfix_expression DOT field_selection
                                 | postfix_expression INC
                                 | postfix_expression DEC 
               `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 5) {
        p[0] = new Node("ArrayLookup");
        p[0].push(p[1]);
        p[0].push(p[3]);
      } else if (p.length === 4) {
        p[0] = new Node("BasicMemberLookup");
        let n = p[3];
        if (typeof n === "string") {
          n = new Node("Ident");
          n.value = p[3];
        }

        p[0].push(p[1]);
        p[0].push(n);
      } else if (p.length === 3) {
        let type = p[2] === "++" ? "PostInc" : "PostDec";
        p[0] = new Node(type);
        p[0].push(p[1]);
      }
    }
  },

  {
    grammar : `integer_expression: expression`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `function_call: function_call_or_method`,
    func : (p) => {
      p[0] = p[1]
    }
  },
  {
    grammar : `function_call_or_method: function_call_generic`,
    func : (p) => {
      p[0] = p[1]
    }
  },
  {
    grammar : `function_call_generic: function_call_header_with_parameters RPAREN
                                    | function_call_header_no_parameters RPAREN
            `,
    func : (p) => {
      p[0] = p[1]
    }
  },
  {
    grammar : `function_call_header_no_parameters: function_call_header VOID
                                                 | function_call_header`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `function_call_header_with_parameters: function_call_header assignment_expression
                                                   | function_call_header_with_parameters COMMA assignment_expression`,
    func : (p) => {
      if (p.length === 3) {
        p[0] = p[1];
        p[0][1].push(p[2]);
      } else {
        p[0] = p[1];
        p[0][1].push(p[3]);
      }
    }
  },
  {
    grammar : `function_call_header: function_id LPAREN`,
    func : (p) => {
      p[0] = new Node("Call");
      p[0].push(p[1]);
      p[0].push(new Node("ExprList"));
    }
  },
  {
    grammar : `function_id: type_specifier
                          | postfix_expression`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `unary_expression: postfix_expression
                               | INC unary_expression &UNARY
                               | DEC unary_expression &UNARY
                               | unary_operator unary_expression &UNARY`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 4 && p[1] === "++") {
        p[0] = new Node("PreInc");
        p[0].push(p[2]);
      } else if (p.length === 4 && p[1] === "--") {
        p[0] = new Node("PreDec");
        p[0].push(p[2]);
      } else {
        p[0] = new Node("UnaryOp");
        p[0].push(p[2]);
        p[0].op = p[1];
      }
    }
  },
  {
    grammar : `unary_operator : PLUS
                              | MINUS
                              | BITINV
                              | NOT`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar: `multiplicative_expression : unary_expression
                                         | multiplicative_expression TIMES unary_expression
                                         | multiplicative_expression DIV unary_expression
                                         | multiplicative_expression MOD unary_expression`,
    func: BinOpHandler
  },
  {
    grammar: `additive_expression: multiplicative_expression
                                  | additive_expression PLUS multiplicative_expression
                                  | additive_expression MINUS multiplicative_expression

                                  `,
    func: BinOpHandler
  },
  {
    grammar: `shift_expression: additive_expression
                               | shift_expression RSHIFT additive_expression
                               | shift_expression LSHIFT additive_expression
                               `,
    func: BinOpHandler
  },
  {
    grammar: `rel_expression: shift_expression
                             | rel_expression  LTHAN   shift_expression
                             | rel_expression  GTHAN   shift_expression
                             | rel_expression  LEQUALS shift_expression
                             | rel_expression  GEQUALS shift_expression
                               `,
    func: BinOpHandler
  },
  {
    grammar: `equality_expression: rel_expression
                                  | equality_expression  EQUALS   rel_expression
                                  | equality_expression  NEQUALS  rel_expression
                               `,
    func: BinOpHandler
  },
  {
    grammar : `and_expression: equality_expression
                             | and_expression  BITAND  equality_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `exclusive_or_expression: and_expression
                                      | exclusive_or_expression  XOR  and_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `inclusive_or_expression: exclusive_or_expression
                                      | inclusive_or_expression  BITOR exclusive_or_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `logical_and_expression: inclusive_or_expression
                                     | logical_and_expression LAND inclusive_or_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `logical_xor_expression: logical_and_expression
                                     | logical_xor_expression LXOR logical_and_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `logical_or_expression: logical_xor_expression
                                     | logical_or_expression LOR logical_xor_expression
                               `,
    func : BinOpHandler
  },
  {
    grammar : `conditional_expression: logical_or_expression
                                     | logical_or_expression QUESTION expression COLON assignment_expression
                               `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = new Node("Trinary");
        p[0].push(p[1]);
        p[0].push(p[3]);
        p[0].push(p[5]);
      }
    }
  },
  {
    grammar : `assignment_expression: conditional_expression
                                    | unary_expression assignment_operator assignment_expression
                               `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = new Node("Assign");
        p[0].push(p[1]);
        p[0].push(p[3]);
        p[0].op = p[2];
      }
    }
  },


  {
    grammar : `assignment_operator: ASSIGN
                                  | MUL_ASSIGN
                                  | DIV_ASSIGN
                                  | PLUS_ASSIGN
                                  | MINUS_ASSIGN
                                  | MOD_ASSIGN
                                  | OR_ASSIGN
                                  | XOR_ASSIGN
                                  | RIGHT_ASSIGN
                                  | LEFT_ASSIGN
                                  | AND_ASSIGN
                                  
                                  `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `expression : assignment_expression
                          | expression COMMA assignment_expression`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        if (p[1].type !== "ExprList") {
          p[0] = new Node("ExprList");
          p[0].push(p[1]);
        } else {
          p[0] = p[1];
        }

        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `constant_expression: conditional_expression`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `type_specifier: type_specifier_nonarray
                              | type_specifier_nonarray array_specifier`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        let type;

        if (typeof p[1] === "string") {
          type = new Node("VarType");
          type.value = new VarType(p[1]);
        } else {
          type = p[1];
        }

        p[0] = p[2];
        p[0].type = p[1].value;
      }
    }
  },
  {
    grammar : `array_specifier: LSBRACKET RSBRACKET
                              | LSBRACKET constant_expression RSBRACKET
                              | array_specifier LSBRACKET RSBRACKET
                              | array_specifier LSBRACKET constant_expression RSBRACKET
                             
 `,

    func : (p) => {
      if (p.length === 3) {
        p[0] = new DynamicArrayType();
      } else if (p.length === 4 && p[1] === "[") {
        p[0] = new ArrayType(undefined, p[2]);
      } else if (p.length === 4) {
        p[0] = new DynamicArrayType(p[1]);
      } else if (p.length === 5) {
        p[0] = new ArrayType(p[3], p[1])
      } else {
        console.log(p.length, p);
        throw new Error();
      }
    }
  },
  {
    grammar : `type_name : TYPE_NAME`,
    func : (p) => {
      p[0] = new Node("TypeName");
      p[0].value = p[1];
    }
  },
  {
    grammar : `type_specifier_nonarray: VOID
                                      | FLOAT
                                      | DOUBLE
                                      | INT
                                      | UINT
                                      | BOOL
                                      | VEC2
                                      | VEC3
                                      | VEC4
                                      | DVEC2
                                      | DVEC3
                                      | DVEC4
                                      | BVEC2
                                      | BVEC3
                                      | BVEC4
                                      | IVEC2
                                      | IVEC3
                                      | IVEC4
                                      | UVEC2
                                      | UVEC3
                                      | UVEC4
                                      | MAT2
                                      | MAT3
                                      | MAT4
                                      | MAT2X2
                                      | MAT2X3
                                      | MAT2X4
                                      | MAT3X2
                                      | MAT3X3
                                      | MAT3X4
                                      | MAT4X2
                                      | MAT4X3
                                      | MAT4X4
                                      | DMAT2
                                      | DMAT3
                                      | DMAT4
                                      | DMAT2X2
                                      | DMAT2X3
                                      | DMAT2X4
                                      | DMAT3X2
                                      | DMAT3X3 
                                      | DMAT3X4
                                      | DMAT4X2
                                      | DMAT4X3
                                      | DMAT4X4
                                      | ATOMIC_UINT
                                      | SAMPLER1D
                                      | SAMPLER2D
                                      | SAMPLER3D
                                      | SAMPLERCUBE
                                      | SAMPLER1DSHADOW
                                      | SAMPLER2DSHADOW
                                      | SAMPLERCUBESHADOW
                                      | SAMPLER1DARRAY
                                      | SAMPLER2DARRAY
                                      | SAMPLER1DARRAYSHADOW
                                      | SAMPLER2DARRAYSHADOW
                                      | SAMPLERCUBEARRAY
                                      | SAMPLERCUBEARRAYSHADOW
                                      | ISAMPLER1D
                                      | ISAMPLER2D
                                      | ISAMPLER3D
                                      | ISAMPLERCUBE
                                      | ISAMPLER1DARRAY
                                      | ISAMPLER2DARRAY
                                      | ISAMPLERCUBEARRAY
                                      | USAMPLER1D
                                      | USAMPLER2D
                                      | USAMPLER3D
                                      | USAMPLERCUBE
                                      | USAMPLER1DARRAY
                                      | USAMPLER2DARRAY
                                      | USAMPLERCUBEARRAY
                                      | SAMPLER2DRECT
                                      | SAMPLER2DRECTSHADOW
                                      | ISAMPLER2DRECT
                                      | USAMPLER2DRECT
                                      | SAMPLERBUFFER
                                      | ISAMPLERBUFFER 
                                      | USAMPLERBUFFER
                                      | SAMPLER2DMS
                                      | ISAMPLER2DMS
                                      | USAMPLER2DMS
                                      | SAMPLER2DMSARRAY
                                      | ISAMPLER2DMSARRAY
                                      | USAMPLER2DMSARRAY
                                      | IMAGE1D
                                      | IIMAGE1D
                                      | UIMAGE1D
                                      | IMAGE2D
                                      | IIMAGE2D
                                      | UIMAGE2D
                                      | IMAGE3D
                                      | IIMAGE3D
                                      | UIMAGE3D
                                      | IMAGE2DRECT
                                      | IIMAGE2DRECT
                                      | UIMAGE2DRECT
                                      | IMAGECUBE
                                      | IIMAGECUBE
                                      | UIMAGECUBE
                                      | IMAGEBUFFER
                                      | IIMAGEBUFFER
                                      | UIMAGEBUFFER
                                      | IMAGE1DARRAY
                                      | IIMAGE1DARRAY
                                      | UIMAGE1DARRAY
                                      | IMAGE2DARRAY
                                      | IIMAGE2DARRAY
                                      | UIMAGE2DARRAY
                                      | IMAGECUBEARRAY
                                      | IIMAGECUBEARRAY
                                      | UIMAGECUBEARRAY
                                      | IMAGE2DMS
                                      | IIMAGE2DMS
                                      | UIMAGE2DMS
                                      | IMAGE2DMSARRAY
                                      | IIMAGE2DMSARRAY 
                                      | UIMAGE2DMSARRAY
                                      | struct_specifier
                                      | type_name 
 
    `,
    func : (p) => {
      p[0] = new VarType(p[1]);
    }
  },
  {
    grammar : `struct_declaration_list : struct_declaration
                                       | struct_declaration_list struct_declaration`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");
        p[0].push(p[1]);
      } else {
        p[0] = p[1];
        p[0].push(p[2]);
      }
    }
  },
  {
    grammar : `struct_declaration: type_specifier struct_declarator_list SEMI 
                                 | type_qualifier type_specifier struct_declarator_list SEMI`,
    func : (p) => {
      p[0] = new Node("StructMemberList");

      if (p.length === 4) {
        p[0].push(p[1]);
        p[0].push(p[2]);
      } else {
        p[0].push(p[2]);
        p[0].push(p[3]);
        p[2].qualifier = p[1];
      }

      for (let c of p[0][0]) {
        //c.ntype = p[0].ntype;
        if (c.length < 1 || c[0].type !== "VarType") {
          c.insert(0, p[0][0]);
        }
      }
    }
  },
  {
    grammar : `struct_declarator_list: struct_declarator
                                     | struct_declarator_list COMMA struct_declarator`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");
        p[0].push(p[1]);
      } else {
        p[0] = p[1];
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `struct_declarator: ID
                                | ID array_specifier`,
    func : (p) => {
      p[0] = new Node("StructMember");
      p[0].value = p[1];

      if (p.length > 2) {
        p[0].arraytype = p[2];
      }
    }
  },
  {
    grammar : `struct_specifier: STRUCT ID LBRACE struct_declaration_list RBRACE
                               | STRUCT LBRACE struct_declaration_list RBRACE 
 
 `,
    func : (p) => {
      p[0] = new Node("StructDecl");

      if (p.length > 5) {
        p[0].value = p[2];
        p[0].push(p[4]);
      } else {
        p[0].value = "(anonymous)";
        p[0].push(p[3]);
      }

      p.lexer.structs[p[0].value] = p[0];
    }
  },
  {
    grammar : "function_prototype_pop_scope: function_prototype",
    func : (p) => {
      p[0] = p[1];
      p.lexer.popScope();
    }
  },
  {
    grammar : `declaration: function_prototype_pop_scope SEMI
                          | init_declarator_list SEMI
                          | PRECISION precision_qualifier type_specifier SEMI
                          | type_qualifier ID LBRACE struct_declaration_list RBRACE SEMI
                          | type_qualifier ID LBRACE struct_declaration_list RBRACE ID SEMI
                          | type_qualifier ID LBRACE struct_declaration_list RBRACE ID array_specifier SEMI
                          | type_qualifier SEMI
                          | type_qualifier ID SEMI
                          | type_qualifier ID id_list SEMI

    `,
    func : (p) => {
      if (p.length === 3 && p[1].type === "InitDeclaratorList") {
        p[1].type = "StatementList";
        p[1].noScope = true;

        let type = p[1][0][0];
        for (let n of p[1]) {
          n[0].value = type.value;
          n[0].qualifier = type.qualifier;
        }

        p[0] = p[1];
      } else if (p.length === 5 && p[1] === "precision") {
        let n = new Node("Precision");
        n.push(p[2]);
        n.push(p[3]);

        p[0] = n;
      } else if (p.length > 6) {
        let n = new Node("StructDecl");
        n.value = p[2];
        n.push(p[4]);

        p.lexer.structs[n.value] = n;
        n.qualifier = p[1];

        if (p.length > 7) {
          let n2 = new Node("VarDecl");
          n2.push(n);

          n2.value = p[6];

          p.lexer.scope[n2.value] = n2;

          if (p.length > 8) {
            let n3 = new Node("VarType");
            n3.value = p[7];

            p[7].type = n[0];
            n.replace(n[0], n3);
          }
          p[0] = n2;
        } else {
          p[0] = n;
        }
      } else if (n.length === 4) {
        p[0] = new Node("VarDecl");
        p[0].value = p[2];

        /*if (p[1] instanceof Node && p[1].type === "Ident") {
          p[1].type = "VarType"
          p[1].value = new VarType(p[1].value);
        }*/

        p[0].add(p[1]);

        p.lexer.scope[p[0].value] = p[0];
      } else if (n.length === 5) {
        let n = new Node("VarDecl");
        n.value = p[2];

        n.push(p[1]);
        //n.ntype = p[1];

        p.lexer.scope[p[0].value] = n;

        p[0] = new Node("StatementList");
        p[0].noScope = true;
        p[0].push(n);

        for (let c of p[3]) {
          let n2 = new Node("VarDecl");

          //n2.ntype = n.ntype;
          n2.push(n[0]);

          n2.value = c;
          p.lexer.scope[n2.value] = n2;

          p[0].push(n2);
        }
      } else {
        console.log(p);
        throw new Error("bad p length " + p.length);
      }
    }
  },
  {
    grammar : `id_list: COMMA ID
                      | id_list COMMA ID`,
    func : (p) => {
      if (p.length === 3) {
        p[0] = [p[2]];
      } else {
        p[0] = p[1];
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `function_prototype: function_declarator RPAREN`,
    func : (p) => {
      p.lexer.pushScope();

      for (let c of p[1][0]) {
        p.lexer.scope[c.value] = c;
      }

      globalThis.fn = p[1];
      p[0] = p[1];
    }
  },
  {
    grammar : `function_declarator : function_header
                                   | function_header_with_parameters`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `function_header_with_parameters : function_header parameter_declaration
                                               | function_header_with_parameters COMMA parameter_declaration`,
    func : (p) => {
      p[0] = p[1];

      if (p.length === 3) {
        p[0][1].push(p[2]);
      } else {
        p[0][1].push(p[3]);
      }
    }
  },
  {
    grammar : `function_header: fully_specified_type ID LPAREN`,
    func : (p) => {
      p[0] = new Node("Function");

      let n = new Node("VarType");
      n.value = p[1];

      p[0].push(n);
      p[0].push(new Node("ExprList"));
      p[0].value = p[2];
    }
  },
  {
    grammar : `parameter_declarator : type_specifier ID
                                    | type_specifier ID array_specifier`,
    func : (p) => {
      p[0] = new Node("VarDecl");
      p[0].push(p[1]);
      p[0].value = p[2];

      if (p.length === 4) {
        p[0].push(p[1]);
      }
    }
  },
  {
    grammar : `parameter_declaration: type_qualifier parameter_declarator
                                    | parameter_declarator
                                    | type_qualifier parameter_type_specifier
                                    | parameter_type_specifier
 `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 3) {
        p[0] = p[2];
        p[0].qualifier = p[1];
      }
    }
  },
  {
    grammar : `parameter_type_specifier : type_specifier`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `init_declarator_list : single_declaration
                                    | init_declarator_list COMMA ID
                                    | init_declarator_list COMMA ID array_specifier
                                    | init_declarator_list COMMA ID array_specifier ASSIGN initializer
                                    | init_declarator_list COMMA ID ASSIGN initializer

`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("InitDeclaratorList"); //parent production will turn this into a StatementList
        p[0].push(p[1]);
        p[0].noScope = true;

        /*
        p[0] = new Node("ExprList");

        let n = new Node("VarDecl")
        n.value = p[1];

        p[0].push(n);//*/
      } else if (p.length === 4) {
        let n = new Node("VarDecl")
        n.push(new Node("VarType")); //will be initialized later
        n.value = p[3];

        p[0] = p[1];
        p[0].push(n);
      } else if (p.length === 5) {
        p[0] = p[1];

        let n = new Node("VarDecl");
        n.push(p[4]);

        n.value = p[3];
        //n.arraytype = p[4];

        p[0].push(n);
      } else if (p.length === 6) {
        p[0] = p[1];
        let n = new Node("VarDecl");
        n.push(new Node("VarType"));//will be initialized later

        n.value = p[3];
        n.push(p[5]);

        p[0].push(n);
      } else if (p.length === 7) {
        p[0] = p[1];
        let n = new Node("VarDecl");
        n.push(p[4]);

        n.value = p[3];
        //n.arraytype = p[4];
        n.push(p[5])

        p[0].push(n);
      }
    }
  },
  {
    grammar : `single_declaration : fully_specified_type
                                  | fully_specified_type ID
                                  | fully_specified_type ID array_specifier ASSIGN initializer
                                  | fully_specified_type ID array_specifier
                                  | fully_specified_type ID ASSIGN initializer 

 `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];

        //p[0] = new Node("VarDecl")
        //p[0].ntype = p[1];
        //p[0].value = "(anonymous)";
      } else {
        p[0] = new Node("VarDecl");
        p[0].value = p[2];

        let type = p[1];
        if (typeof type === "string") {
          let n = new Node("VarType");
          n.value = new VarType(type);
          type = n;
        } else if (typeof type instanceof Node && type.type === "Ident") {
          type.type = "VarType";
          type.value = new VarType(type.value);
        }

        p[0].push(type);

        if (p.length > 3 && p[3] !== "=") {
          p[0].arraytype = p[3];
          if (p.length > 5) {
            p[0].push(p[5]);
          }
        } else {
          if (p[4]) {
            p[0].push(p[4]);
          }
        }
      }
    }
  },
  {
    grammar : `fully_specified_type : type_specifier 
                                    | type_qualifier type_specifier`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = p[2];

        if (typeof p[0] === "string") {
          p[0] = new Node("Ident");
          p[0].value = p[2];
        }

        p[0].qualifier = p[1];
      }
    }
  },
  {
    grammar : `invariant_qualifier : INVARIANT`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `interpolation_qualifier : SMOOTH
                                       | FLAT
                                       | NOPERSPECTIVE
                                       `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `layout_qualifier : LAYOUT LPAREN layout_qualifier_id_list RPAREN`,
    func : (p) => {
      p[0] = new Node("LayoutQualifier");
      p[0].push(p[3]);
    }
  },
  {
    grammar : `layout_qualifier_id_list : layout_qualifier_id
                                        | layout_qualifier_id_list COMMA layout_qualifier_id
                                        `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");
        p[0].push(p[1]);
      } else {
        p[0] = p[1];
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `layout_qualifier_id : ID
                                   | ID ASSIGN constant_expression
                                   | SHARED`,
    func : (p) => {
      p[0] = new Node("LayoutQualifierId");

      if (p.length === 2) {
        p[0].value = p[1];
      } else {
        p[0].value = p[1];
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `precise_qualifier : PRECISE`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `type_qualifier : single_type_qualifier
                              | type_qualifier single_type_qualifier`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];

        if (typeof p[0] === "string") {
          p[0] = new Node("TypeQualifier");
          p[0].value = p[1];
        }
      } else {
        p[0] = p[2];

        if (typeof p[0] === "string") {
          p[0] = new Node("TypeQualifier");
          p[0].value = p[2];
        }
        p[0].qualifier = p[1];
      }
    }
  },
  {
    grammar : `single_type_qualifier: storage_qualifier
                                    | storage_qualifier
                                    | layout_qualifier
                                    | precision_qualifier
                                    | interpolation_qualifier
                                    | invariant_qualifier
                                    | precise_qualifier
                                     `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `storage_qualifier: CONST
                                | INOUT
                                | IN
                                | OUT
                                | CENTROID
                                | PATCH
                                | SAMPLE
                                | UNIFORM
                                | BUFFER
                                | SHARED
                                | COHERENT
                                | VOLATILE
                                | RESTRICT
                                | READONLY
                                | WRITEONLY
                                | SUBROUTINE
                                | SUBROUTINE LPAREN type_name_list RPAREN
    `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 5) {
        p[0] = new Node("SubroutineQualifier");
        p[0].push(p[3]);
      } else {
        p[0] = p[1];
        //throw new Error("bad p vector: length was " + p.length);
      }
    }
  },
  {
    grammar : `type_name_list: type_name
                             | type_name_list COMMA type_name
                             `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");

        let n = new Node("Ident");
        n.value = p[1];

        p[0].push(n);
      } else {
        p[0] = p[1];

        let n = new Node("Ident");
        n.value = p[3];

        p[0].push(n);
      }
    }
  },
  {
    grammar : `precision_qualifier: HIGH_PRECISION
                                  | MEDIUM_PRECISION
                                  | LOW_PRECISION
    `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `initializer: assignment_expression
                          | LBRACE initializer_list RBRACE
                          | LBRACE initializer_list COMMA RBRACE

 `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");
        p[0].push(p[1]);
      } else {
        p[0] = p[2]
      }
    }
  },
  {
    grammar : `initializer_list: initializer
                               | initializer_list COMMA initializer`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("ExprList");
        p[0].push(p[1]);
      } else {
        p[0] = p[1];
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `declaration_statement: declaration`,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `statement: compound_statement  
                        | simple_statement
              `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `simple_statement: declaration_statement
                               | expression_statement
                               | selection_statement
                               | switch_statement
                               | case_label
                               | iteration_statement
                               | jump_statement
`,

    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `compound_statement: LBRACE RBRACE
                                 | LBRACE statement_list RBRACE `,
    func : (p) => {
      if (p.length === 3) {
        p[0] = new Node("Expr");
      } else {
        p[0] = p[2];
      }
    }
  },
  {
    grammar : `statement_no_new_scope: compound_statement_no_new_scope
                                     | simple_statement 
    `,
    func : (p) => {
      p[0] = p[1]
    }
  },
  {
    grammar : `compound_statement_no_new_scope: LBRACE RBRACE
                                              | LBRACE statement_list RBRACE`,
    func : (p) => {
      if (p.length === 3) {
        p[0] = new Node("ExprList");
      } else {
        p[0] = p[2];
        p[0].noScope = true;
      }
    }
  },
  {
    grammar : `statement_list: statement
                             | statement_list statement 
              `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("StatementList");
        if (p[1]) {
          p[0].push(p[1]);
        }
      } else {
        p[0] = p[1];
        if (p[2]) {
          p[0].push(p[2]);
        }
      }
    }
  },
  {
    grammar : `expression_statement: SEMI
                                   | expression SEMI`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("Expr");
      } else {
        p[0] = p[1];
      }
    }
  },
  {
    grammar : `selection_statement: IF LPAREN expression RPAREN selection_rest_statement `,
    func : (p) => {
      p[0] = new Node("If");
      p[0].push(p[3]);
      p[0].push(p[5]);
    }
  },
  {
    grammar : `selection_rest_statement: statement ELSE statement
                                       | statement `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = new Node("Else");
        p[0].push(p[1]);
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `condition: expression
                        | fully_specified_type ID ASSIGN initializer `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = new Node("Condition");
        p[0].push(p[1]);

        p[0].value = p[2];
        p[0].push(p[4]);
      }
    }
  },
  {
    grammar : `switch_statement: SWITCH LPAREN expression RPAREN LBRACE switch_statement_list RBRACE`,
    func : (p) => {
      p[0] = new Node("Switch");
      p[0].push(p[3]);
      p[0].push(p[6]);
    }
  },
  {
    grammar : `switch_statement_list:
                                    | statement_list`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else if (p.length === 1) {
        p[0] = new Node("StatementList");
      }
    }
  },
  {
    grammar : `case_label: CASE expression COLON
                         | DEFAULT COLON`,
    func : (p) => {
      if (p.length === 3) {
        p[0] = new Node("DefaultCase");
      } else {
        p[0] = new Node("CaseNode");
        p[0].push(p[2]);
      }
    }
  },
  {
    grammar : `iteration_statement: WHILE LPAREN condition RPAREN statement_no_new_scope
                                  | DO statement WHILE LPAREN expression RPAREN SEMI
                                  | FOR LPAREN for_init_statement for_rest_statement RPAREN statement_no_new_scope`,
    func : (p) => {
      if (p[1] === "while") {
        p[0] = new Node("While");
        p[0].push(p[3]);
        p[0].push(p[5]);
      } else if (p[1] === "do") {
        p[0] = new Node("DoWhile");
        p[0].push(p[2]);
        p[0].push(p[5]);
      } else if (p[1] === "for") {
        p[0] = new Node("ForLoop");
        p[0].push(p[3]);
        p[0].push(p[4]);
        p[0].push(p[6]);
      }
    }
  },
  {
    grammar : `for_init_statement: expression_statement
                                 | declaration_statement
              `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `conditionopt : condition
                            |
              `,
    func : (p) => {
      if (p.length === 2) {
        p[0] = p[1];
      } else {
        p[0] = new Node("Expr");
      }
    }
  },
  {
    grammar : `for_rest_statement: conditionopt SEMI
                                 | conditionopt SEMI expression
              `,
    func : (p) => {
      p[0] = new Node("ExprList");

      if (p.length === 3) {
        p[0].push(p[1]);
        p[0].push(new Node("Expr"));
      } else {
        p[0].push(p[1]);
        p[0].push(p[3]);
      }
    }
  },
  {
    grammar : `jump_statement: CONTINUE SEMI
                             | BREAK SEMI
                             | RETURN SEMI
                             | RETURN expression SEMI
                             | DISCARD SEMI /~ Fragment shader only ~/
                             `,
    func : (p) => {
      if (p[1] === "continue") {
        p[0] = new Node("Continue");
      } else if (p[1] === "break") {
        p[0] = new Node("Break");
      } else if (p[1] === "return") {
        p[0] = new Node("Return");
        if (p.length > 3) {
          p[0].push(p[2]);
        }
      } else if (p[1] === "discard") {
        p[0] = new Node("Discard");
      }
    }
  },
  {
    grammar : `external_declaration: function_definition
                                   | declaration 
              `,
    func : (p) => {
      p[0] = p[1];
    }
  },
  {
    grammar : `function_definition: function_prototype compound_statement_no_new_scope`,
    func : (p) => {
      p[0] = p[1];

      p.lexer.popScope();
      p[0].push(p[2]);
    }
  },
  {
    grammar : `translation_unit: external_declaration
                               | translation_unit external_declaration 
`,
    func : (p) => {
      if (p.length === 2) {
        p[0] = new Node("Program");
        if (p[1]) {
          p[0].push(p[1]);
        }
      } else {
        p[0] = p[1];

        if (p[2]) {
          p[0].push(p[2]);
        }
      }
    }
  },
]



let tokens = new Set(["FIELD_SELECTION", "TYPE_NAME"]);
for (let key of keywords) {
  tokens.add(key);
}
for (let tk of tokendef) {
  tokens.add(tk.name);
}

let t = [];
for (let token of tokens) {
  t.push(token);
}
tokens = t;

//export let parser = jscc_util.getParser(lex, parsedef, tokens, precedence, "glsl");
export var parser;

export function getParser() {
  if (!parser) {
    parser = jscc_util.getParser(lex, parsedef, tokens, precedence, "glsl");
  }

  return parser;
}

export function initParser() {
  getParser();
}

export function rebuildParser() {
  return jscc_util.getParser(lex, parsedef, tokens, precedence, "glsl", true);
}

/*
parser.parse(`// It's possible we should lay this out with x and do our own math.
layout(local_size_x = 1, local_size_y = 32) in;

layout(set = 0, binding = 0) readonly buffer SceneBuf {
    uint[] scene;
};

layout(set = 0, binding = 1) buffer TilegroupBuf {
    uint[] tilegroup;
};

layout(set = 0, binding = 2) buffer AllocBuf {
    uint alloc;
};


shared uint intersects[SUBGROUP_SIZE];

struct StackElement {
    PietItemRef group;
    uint index;
    vec2 offset;
};

void main() {
    StackElement stack[MAX_STACK];
    uint stack_ix = 0;
    uint tilegroup_ix = gl_GlobalInvocationID.y * WIDTH_IN_TILEGROUPS + gl_GlobalInvocationID.x;
    TileGroupRef tg_ref = TileGroupRef(tilegroup_ix * TILEGROUP_STRIDE);
    uint tg_limit = tg_ref.offset + TILEGROUP_INITIAL_ALLOC - 2 * TileGroup_size;

    // State for stroke references.
    TileGroupRef stroke_start = TileGroupRef(tg_ref.offset + TILEGROUP_STROKE_START);
    ChunkRef stroke_chunk_start = ChunkRef(stroke_start.offset + 4);
    InstanceRef stroke_ref = InstanceRef(stroke_chunk_start.offset + Chunk_size);
    uint stroke_limit = stroke_start.offset + TILEGROUP_INITIAL_STROKE_ALLOC - Instance_size;
    uint stroke_chunk_n = 0;
    uint stroke_n = 0;

    // State for fill references. All this is a bit cut'n'paste, but making a
    // proper abstraction isn't easy.
    TileGroupRef fill_start = TileGroupRef(tg_ref.offset + TILEGROUP_FILL_START);
    ChunkRef fill_chunk_start = ChunkRef(fill_start.offset + 4);
    InstanceRef fill_ref = InstanceRef(fill_chunk_start.offset + Chunk_size);
    uint fill_limit = fill_start.offset + TILEGROUP_INITIAL_FILL_ALLOC - Instance_size;
    uint fill_chunk_n = 0;
    uint fill_n = 0;

    // Starting point of this tile
    vec2 xy0 = vec2(gl_GlobalInvocationID.xy) * vec2(TILEGROUP_WIDTH_PX, TILEGROUP_HEIGHT_PX);
    vec2 block0 = vec2(gl_GlobalInvocationID.x * TILEGROUP_WIDTH_PX,
        (gl_GlobalInvocationID.y & ~(BLOCK_HEIGHT - 1)) * TILEGROUP_HEIGHT_PX);
    PietItemRef root = PietItemRef(0);
    SimpleGroup group = PietItem_Group_read(root);
    StackElement tos = StackElement(root, 0, group.offset.xy);

    while (true) {
        if (tos.index < group.n_items) {
            uint this_ix = tos.index + gl_LocalInvocationID.y;
            vec4 bb;
            bool hit = false;
            bool is_group = false;
            intersects[gl_LocalInvocationID.y] = 0;
            barrier();
            if (this_ix < group.n_items) {
                Bbox bbox = Bbox_read(Bbox_index(group.bboxes, this_ix));
                bb = vec4(bbox.bbox) + tos.offset.xyxy;
                hit = max(bb.x, block0.x) < min(bb.z, block0.x + float(TILEGROUP_WIDTH_PX))
                    && max(bb.y, block0.y) < min(bb.w, block0.y + float(BLOCK_HEIGHT_PX));
            }

            if (hit) {
                // TODO: this could subsume y part of hit test above, but be careful.
                uint ymin = uint(max(floor(bb.y - block0.y), 0.0)) / TILE_HEIGHT_PX;
                uint ymax = (uint(clamp(ceil(bb.w - block0.y), 0.0, float(BLOCK_HEIGHT_PX))) + TILE_HEIGHT_PX - 1) / TILE_HEIGHT_PX;
                for (uint y = ymin; y < ymax; y++) {
                    atomicOr(intersects[y], 1 << gl_GlobalInvocationID.y);
                }
            }

            barrier();
            uint bitmask = intersects[gl_LocalInvocationID.y];
            while (bitmask != 0) {
                uint item_ix = tos.index + findLSB(bitmask);
                PietItemRef item_ref = PietItem_index(group.items, item_ix);
                uint tag = PietItem_tag(item_ref);
                Instance ins = Instance(item_ref.offset, tos.offset);
                if (tg_ref.offset > tg_limit) {
                    // Allocation exceeded; do atomic bump alloc.
                    uint new_tg = atomicAdd(alloc, TILEGROUP_INITIAL_ALLOC);
                    Jump jump = Jump(TileGroupRef(new_tg));
                    TileGroup_Jump_write(tg_ref, jump);
                    tg_ref = TileGroupRef(new_tg);
                    tg_limit = tg_ref.offset + TILEGROUP_INITIAL_ALLOC - 2 * TileGroup_size;
                }
                TileGroup_Instance_write(tg_ref, ins);
                tg_ref.offset += TileGroup_size;
                if (tag == PietItem_Poly) {
                    if (stroke_ref.offset > stroke_limit) {
                        uint new_stroke = atomicAdd(alloc, TILEGROUP_STROKE_ALLOC);
                        Chunk_write(stroke_chunk_start, Chunk(stroke_chunk_n, ChunkRef(new_stroke)));
                        stroke_chunk_start = ChunkRef(new_stroke);
                        stroke_ref = InstanceRef(new_stroke + Chunk_size);
                        stroke_n += stroke_chunk_n;
                        stroke_chunk_n = 0;
                        stroke_limit = new_stroke + TILEGROUP_STROKE_ALLOC - Instance_size;
                    }
                    Instance_write(stroke_ref, ins);
                    stroke_chunk_n++;
                    stroke_ref.offset += Instance_size;
                } else if (tag == PietItem_Fill) {
                    if (fill_ref.offset > fill_limit) {
                        uint new_fill = atomicAdd(alloc, TILEGROUP_FILL_ALLOC);
                        Chunk_write(fill_chunk_start, Chunk(fill_chunk_n, ChunkRef(new_fill)));
                        fill_chunk_start = ChunkRef(new_fill);
                        fill_ref = InstanceRef(new_fill + Chunk_size);
                        fill_n += fill_chunk_n;
                        fill_chunk_n = 0;
                        fill_limit = new_fill + TILEGROUP_FILL_ALLOC - Instance_size;
                    }
                    Instance_write(fill_ref, ins);
                    fill_chunk_n++;
                    fill_ref.offset += Instance_size;
                }

                bitmask &= bitmask - 1; // clear bottom bit
            }
            tos.index += BLOCK_HEIGHT;
        } else {
            // processed all items in this group; pop the stack
            if (stack_ix == 0) {
                break;
            }
            stack_ix--;
            // Note: writing this out is a workaround for an Nvidia shader compiler crash.
            tos.group = stack[stack_ix].group;
            tos.index = stack[stack_ix].index;
            tos.offset = stack[stack_ix].offset;
            group = PietItem_Group_read(tos.group);
        }
    }
    TileGroup_End_write(tg_ref);

    stroke_n += stroke_chunk_n;
    if (stroke_n > 0) {
        Chunk_write(stroke_chunk_start, Chunk(stroke_chunk_n, ChunkRef(0)));
    }
    tilegroup[stroke_start.offset >> 2] = stroke_n;

    fill_n += fill_chunk_n;
    if (fill_n > 0) {
        Chunk_write(fill_chunk_start, Chunk(fill_chunk_n, ChunkRef(0)));
    }
    tilegroup[fill_start.offset >> 2] = fill_n;
}

`);

//*/

export function fullVisit(ast, cb) {
  function visit(n) {
    cb(n);

    for (let c of n) {
      visit(c);
    }
  }

  visit(ast);
}

export function visit(ast, handlers) {
  if (typeof handlers === "function") {
    return fullVisit(ast);
  }


  function visit(n) {
    if (typeof n === "string") {
      let n2 = new Node("Ident");
      n2.value = n;
      n = n2;
    }

    let type = n.type;
    if (type in handlers) {
      handlers[type](n);
    } else if ("Default" in handlers) {
      handlers.Default(n);
    }

    for (let c of n) {
      visit(c);
    }
  }

  visit(ast);
}

export function controlledVisit(ast, handlers, state) {
  function descend(n, state, do_n=false) {
    if (state === undefined) {
      throw new Error("state cannot be undefined; use null if intentional");
    }

    if (do_n) {
      visit(n, state);
      return;
    }

    for (let c of n) {
      visit(c, state);
    }
  }

  function visit(n, state) {
    if (typeof n === "string") {
      let n2 = new Node("Ident");
      n2.value = n;
      n = n2;
    }

    if (n.type in handlers) {
      handlers[n.type](n, state, descend);
    } else if ("Default" in handlers) {
      handlers.Default(n, state, descend);
    }
  }

  visit(ast, state);
}
