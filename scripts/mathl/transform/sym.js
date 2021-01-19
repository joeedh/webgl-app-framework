import {Precedence} from '../parser/parser.js';

let negate = (f) => binop(f, -1, "*");

let chain = (df, x, name) => {
  return df.sub(name, x).mul(x.df(name));
}

export const builtin_dvs = {
  cos : (name, x) => chain(negate(call("sin", [name])), x, name),
  sin : (name, x) => chain(call("cos", [name]), x, name),
  fract : (name, x) => chain(sym(1.0), x, name),
  floor : (name, x) => sym(0.0),
  ceil : (name, x) => sym(0.0),
  min : (name, x) => sym(0.0),
  max : (name, x) => sym(0.0),
  step : (name, x) => sym(0.0),
  /*
  tent : (name, x) => {
    let f = binop(call("fract", [sym(name)]), 0.5, ">=");

    f = binop(f, 2.0, "*");
    f = binop(f, 1.0, "-");

    return chain(f, x, name);
  },*/
  log : (name, x) => x.df(name).div(x),
  sign : (name, x) => sym(0),
  abs : (name, x) => chain(call("sign", [sym(name)]), x)
};


let Prec = Object.assign({}, Precedence);
//sym code internally builds exponential operators
Prec["**"] = {
  prec : Precedence["*"].prec-1,
  assoc : "left"
};

export const SymTypes = {
  BINOP   : 1,
  CALL    : 2,
  CONST   : 4,
  VAR     : 8,
  UNARYOP : 16
};

export class Sym extends Array {
  constructor(type) {
    super();
    this.type = type;
    this.parent = undefined;
  }

  static isRootType(sym) {
    sym = checksym(sym);
    return sym.type & (SymTypes.CONST|SymTypes.VAR);
  }

  isZero() {
    let f = (""+this).trim();
    return f === "0" || f === "0.0" || f === "-0.0" || f === "+0.0";
  }

  df(name) {
    throw new Error("Sym.prototype.df(): implement me!");
  }

  subst(name, b) {
    b = checksym(b);

    for (let c of this.children) {
      if (c instanceof VarSym && c.toString().trim() === name) {
        let b2 = b.copy();
        b2.parent = this;

        this.replace(c, b2);
      } else {
        c.subst(name, b);
      }
    }
  }

  add(b) {
    return binop(this, b, "+");
  }

  sub(b) {
    return binop(this, b, "-");
  }

  mul(b) {
    return binop(this, b, "*")
  }

  div(b) {
    return binop(this, b, "/");
  }

  call(name, args) {
    return call(name, args);
  }

  exp(b) {
    return binop(this, b, "**");
  }

  gthan(b) {
    return binop(this, b, ">");
  }

  lthan(b) {
    return binop(this, b, "<");
  }

  mod(b) {
    return binop(this, b, "%");
  }

  equals(b) {
    return binop(this, b, "==");
  }

  lequals(b) {
    return binop(this, b, "<=");
  }

  gequals(b) {
    return binop(this, b, ">=");
  }

  lor(b) {
    return binop(this, b, "||");
  }

  land(b) {
    return binop(this, b, "&&");
  }

  lnot() {
    return unaryop(this, "-");
  }

  nequals() {
    return binop(this, b, "!=");
  }

  push(b) {
    if (b.parent !== undefined) {
      //make a deep copy
      b = b.copy();
    }

    super.push(b);
    b.parent = this;
  }

  //does deep copies!
  copy() {
    throw new Error("implement me!");
  }

  _copyChildren(b) {
    for (let c of b) {
      this.push(b.copy());
    }

    return this;
  }
}

export class ValueSym extends Sym {
  constructor(val) {
    super(SymTypes.CONST);
    this.value = val;
  }

  df(name) {
    return sym(0.0);
  }

  copy() {
    return new ValueSym(this.value);
  }

  toString() {
    let f = ""+this.value;

    if (f.search(/\./) < 0) {
      f += ".0";
    }

    return f;
  }
}

export class VarSym extends Sym {
  constructor(varname) {
    super(SymTypes.VAR);
    this.value = varname;
  }

  df(name) {
    if (this.toString().trim() === name) {
      return sym(1.0);
    }

    return sym(0.0);
  }

  copy() {
    return new VarSym(this.value);
  }

  toString() {
    return "" + this.value;
  }
}

export class UnarySym extends VarSym {
  constructor(a, op) {
    super(SymTypes.UNARYOP);

    this.op = op;

    if (a) {
      this.push(a);
    }
  }

  copy() {
    return new UnarySym(this[0], this.op);
  }

  toString() {
    if (this[0].length > 0) {
      return `${this.op}(${this[0]})`;
    }

    let b = (""+this[0]).trim();
    if (b.startsWith("-") && this.op === "-") {
      return b;
    }

    return `${this.op}${b}`;
  }
}

export class ArrayVarSym extends VarSym {
  constructor(varname, idx) {
    super(varname);
    this.idx = idx;
  }

  copy() {
    let ret = new ArrayVarSym();

    ret.value = this.value;
    ret.idx = this.idx;

    return ret;
  }

  toString() {
    return `${this.value}[${this.idx}]`;
  }
}

export class BinOpSym extends Sym {
  constructor(a, b, op) {
    super(SymTypes.BINOP);

    if (a && b) {
      this.push(a);
      this.push(b);
    }

    this.op = op;

    this.parens = false;
  }

  df(name) {
    let a = this[0];
    let b = this[1];
    let op = this.op;

    let na = a.toString().trim(), nb = b.toString().trim();
    if (Sym.isRootType(a) && Sym.isRootType(b)) {
      if (na !== name && nb !== name) {
        return sym(0);
      }
    }

    /*
    operator a, b;

    df(a(name)**b(name), name);
    df(a(name)*b(name), name);
    */
    let r1, r2, r3, r4;

    switch (op) {
      case "**":
        r1 = a.exp(b);
        r2 = a.mul(b.df(name)).mul(call("log", a));
        r2.add(b.mul(a.df(name)));

        return r1.mul(r2).div(a);
      case "*":
        r1 = a.mul(b.df(name));
        r2 = b.mul(a.df(name));
        return r1.add(r2);
      case "+":
        return a.df(name) + b.df(name);
      case "-":
        return a.df(name) - b.df(name);
      case "%":
        return sym(1.0);
      case ">":
      case "<":
      case ">=":
      case "<=":
      case "==":
      case "||":
      case "&&":
      case "^^":
        return sym(0.0);
    }

    throw new Error("invalid operator " + op);
  }

  copy() {
    let ret = new BinOpSym(this[0].copy(), this[1].copy(), this.op);
    ret.parens = this.parens;
    return ret;
  }

  toString() {
    let parens = this.parens;

    if (!parens && this.parent && this.parent instanceof BinOpSym) {
      let p1 = Prec[this.op].prec;
      let p2 = Prec[this.parent.op].prec;
      parens = p1 > p2;
    }

    let s = '';
    if (parens) {
      s += '('
    }

    s += `${this[0]} ${this.op} ${this[1]}`;
    if (parens) {
      s += ')';
    }

    return s;
  }
}

export class CallSym extends Sym {
  constructor(name, args) {
    super(SymTypes.CALL);

    this.value = name;

    if (args !== undefined) {
      for (let arg of args) {
        this.push(arg);
      }
    }
  }

  df(name) {
    if (!this.value in builtin_dvs) {
      throw new Error("unknown builtin function " + this.value);
    }

    let func = builtin_dvs[this.value];
    let args = [name].concat(arguments);

    return func.apply(this, args);
  }

  copy() {
    return new CallSym(this, this.map(f => f.copy()));
  }

  toString() {
    let s = `${this.value}(`;
    for (let i=0; i<this.length; i++) {
      if (i > 0) {
        s += ", ";
      }
      s += this[i];
    }

    return s + ")";
  }
}

export function sym(val) {
  if (typeof val === "number") {
    val = new ValueSym(val);
  } else if (typeof val === "string") {
    val = new VarSym(val);
  } else if (sym instanceof Sym) {
    return sym.copy();
  }

  return val;
}

export function checksym(s) {
  if (typeof s !== "object" || !(s instanceof Sym)) {
    s = sym(s);
  }

  return s;
}

export function call(name, args) {
  args = args.map((arg) => {
    if (typeof arg !== "object" || !(arg instanceof Sym)) {
      return sym(arg);
    }

    return arg;
  });

  return new CallSym(name, args);
}

export function avar(name, idx) {
  return new ArrayVarSym(name, idx);
}

let evals = {
  "+" : (a, b) => a + b,
  "-" : (a, b) => a - b,
  "*" : (a, b) => a * b,
  "/" : (a, b) => a / b,
  "**" : (a, b) => a ** b,
  "&&" : (a, b) => a && b,
  "||" : (a, b) => a || b,
  "==" : (a, b) => a === b,
  ">=" : (a, b) => a >= b,
  "<=" : (a, b) => a <= b,
  ">" : (a, b) => a > b,
  "<" : (a, b) => a < b,
};

let _n = 0;

export function binop(a, b, op) {
  a = checksym(a);
  b = checksym(b);

  if (op in evals && a instanceof ValueSym && b instanceof ValueSym) {
    let f = evals[op](a.value, b.value);
    return sym(f);
  }

  if (op === "+" && a.toString() === b.toString()) {
    return binop(2.0, a, "*");
  }

  if (op === "*" && a.toString() === b.toString()) {
    op = "**";
    b = sym(2);
  }

  /*
  let combine = op === "**" && a instanceof BinOpSym && a.op === "**";
  combine = combine && b instanceof ValueSym;
  combine = combine && a[1] instanceof ValueSym;
  //*/

  return new BinOpSym(a, b, op);
}

export function unaryop(a, op) {
  a = checksym(a);

  if (a instanceof ValueSym && op === "-") {
    a.value = -a.value;

    return a;
  }

  return new UnarySym(a, op);
}

function makeBinOp(op) {
  return (a, b) => new BinOpSym(a, b, op);
}

let _binops = ["+", "-", "/", "*", "!=", "=", "==", ">=", "<=", "||", "&&", "^"];

export const binops = {};
for (let k of _binops) {
  binops[k] = makeBinOp(k);
}
