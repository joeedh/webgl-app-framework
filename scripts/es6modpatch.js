/*
es6 module syntax parser.  naturally, cross-origin
security restrictions make this totally useless for
non-served apps.

evil.  sheer evil!
*/

//handle to module.  never access in code; for debug console use only.
var _es6modpatch = undefined;

define([
  "parseutil"
], function(parseutil) {
  "use strict";
  
  var exports = _es6modpatch = {};
  
  var tf = function(name, regexpr, func) {
    return new parseutil.tokdef(name, regexpr, func);
  }
  
  var tokens = [
    tf("EXPORTS", /exports/, function(t) {
      t.type = "ID";
      return t;
    }),
    tf("EXPORT", /export[\t \n\r]+/),
    tf("IMPORT", /import/),
    tf("COMMA", /,/),
    tf("LBRACKET", /\{/),
    tf("RBRACKET", /\}/),
    tf("STRLIT", /(['].*['])|(["].*["])/, function(t) {
      t.value = t.value.slice(1, t.value.length-1)
      return t;
    }),
    tf("BLOCK_COMMENT", /\/\*(.|\n|\r|\t|\v)*\*\//, function() {
      //drop token
    }),
    tf("COMMENT", /\/\/.*[\r\n]/, function() {
      //drop token
    }),
    tf("AS", /as/),
    tf("FROM", /from/),
    tf("CLASS", /class/),
    tf("FUNCTION", /function/),
    tf("VAR", /var/),
    tf("CONST", /var/),
    tf("ID", /[$a-zA-Z_]+[$a-zA-Z0-9_]*/),
    tf("WS", /[ \t\v\n\r]+/, function(t) {
      for (var i=0; i<t.value.length; i++) {
        if (t.value[i] == "\n") {
          t.lexer.lineno++;
        }
      }
      //drop token
    }),
    tf("SEMI", /;/, function() {
      //drop token
    }),
    tf("STAR", /\*/)
  ];
  
  var test = [
    '"use strict"',
    "a + 1/2",
    "export class a {",
    "import * as mod from 'mod';",
    "export var a ;",
    "import {a, b, c, d, e, f, g} from 'mod2';",
    "export function bleh(a, b, c)",
    "export var a;",
    "import \"vectormath\"",
    "bleh",
    "export * from 'something'",
    "something"
  ].join("\n");
  
  var parse = exports.parse = function parse(buf, modname, url) {
    if (modname == undefined) {
      modname = "unknown";
    }
    
    function errfunc(lexer) {
      console.log("Lexical error");
    }
    
    window.commentaware_find = function commentaware_find(buf, str) {
      var cur = 0;
      var _ci = 0;
      
      while (cur < buf.length) {
        if (_ci++ > 5000000) {
          console.log("infinite loop!")
          break;
        }
        
        var buf2 = buf.slice(cur, buf.length);
        var si = buf2.search(str);
        
        if (si < 0 || (si != 0 && si == cur))
          return -1;

        var last = undefined;
        var in_comment = false;
        
        for (var i=cur; i<si; i++) {
          var c = buf[i];
          
          if (in_comment != false) {
            var r = (c == "*" && last == "/" && in_comment == "block");
            r = r || ((c == "\n" || c == "\r") && in_comment == "line");
            
            in_comment = r ? false : in_comment;
          } else {
            if (c == "*" && last == "/") 
              in_comment = "block";
            else if (c == "/" && last == "/")
              in_comment = "line";
          }
          last = c;
        }
        
        if (!in_comment) {
          return si;
        }
        
        cur = si+1;
      }
      
      return -1;
    }
    
    var lexer = new parseutil.lexer(tokens, errfunc);
    var p = new parseutil.parser(lexer);
      
    var mod_imports = {};
    var mod_onlyloads = {};
    var mod_import_names = {};
    var mods = {};
    var subs = [];
    
    function commentaware_find2(buf, str) {
      return buf.search(str);
      //return commentaware_find(buf, str);
    }
    
    function find_consume_import(buf, start) {
      var origbuf = buf;
      buf = buf.slice(start, buf.length);
      
      var start2 = commentaware_find2(buf, /import/);
      
      if (start2 <= 0) {
        if (start2 < 0 || start > 0)
          return undefined;
      }
      
      buf = buf.slice(start2, buf.length);
      
      function do_import() {
        var t;
        
        p.expect("IMPORT")

        if (p.optional("STAR")) {
          p.expect("AS");

          var bind_id = p.expect("ID")
          p.expect("FROM")
          var name = p.expect("STRLIT")
          
          mod_imports[name] = bind_id;
          
          subs.push([
            start+start2,
            start+start2+p.lexer.lexpos,
            ""
          ]);
        } else if (p.peek_i(0).type == "STRLIT") {
          var t = p.next().value
          
          subs.push([
            start+start2,
            start+start2+p.lexer.lexpos,
            ""
          ]);
          mod_onlyloads[t] = 1;
        } else {
          p.expect("LBRACKET");
          
          var _ci = 0;
          var names = [];
          var first = true;
          
          while (1) {
            if (_ci++ > 5000) {
              console.log("infinite loop");
              break;
            }
            
            if (p.peek_i(0).type == "RBRACKET") {
              p.next();
              break;
            }
            
            if (!first) {
              p.expect("COMMA");
            }
            first = false;
            
            var id = p.expect("ID");
            names.push(id);
          }
          
          p.expect("FROM");
          var mod = p.expect("STRLIT");
          var bind;
          
          if (mod in mod_imports) {
            bind = mod_imports[mod];
          } else {
            bind = mod_imports[mod] = "$__" + mod;
          }
          
          var s = "var ";
          for (i=0; i<names.length; i++) {
            var name = names[i];
            if (i > 0)
              s += ", ";
            
            s += name + " = "+bind+"." + name;
          }
          s += ""
          
          subs.push([
            start+start2,
            start+start2+p.lexer.lexpos,
            s
          ]);
          
          mod_import_names[mod] = names;
        }
      }
      
      p.start = do_import;
      p.parse(buf, false)
      
      return start+start2+p.lexer.lexpos+1;
    }
    
    function find_consume_export(buf, start) {
      var origbuf = buf;
      buf = buf.slice(start, buf.length);
      
      var start2 = commentaware_find2(buf, /export[ \t]/g);
      
      if (start2 <= 0) {
        if (start2 < 0 || start > 0)
          return undefined;
      }
      
      buf = buf.slice(start2, buf.length);
      
      function do_export() {
        var t;
        p.expect("EXPORT")
        
        if (p.optional("CLASS")) {
          var name = p.expect("ID");
          
          subs.push([
             start+start2, start+start2+p.lexer.lexpos,
             "var " + name + " = exports." + name + " = class " + name + " "
          ]);
        } else if (p.optional("FUNCTION")) {
          var name = p.expect("ID");
          
          subs.push([
             start+start2, start+start2+p.lexer.lexpos,
             "var " + name + " = exports." + name + " = function " + name + " "
          ]);
        } else if (p.optional("VAR") || p.optional("CONST")) {
          var name = p.expect("ID");
          
          subs.push([
             start+start2, start+start2+p.lexer.lexpos,
             "var " + name + " = exports." + name + " = " + name + " "
          ]);
        } else if (p.optional("STAR")) {
            p.expect("FROM")
            var mod = p.expect("STRLIT")
            
            var k;
            if (mod in mod_imports) {
              k = mod_imports[mod];
            } else {
              k = mod_imports[mod] = "$__"+mod;
            }
            
            var s = [
            "  for (var k in "+k+") {",
            "    exports[k] = "+k+"[k];",
            "  }"
            ].join("\n")
            
            subs.push([
               start+start2, start+start2+p.lexer.lexpos,
               s
            ]);
        }
      }
      
      p.start = do_export;
      p.parse(buf, false)
      
      return start+start2+p.lexer.lexpos;
    }
    
    for (var si=0; si<2; si++) {
      var func = si ? find_consume_export : find_consume_import;
      
      var i = func(buf, 0);
      var _ci=0, lasti=0;
      
      while (i != undefined && i > lasti) {
        lasti = i;
        i = func(buf, i);
        
        if (_ci++>800) {
            console.log("infinite loop", i);
            break;
        }
      }
    }
    
    function empty(size) {
      var ret = new Array(size);
      for (var i=0; i<size; i++) {
        ret[i] = -1;
      }
      
      return ret;
    }
    
    var map = new Array(buf.length)
    for (var i=0; i<buf.length; i++) {
      map[i] = i;
    }
    
    subs.sort(function(a, b) {
      return a[0]-b[0];
    });
    
    var buf2 = "", buf3 = buf;
    var map2 = []
    var si = 0;
    
    for (var i=0; i<subs.length; i++) {
      var sub = subs[i];
      
      map2 = map2.concat(map.slice(si, sub[0]))
      map2 = map2.concat(empty(sub[2].length))
      
      buf2 += buf.slice(si, sub[0]);
      buf2 += sub[2];
      
      si = sub[1];
    }
    
    buf2 += buf3.slice(si, buf3.length);
    
    map2 = map2.concat(map.slice(si, buf3.length))
    
    var mods = {}
    
    var i = 1;
    for (var k in mod_onlyloads) {
      mod_imports[k] = "unused"+(i++);
    }
    
    for (var k in mod_imports) {
      mods[k] = mod_imports[k];
    }
    
    var code = ""
    
    code += "self._" + modname + " = undefined;"
    code += "define(["
    var i = 0;
    for (var k in mod_imports) {
      if (i > 0) {
          code += ", "
      }
      
      code += '"es6modpatch!' + k + '"';
      i++;
    }
    code += "], function(";
    
    i = 0;
    for (var k in mod_imports) {
      if (i > 0) {
          code += ", "
      }
      
      code += mod_imports[k];
      i++;
    }
    code += ") { "
    
    if (buf.trim().startsWith("'use strict'") ||
        buf.trim().startsWith('"use strict"'))
    {
      code += "'use strict';"
    }
    code += "var exports = _" + modname + " = {};"

    var tail = "return exports; });";
    map2 = empty(code.length).concat(map2).concat(empty(tail.length))
    
    code += buf2 + tail;
    
    var last = 0;
    for (var i=0; i<map2.length; i++) {
      var starti = i;
      
      while (i < map2.length && map2[i] < 0) {
        map2[i] = last;
        i++;
      }
      
      //var lasti = i;
      //var next = i < map2.length-1 ? map2[i] : last;
      
      //while (i >= starti) {
      //  map2[i] = next;
      //  i--;
      //}
      //i = lasti;
      
      last = map2[i];
    }
    
    var gensrc_name = url+"_compiled.js";
    
    //generate source map
    var name = modname;
    var smap = {
      version  : 3,
      file     : gensrc_name,
      sources  : [url],
      //sourcesContent : [buf],
      names    : [],
      mappings : ""
    };
    
    var m = ""
    
    var lines = code.split("\n")
    var lmap = new Array(buf.length);
    var lineno = 0;
    
    for (var i=0; i<buf.length; i++) {
      lmap[i] = lineno;
      
      if (buf[i] == "\n") {
        lineno++;
      }
    }
    
    var lmap2 = new Array(map2.length);
    for (var i=0; i<map2.length; i++) {
      lmap2[i] = lmap[map2[i]]+1;
    }
    
    var mi = 0;
    var first_sline = true;
    var sline = lmap2[0];
    
    for (var li=0; li<lines.length; li++) {
      var line = lines[li];
      var rel = map2[mi];
      var lastmi = mi;
      
      var first = true;
      for (var i=0; i<line.length; ) {
        var start = map2[mi];
        var startmi = mi;
        
        if (i > 0) {
          m += ","
        }
        
        var starti = i;
        /*
        while (i < line.length-1 && map2[mi+1]-map2[mi] == 0) {
          i++;
          mi++;
        }
        
        if (i == starti) {
          while (i < line.length-1 && map2[mi+1]-map2[mi] == 1) {
            i++;
            mi++;
          }
        }*/
        
        //i++;
        //mi++;
        
        if (startmi == mi) {
        //  mi++;
        }
        
        var end = map2[i];
        
        var rel1 = first ? rel : map2[mi] - rel;
        var sline1 = first_sline ? sline : lmap2[mi] - sline
        
        m += encode_vlq(first ? mi : mi - lastmi);
        m += encode_vlq(0);
        m += encode_vlq(sline1);
        m += encode_vlq(rel1)
        
        rel = map2[mi];
        sline = lmap2[mi];
        lastmi = mi;
        
        first = false;
        first_sline = false;
        
        i++;
        mi++;
      }
      
      if (li != lines.length-1) {
        m += ";"
      }

      mi++; //don't miss final \n
    }
    
    smap.mappings = m;
    //smap.sourcesContent[0] += "\n//# sourceURL="+url;
    smap = JSON.stringify(smap);
    var smapcode = smap;
    smap = new Blob([smap], {type : "application/json"});
    
    var surl = URL.createObjectURL(smap);
    
    //surl = surl.replace(/\:/g, "%3A")
    surl = "data:application/json;base64," + btoa(smapcode);
    
    var footer = "\n//# sourceURL=" + gensrc_name + "\n//# sourceMappingURL=" + surl
    //code = smapcode
    code += footer;
    
    return code;
  }
  
  var base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  
  var _vlq_s = [0, 0, 0, 0, 0, 0, 0];
  function encode_vlq(index) {
    index = ~~(index);
    
    var sign = ~~(index < 0);
    index = Math.abs(index);
    
    index = index << 1;
    index |= sign;
    
    var a, b, c, d, e, f, ar, i;
    
    a = index & 31;
    b = (index>>5) & 31;
    c = (index>>10) & 31;
    d = (index>>15) & 31;
    e = (index>>20) & 31;
    f = (index>>25) & 31;
    
    ar = _vlq_s
    ar[0] = a
    ar[1] = b
    ar[2] = c
    ar[3] = d
    ar[4] = e
    ar[5] = f

    var tot, out, n, c;
    
    i = 5
    while (i > 0 && ar[i] == 0) {
      i -= 1
    }
    tot = i + 1
    
    out = ""
    i = 0
    while (i < tot) {
      n = ar[i]
      
      if (i != tot-1)
        n |= 32
      
      c = base64[n]
      out += c
      i += 1
    }
    return out
  }
  window.encode_vlq = encode_vlq;
  exports.test = function() {
    var ret = parse(test, "test");
  }
  
  //requirejs hook
  exports.load = function(name, require, onload, config) {
    var url = require.toUrl(name+".js");
    
    var req = new XMLHttpRequest(
    );
    
    url = location.origin + "/" + url; //file://
    //console.log(url);
    //return
    req.open("GET", url)
    req.onreadystatechange = function(e) {
      if (req.status == 200 && req.readyState == 4) {
          var script = req.responseText;
          
          script = exports.parse(script, name, url);
          
          //gah.  catch syntax errors, which require isn't reporting
          var define = function(){};
          var require = function(){};
          eval(script);
          
          onload.fromText(script);
      }
    }
    req.send();
  }
  
  return exports;
});
