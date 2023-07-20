import * as util from '../util/util.js';

//import '../util/nstructjs.js';
import {parsetable} from './parsetab.js';
import {ASTNode} from '../core/ast.js';

import LZString from '../util/lzstring.js';

const ProdSaveFlags = {
  RHS_SINGLE: 1,
  LHS_SINGLE: 2
};
/*
export class Production {
  constructor(prod) {
    this.flag = 0;

    this.lhs = prod?.lhs;
    this.rhs = prod?.rhs;
    this.id = prod?.id;
    this.code = prod?.code;
    this.level = prod?.level;
    this.flag = 0;

    if (typeof this.lhs === "number") {
      this.flag |= ProdSaveFlags.LHS_SINGLE;
      this.lhs = [this.lhs];
    }
    if (typeof this.lhs === "number") {
      this.flag |= ProdSaveFlags.RHS_SINGLE;
      this.rhs = [this.rhs];
    }
  }
}

Production.STRUCT = `
mathl.Production {
  lhs      : array(short);
  rhs      : array(short);
  level    : short;
  code     : string;
  id       : short;
  flag     : byte;
}
`;
nstructjs.register(Production);

export class StrIntKey {
  constructor(key, val) {
    this.key = key;
    this.value = val;
  }
}
StrIntKey.STRUCT = `
mathl.StrIntKey {
  key   : string;
  value : short;
}
`;
nstructjs.register(StrIntKey);

export class PopTab extends Array {
  constructor(a, b) {
    super();

    this.length = 2;

    this[0] = a;
    this[1] = b;
  }
}
PopTab.STRUCT = `
mathl.PopTab {
  0 : short;
  1 : byte;
}
`
nstructjs.register(PopTab);

export class PackData {
  constructor(parser) {
    this.pop_tab = [];
    this.act_tab = parser?.pdata.act_tab;
    this.goto_tab = parser?.pdata.goto_tab;

    if (parser) {
      for (let p of parser.pdata.pop_tab) {
        this.pop_tab.push(p[0]);
        this.pop_tab.push(p[1]);
      }
    }

    this.labelmap = [];
    let lm = parser?.pdata.labelmap;
    if (lm) {
      for (let k in lm) {
        this.labelmap.push(new StrIntKey(k, lm[k]));
      }
    }


    this.labels = parser?.pdata.labels;

    this.productions = [];

    if (parser) {
      for (let prod of parser.pdata.productions) {
        this.productions.push(new Production(prod));
      }
    }

    this.error_symbol = parser?.pdata.error_symbol;
    this.whitespace_token = parser?.pdata.whitespace_token;
    this.eof_symbol = parser?.pdata.eof_symbol;
      this.defact_tab = parser?.pdata.defact_tab;
    this.hash = parser?.hash;
  }

  loadSTRUCT(reader) {
    reader(this);

    for (let p of this.productions) {
      if (p.flag & ProdSaveFlags.LHS_SINGLE) {
        p.lhs = p.lhs[0];
      }
      if (p.flag & ProdSaveFlags.RHS_SINGLE) {
        p.rhs = p.rhs[0];
      }
    }

    let labelmap = {};
    for (let item of this.labelmap) {
      labelmap[item.key] = item.value;
    }

    this.labelmap = labelmap;

    //let ptab = this.pop_tab;
    //this.pop_tab = [];

    //for (let i=0; i<ptab.length; i += 2) {
    //  this.pop_tab.push([ptab[i], ptab[i+1]]);
    //}
  }
}
PackData.STRUCT = `
mathl.PackData {
  pop_tab           : array(mathl.PopTab);
  act_tab           : array(array(short));
  goto_tab          : array(array(short));
  labelmap          : array(mathl.StrIntKey);
  labels            : array(string);
  productions       : array(mathl.Production);
  error_symbol      : short;
  eof_symbol        : short;
  whitespace_token  : short;
  defact_tab        : array(short);
  hash              : string | ""+this.hash;
} 
`
nstructjs.register(PackData);
nstructjs.validateStructs();
*/

const debug = 0;

class ParseStack {
  constructor(size = 1024) {
    this.array = new Array(size);
    this.length = 0;

    this.itop = this.ibottom = size>>1;
  }

  get top() {
    return this.array[this.itop - 1];
  }

  get bottom() {
    return this.array[this.ibottom];
  }

  [Symbol.iterator]() {
    let this2 = this;

    return (function* () {
      for (let i = this2.ibottom; i < this2.itop; i++) {
        yield this.array[i];
      }
    })();
  }

  get(i) {
    return this.array[i + this.ibottom];
  }

  shiftN(n) {
    this.ibottom += n;
    this.length -= n;

    return this;
  }

  forEach(cb) {
    for (let i = this.ibottom; i < this.itop; i++) {
      cb(this.array[i], i);
    }

    return this;
  }

  shift() {
    this.length--;
    return this.array[this.ibottom++];
  }

  unshift(item) {
    this.length++;
    this.array[--this.ibottom] = item;
  }

  push(item) {
    this.length++;
    this.array[this.itop++] = item;
  }

  pop() {
    this.length--;
    return this.array[--this.itop];
  }
}

export class Parser {
  constructor(lexer, pdata, hash) {
    this.pdata = pdata;
    this.lexer = lexer;
    this.hash = hash;
    this.onerror = undefined;
  }

  save(zipTool = LZString.compressToBase64) {
    let data = zipTool(JSON.stringify(this));

    //console.log((data.length/1024/1024).toFixed(2) + "mb");
    return data;
    /*
    let packdata = new PackData(this);
    let data = [];
    nstructjs.writeObject(data, packdata);
    console.log(data.length/1024);

    if (zipTool) {
      let s = '';

      let off = 0;
      let wid = ~~(Math.random()*data.length*Math.sqrt(11));
      console.log("wid", wid);
      for (let i=0; i<data.length; i += 2) {
        let i2 = i;

        i2 += wid;
        i2 = i2 % data.length;

        let a = data[i2]
        let b = data[i2+1] ?? 0;

        s += String.fromCharCode(a | (b<<8));
      }
      data = s;

      //data = JSON.stringify(this);

      fs.writeFileSync("parsetable.json", JSON.stringify(this));
      data = LZString.compressToBase64(data);

      //data = LZString.compress(data);

      console.log(data.length/1024);

      data = LZString.decompress(data);
      data = '1';

      //data = btoa(data);
      //data = zipTool(data);
    }

    return data;
    //*/
  }

  load(data, actions, unzipTool = LZString.decompressFromBase64) {
    data = unzipTool(data);
    data = JSON.parse(data);
    this.loadJSON(data, actions);

    /*
    if (unzipTool) {
      data = unzipTool(data);
    }

    if (typeof data === "string") {
      let arr = [];
      for (let i=0; i<data.length; i++) {
        arr.push(data.charCodeAt(i));
      }
      data = arr;
    }

    data = new DataView(new Uint8Array(data).buffer);
    let pdata = nstructjs.readObject(data, PackData);

    this.pdata = pdata;

     */
  }

  compressPopTab() {
    let bits = 10;
    let next = (1<<bits) - 1;
    let out = [];

    for (let p of this.pdata.act_tab) {
      for (let item of p) {
        out.push(item);
      }

      out.push(next);
    }

    //we don't stray far intonegative territory. . .
    let half = (1<<(bits - 3)) - 1;

    out = out.map(f => (f + half));

    if (1) {
      let out2 = [];
      for (let i = 0; i < out.length; i++) {
        for (let j = 0; j < bits; j++) {
          out2.push(out[i] & (1<<j) ? 1 : 0);
        }
      }

      let bits2 = 15;
      out = out2;
      let len = Math.ceil(out.length/bits2)*bits2;
      while (out.length < len) {
        out.push(0);
      }

      out2 = [];
      for (let i = 0; i < len; i += bits2) {
        let b = 0;

        for (let j = 0; j < bits2; j++) {
          b |= (1<<j)*out[i + j];
        }

        out2.push(b);
      }
      out = out2;

      console.log(out2);
      console.log(2*out2.length/1024);
    } else {
      console.log(out);
    }

    let s = '';

    for (let i = 0; i < out.length; i++) {
      let a = out[i];

      s += String.fromCharCode(a);
    }

    s = LZString.compress(s);
    console.log(s.length*2/1024);
    console.log("size:", 2*out.length/1024);
  }

  toJSON() {
    let pdata = this.pdata;


    return {
      pop_tab         : pdata.pop_tab,
      act_tab         : pdata.act_tab,
      goto_tab        : pdata.goto_tab,
      labelmap        : pdata.labelmap,
      labels          : pdata.labels,
      error_symbol    : pdata.error_symbol,
      eof_symbol      : pdata.eof_symbol,
      whitespace_token: pdata.whitespace_token,
      defact_tab      : pdata.defact_tab,
      productions     : pdata.productions,
      hash            : this.hash
    };
  }

  loadJSON(obj, actions) {
    let actions2 = {};

    actions2[0] = function (p) {
      p[0] = p[1];
    }

    for (let p of obj.productions) {
      let code = p.code.trim();
      if (code.startsWith("_")) {
        code = code.slice(1, code.length);

        actions2[p.id] = actions[code];
      }
    }

    this.pdata = obj;
    this.hash = obj.hash;
    this.pdata.actions = actions2;
  }

  printTokens(buf) {
    this.lexer.input(buf);
    while (!this.lexer.at_end()) {
      let t = this.lexer.next();
      console.log("" + t);
    }
  }

  parse(buf, onerror) {
    if (buf.trim().length === 0) {
      let ret = new ASTNode("Program");
      return ret;
    }
    this.lexer.input(buf);

    this.onerror = onerror;

    let linemap = new Array(buf.length);
    let colmap = new Array(buf.length);

    let linei = 0, coli = 0;

    for (let i = 0; i < buf.length; i++) {
      linemap[i] = linei;
      colmap[i] = coli++;

      if (buf[i] === "\n") {
        linei++;
        coli = 0;
      }
    }

    let lexer = this.lexer;
    let pdata = this.pdata;

    let pop_tab = this.pdata.pop_tab;
    let act_tab = this.pdata.act_tab;
    let goto_tab = this.pdata.goto_tab;
    let labelmap = this.pdata.labelmap

    class PcbClass {
      constructor() {
        this.line = 1;
        this.column = 1;
        this.offset = 0;
        this.error_step = 0;
        this.src = "";
        this.att = "";
        this.la = null;
        this.act = null;
      }

      lex(){
        if (debug) {
          console.log("next token");
        }

        let ret = lexer.next();
        if (ret === undefined) {
          this.la = pdata.eof_symbol;
          return pdata.eof_symbol;
        }

        this.att = ret.value
        this.offset = ret.lexpos

        this.la = labelmap[ret.type];
        this.token = ret;
        this.line = ret.lexer.lineno;

        return labelmap[ret.type];
      }
    }

    let actions = pdata.actions;

    function get_act(top, la) {
      for (let i = 0; i < act_tab[top].length; i += 2) {
        if (act_tab[top][i] === la)
          return act_tab[top][i + 1];
      }

      return null;
    }

    function get_goto(top, pop) {
      for (let i = 0; i < goto_tab[top].length; i += 2) {
        if (goto_tab[top][i] === pop)
          return goto_tab[top][i + 1];
      }
      return null;
    }

    let sstack = new ParseStack();
    let vstack = new ParseStack();

    sstack.push(0);
    vstack.push(0);

    let defact_tab = pdata.defact_tab;
    let labels = pdata.labels;
    let err_cnt = 0;
    let rval, act, i = 0;
    let PCB = new PcbClass();

    let this2 = this;

    function doerror(p) {
      if (this2.onerror) {
        this2.onerror(p);
      }

      let line = -1, col = -1;
      if (p) {
        line = p.line;
        line = linemap[p.offset];
        col = colmap[p.offset];

        console.log(p);
      }

      console.log(p)
      let lines = buf.split("\n");
      let s = "";

      for (let i = line - 15; i < line + 25; i++) {
        if (i < 0) continue;
        if (i >= lines.length) break;

        let si = "" + i;
        while (si.length < 3) {
          si = " " + si;
        }

        s += si + ": " + lines[i] + "\n";
      }

      console.log(s);
      let message = "";

      message += `${line}:${col}: Syntax Error\n`
      let l = lines[line];
      //l = l.slice(0, col) + util.termColor(l[col], "red") + l.slice(col+1, l.length);
      message += "  " + l + "\n";

      for (let i = 0; i < col + 2; i++) {
        message += " ";
      }
      message += "^\n";

      console.warn(message);
      //process.exit();

      throw new Error(message);
    }

    console.log("%cPARSING!", "color : orange;");

    let err_off = new ParseStack();
    let err_la = new ParseStack();

    PCB.lex();
    while (1) {//!this.lexer.at_end()) {
      PCB.act = get_act(sstack.bottom, PCB.la);
      if (debug) {
        console.log(PCB.act, PCB.la);
      }

      if (PCB.act === null && defact_tab[sstack.bottom] >= 0)
        PCB.act = -defact_tab[sstack.bottom];
      if (PCB.act === null) {//Parse error? Try to recover!
        //Report errors only when error_step is 0, and this is not a
        //subsequent error from a previous parse
        if (PCB.error_step === 0) {
          err_cnt++;
          err_off.unshift(PCB.offset - PCB.att.length);
          err_la.unshift([]);

          for (i = 0; i < act_tab[sstack.bottom].length; i += 2) {
            err_la.get(0).push(labels[act_tab[sstack.bottom][i]]);
          }

          PCB.errorLabels = err_la;
          doerror(PCB);
        }

        //Perform error recovery
        while (sstack.length > 1 && PCB.act === null) {
          sstack.shift();
          vstack.shift();
          //Try to shift on error token
          PCB.act = get_act(sstack.bottom, PCB.la);
          if (PCB.act === error_token) {
            sstack.unshift(PCB.act);
            vstack.unshift("");
          }
        }

        //Is it better to leave the parser now?
        if (sstack.length > 1 && PCB.act !== null) {
          //Ok, now try to shift on the next tokens
          while (PCB.la !== eof) {
            PCB.act = act_tab[sstack.bottom][i + 1];
            if (PCB.act != null) break;
            while (PCB.lex() != null) {
              PCB.offset++;
            }
          }
        }
        if (PCB.act === null || PCB.la === eof) {
          break;
        }

        //Try to parse the next three tokens successfully...
        PCB.error_step = 3;
      }

      if (PCB.act > 0) {//Shift
        //Parse tree generation
        sstack.unshift(PCB.act);
        vstack.unshift(PCB.att);
        PCB.lex();

        //Successfull shift and right beyond error recovery?
        if (PCB.error_step > 0)
          PCB.error_step--;
      } else {	//Reduce
        act = -PCB.act;
        //vstack.unshift(vstack);

        let prod = pdata.productions[act].rhs;
        let p = [null];

        p.lexer = lexer;

        for (let i = 0; i < prod.length; i++) {
          p.push(vstack.get(prod.length - i - 1));
        }

        if (debug) {
          console.log("P", p);
        }
        //console.log("V", vstack);

        let actfunc = actions[act];
        if (!actfunc) {
          p[0] = p[1];
        } else {
          actfunc(p);
        }

        rval = p[0];
        //console.log("action", act, vstack, actfunc);

        //rval = ACTIONS(act, vstack, PCB);

        //vstack.shift();
        sstack.shiftN(pop_tab[act][1]);
        vstack.shiftN(pop_tab[act][1]);

        PCB.act = get_goto(sstack.bottom, pop_tab[act][0]);
        //Do some parse tree construction if desired
        //Goal symbol match?
        if (act === 0) break; //Don't use PCB.act here!

        //...and push it!
        sstack.unshift(PCB.act);
        vstack.unshift(rval);
      }
    }

    let ret = rval;
    globalThis.noderet = ret;

    console.log("%cDone.", "color : orange;");

    return ret;
  }
}

export function getParser(lexer, parsedef, tokenlist, prec, parserName, force = false) {
  if (parserName === undefined) {
    throw new Error("parserName cannot be undefined");
  }

  let grammar = "/~ We use our own lexical scannar ~/\n";

  let visit = {};

  var _i = 0;

  for (let list of prec) {
    let prec = list[0];
    if (prec === "left")
      prec = "<";
    else if (prec === "right")
      prec = ">"
    else
      prec = ""

    grammar += prec + " ";
    for (let i = 1; i < list.length; i++) {
      if (i > 1) {
        grammar += "  ";
      }
      grammar += ` '${_i++}' ${list[i]}\n`

      visit[list[i]] = 1;
    }
    grammar += ";\n";

  }

  for (let t of tokenlist) {
    if (t in visit) {
      continue;
    }

    grammar += `'${_i++}'  ${t} \n`
  }
  grammar += ";\n\n##\n\n";

  parsedef.reverse();

  let idgen = 0;
  for (let p of parsedef) {
    p.id = idgen++;
  }

  for (let p of parsedef) {
    let lines = p.grammar.split("\n");
    let li = 0;

    for (let l of lines) {
      if (li === 0) {
        l = "               " + l;
      }

      if (l.trim().length === 0) {
        li++;
        continue;
      }

      grammar += l + ` [*_${p.id}*]\n`;
      li++;
    }

    grammar += "\n;\n";
  }

  let actions = {};
  for (let p of parsedef) {
    actions["" + p.id] = p.func;
    p.func.grammar = p.grammar;
  }

  let parser;
  let hash = util.strhash(grammar);
  let storageKey = "parseTable_" + parserName;

  //if (localStorage
  if (!force && parsetable) {
    parser = new Parser(lexer);
    parser.load(parsetable, actions);
  } else if (!force && typeof globalThis.localStorage !== "undefined") {
    /*
    let data = localStorage[storageKey];

    if (data !== undefined) {
      let buf = data;

      try {
        let json = JSON.parse(buf);
        parser = new Parser(lexer);
        parser.loadJSON(json, actions);
      } catch (error) {
        util.print_stack(error);
        console.warn("failed to load parse tables from localStorage; rebuilding. . .");
        parser = undefined;
      }
    }
    */
  }

  globalThis.grammar = grammar;

  if (parser && parser.hash === hash) {
    console.log("Old hash:", parser.hash, "new hash:", hash);

    globalThis.parser = parser;
    return parser;
  } else if (!force) {
    console.log("Old hash:", parser.hash, "new hash:", hash);
    throw new Error("parser is out of date; run build_parsetable.js");
  }

  /*
  return {
    parse() {

    }
  }//*/

  //console.log(grammar);
  console.log(`Building parse tables (will be cached in localStorage[${storageKey}]. . .`);

  let parse_grammar = jscc.require("lib/jscc/parse");
  let integrity = jscc.require("lib/jscc/integrity");
  let first = jscc.require("lib/jscc/first");
  let tabgen = jscc.require("lib/jscc/tabgen");
  let lexdfa = jscc.require("lib/jscc/lexdfa");
  let global = jscc.require("lib/jscc/global");
  let printtab = jscc.require("lib/jscc/printtab");
  let MODE_GEN = jscc.require("lib/jscc/enums/MODE_GEN");
  let SPECIAL = jscc.require("lib/jscc/enums/SPECIAL");
  var templateString = global.DEFAULT_DRIVER;

  let ret = parse_grammar(grammar, "grammar");

  let driver = templateString;
  if (!ret) {
    integrity.undef();
    integrity.unreachable();
    first.first();
    tabgen.lalr1_parse_table(false);
    integrity.check_empty_states();
    global.dfa_states = lexdfa.create_subset(global.nfa_states.value);
    global.dfa_states = lexdfa.minimize_dfa(global.dfa_states);

    let pdata = {};

    var pop_tab_json = [];
    for (var i = 0; i < global.productions.length; i++) {
      pop_tab_json.push([global.productions[i].lhs, global.productions[i].rhs.length]);
    }

    pdata.pop_tab = pop_tab_json;

    var act_tab_json = [];
    for (var i = 0; i < global.states.length; i++) {
      var act_tab_json_item = [];

      for (let j = 0; j < global.states[i].actionrow.length; j++) {
        act_tab_json_item.push(global.states[i].actionrow[j].symbol,
          global.states[i].actionrow[j].action);
      }
      act_tab_json.push(act_tab_json_item);
    }

    pdata.act_tab = act_tab_json;

    var goto_tab_json = [];
    for (var i = 0; i < global.states.length; i++) {
      var goto_tab_json_item = [];

      for (let j = 0; j < global.states[i].gotorow.length; j++) {
        goto_tab_json_item.push(global.states[i].gotorow[j].symbol,
          global.states[i].gotorow[j].action);
      }
      goto_tab_json.push(goto_tab_json_item);
    }

    pdata.goto_tab = goto_tab_json;

    var defact_tab_json = [];
    for (var i = 0; i < global.states.length; i++) {
      defact_tab_json.push(global.states[i].def_act);
    }

    pdata.defact_tab = defact_tab_json;

    let arr2 = [];
    for (var i = 0; i < global.symbols.length; i++) {
      arr2.push(global.symbols[i].label);
    }

    pdata.labels = arr2;

    var eof_id = -1;
    // Find out which symbol is for EOF
    for (var i = 0; i < global.symbols.length; i++) {
      if (global.symbols[i].special === SPECIAL.EOF) {
        eof_id = i;
        break;
      }
    }
    pdata.eof_symbol = eof_id;

    var error_id = -1;
    for (var i = 0; i < global.symbols.length; i++) {
      if (global.symbols[i].special === SPECIAL.ERROR) {
        error_id = i;
        break;
      }
    }
    pdata.error_symbol = error_id;

    pdata.whitespace_token = printtab.get_whitespace_symbol_id();

    let labelmap = {};
    for (let i = 0; i < pdata.labels.length; i++) {
      labelmap[pdata.labels[i]] = i;
    }
    pdata.labelmap = labelmap;

    pdata.productions = global.productions;

    let actions2 = {};
    actions2[0] = function (p) {
      p[0] = p[1];
    }

    for (let p of global.productions) {
      let code = p.code.trim();
      if (code.startsWith("_")) {
        code = code.slice(1, code.length);

        actions2[p.id] = actions[code];
      }
    }

    pdata.actions = actions2;

    //ret = driver;
    ret = pdata;
  }

  globalThis.grammar2 = "";

  for (let k in actions) {
    let act = actions[k];
    grammar2 += "" + act + "\n";
  }

  parser = new Parser(lexer, ret, hash);

  if (typeof globalThis.localStorage !== "undefined") {
    globalThis.localStorage[storageKey] = JSON.stringify(parser.toJSON());
  }
  globalThis.parser = parser;

  return parser;
}