import {GLSLLexer} from './parser.js';

export function stripComments(code) {
  let out = '';

  let next = (i) => {
    return i < code.length - 1 ? code[i + 1] : undefined;
  }

  let prev = (i) => {
    return i > 0 ? code[i - 1] : undefined;
  }

  let states = {
    main(i) {
      if (code[i] === "/" && next(i) === "/") {
        this.state = "linecomment";
        out += " ";
        return i + 1;
      } else if (code[i] === "/" && next(i) === "*") {
        this.state = "comment";
        out += "  ";
        return i + 2;
      } else {
        out += code[i];
      }

      return i + 1;
    },
    linecomment(i) {
      if (code[i] === "\n") {
        this.state = "main";
        out += "\n";
      } else {
        out += " ";
      }

      return i + 1;
    },

    comment(i) {
      if (code[i] === '*' && next(i) === '/') {
        this.state = "main";
        out += "  ";
        return i + 2;
      }

      if (code[i] === "\n") {
        out += "\n";
      } else {
        out += " ";
      }

      return i + 1;
    },
    ifstack: [],
    scope  : {},
    state  : "main"
  }

  let i = 0;
  while (i < code.length) {
    let start = i;

    i = states[states.state](i);

    if (i === start) {
      i++;
    }
  }

  return out;
}

export function preprocess(inCode) {
  let lex = new GLSLLexer();
  let code = stripComments(inCode);
  lex.input(code);

  function log() {
    //console.log(...arguments);
  }

  //strip comments

  let lines = code.split("\n");
  let lines2 = [];

  function error(linenr, msg) {
    msg = "Error at line " + (linenr + 1) + ": " + msg + "\n\n" + lines[linenr] + "\n";
    console.error(msg);
    throw new Error(msg);
  }

  let collectargs = (arg) => {
    let args2 = [""];
    let depth = 0;
    let j = 0;

    for (; j < arg.length; j++) {
      if (j > 500) {
        arg = arg.slice(0, 50) + ".....";
        error(-1, `Bad macro call ${k}(${arg})`);
      }

      if (arg[j] === ")" && depth === 1) {
        j++;
        break;
      } else if (arg[j] === "(" || arg[j] === "[" || arg[j] === "}") {
        depth++;
      } else if (arg[j] === ")" || arg[j] === "]" || arg[j] === "}") {
        depth--;
      } else if (arg[j] === ",") {
        args2.push("");
      } else {
        args2[args2.length - 1] += arg[j];
      }
    }

    return [args2, j];
  }

  let isws = (s) => {
    return s === " " || s === "\t" || s === "\r" || s === "\n";
  };

  let escape = (re) => {
    return re;
  }
  let boundary_re = `[ \n\r\t()\\-=\[\]{}\\<\\>\\?\.,\\/\\&*%@!~|;]|\\^`;
  let states = {
    res         : {},
    res2        : {},
    sortedmacros: [],
    sorteddefs  : [],

    push(msg) {
      this.ifstack.push([this.enabled, this.pop_depth]);
      console.log("push", msg, this.ifstack, this.enabled);
    },
    pop(msg) {
      [this.enabled, this.pop_depth] = this.ifstack.pop();

      console.log("pop", msg, this.ifstack, this.enabled, this.pop_depth);
      return this.enabled;
    },

    sortmacros() {
      let list = Object.keys(this.macros);
      list.sort((a, b) => b.length - a.length);

      this.sortedmacros = list;

      list = Object.keys(this.defs);
      list.sort((a, b) => b.length - a.length);

      this.sorteddefs = list;
    },

    subst(s) {
      let found = 1;
      let _i = 0;

      while (found) {
        found = false;

        for (let def of this.sorteddefs) {
          let re = this.res[def];
          if (!re) {
            let b = boundary_re;
            re = `(${b}?)(${escape(def)})(${b}?)`;
            re = new RegExp(re, "g");
            this.res[def] = re;
          }

          if (s.search(re) >= 0) {
            found = 1;
          }

          s = s.replace(re, `$1${this.defs[def]}$3`);
        }

        for (let k of this.sortedmacros) {
          let re = this.res[k];
          if (!re) {
            let b = boundary_re;
            re = `(${b}?)(${escape(k)})(${b}?)`;
            re = new RegExp(re, "g");
            this.res[k] = re;
          }

          let [args, buf] = this.macros[k];
          let i = s.search(re);

          if (i < 0) {
            continue;
          }

          let arg = s.slice(i + k.length, s.length).trim();

          if (!arg.startsWith("(")) {
            continue;
          }

          let [args2, end] = collectargs(arg);

          let send = s.slice(i + k.length + end, s.length);

          s = s.slice(0, i);

          args2 = args2.map(f => f.trim());

          for (let j = 0; j < args.length; j++) {
            if (args[j] === "") {
              continue;
            }
            let arg = j >= args2.length ? "" : args2[j];

            if (!(arg in this.res2)) {
              let b = boundary_re;

              let re = `(${b}?)(${escape(args[j])})(${args[j]}?)`;

              re = new RegExp(re, "g");
              this.res2[k] = re;

            }

            let re2 = this.res2[arg];
            buf = buf.replace(re2, arg);
          }

          if (_i++ > 1000) {
            error(-1, "Macro recursion detected");
            break;
          }

          s += buf;
          s += send;

          found = true;
        }
      }

      while (s.endsWith("\n") || s.endsWith("\r")) {
        s = s.slice(0, s.length-1);
      }

      return s;
    },

    main(i) {
      let l = lines[i];

      if (!l.trim().startsWith("#")) {
        if (this.enabled) {
          l = this.subst(l);
          lines2.push(l);
        } else {
          lines2.push("");
        }
        return i + 1;
      }

      l = l.trim();

      while (i < lines.length - 1 && l.trim().endsWith("\\")) {
        i++;
        lines2.push("");

        l = l.slice(0, l.length - 1) + " " + lines[i].trim()
      }
      i++;

      l = l.trim().replace(/\t/g, " ");

      let parts = l.split(" ");
      let keyword = parts[0];
      keyword = keyword.slice(1, keyword.length).trim();

      let was_elif = false;
      let was_elif_enabled = false;

      let lastkeyword = this.last_keyword;
      this.last_keyword = keyword;

      let checkElseEnabled = (msg) => {
        let enabled = true;

        for (let item of this.ifstack) {
          if (!item[0]) {
            enabled = false;
          }
        }


        log("check " + msg, this.ifstack, this.enabled, enabled && !this.enabled);
        return enabled && !this.enabled;
      }

      if (keyword === "define") {
        if (parts.length === 1) {
          error(i, "Expected macro name");
        }

        let name;

        let buf = parts.slice(1, parts.length).join(" ");

        for (let j = 0; j < buf.length; j++) {
          if (j >= buf.length || isws(buf[j]) || buf[j] === "(") {
            name = buf.slice(0, j).trim();
            buf = buf.slice(j, buf.length).trim();

            break;
          }
        }

        if (buf.startsWith("(")) {
          let [args, end] = collectargs(buf);

          args = args.map(f => f.trim());

          buf = buf.slice(end, buf.length).trim();
          this.macros[name] = [args, buf];
          this.sortmacros();
        } else {
          this.defs[name] = buf.trim();
          this.sortmacros();
        }

        lines2.push("");
        return i;
      } else if (keyword === "extension") {
        //ignore
        lines2.push("");
        return i;
      } else if (keyword === "elif") {
        let enabled = checkElseEnabled("elif");
        log("ELIF!", enabled, this.ifstack, this.enabled, enabled);

        this.enabled = enabled;
        this.push("elif");

        this.pop_depth++;

        if (enabled) {
          was_elif = true;
          was_elif_enabled = false;
          keyword = "if";
        } else {
          this.enabled = false;

          lines2.push("");
          return i;
        }
      }

      if (keyword === "ifdef") {
        this.push("ifdef");
        let name = parts[1].trim();

        this.enabled = name in this.macros || name in this.defs;
        lines2.push("");
        return i;
      } else if (keyword === "ifndef") {
        this.push("ifndef");
        let name = parts[1].trim();

        this.enabled = !(name in this.macros || name in this.defs);
        lines2.push("");
        return i;
      } else if (keyword === "else") {
        this.enabled = checkElseEnabled("else");

        lines2.push("");
        return i;
      } else if (keyword === "endif") {
        let count = this.pop_depth;

        for (let j = 0; j < count; j++) {
          this.pop("endif");
        }

        lines2.push("");
        return i;
      } else if (keyword === "if") {
        let code = parts.slice(1, parts.length).join(" ");

        code = code.replace(/defined\((.*)\)/g, "defined('$1')");

        let defined = (name) => {
          return name in this.macros || name in this.defs;
        }

        let val = eval(code);
        val = !!val;

        this.push("if");

        if (was_elif) {
          val ^= was_elif_enabled;
          this.pop_depth++;
        }

        this.enabled = val;

        log("#if", val, was_elif, was_elif_enabled, this.ifstack, this.pop_depthcfv);

        lines2.push("");
        return i;
      } else if (keyword === "undef") {
        let name = parts[1];

        delete this.macros[name];
        delete this.defs[name];
        delete this.res[name];

        this.sortmacros();

        lines2.push("");
        return i;
      }

      lines2.push(this.subst(l));
      return i;
    },

    last_keyword: "",
    enabled     : true,
    pop_depth   : 1,
    macros      : {},
    defs        : {},
    ifstack     : [],
    scope       : {},
    state       : "main"
  }

  let i = 0;
  while (i < lines.length) {
    let start = i;

    i = states[states.state](i);

    if (i === start) {
      i++;
    }
  }

  let ret = lines2.join("\n");
  log(ret);
  log("stack", states.ifstack);
  log("defs", states.defs, states.macros);
  log(lines.length, lines2.length)

  return ret;
}