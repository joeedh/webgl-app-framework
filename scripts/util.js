//handle to module.  never access in code; for debug console use only.
var _util = undefined;

define([
  "polyfill", "typesystem"
], function(unused, typesystem) {
  "use strict";

  var exports = _util = {};
  
  //forward typesystem exports
  for (var k in typesystem) {
    exports[k] = typesystem[k];
  }

  window.tm = 0.0;

  var EmptySlot = {};

  //XXX compatibility class functions
  var init_prototype = exports.init_prototype = function(cls, obj) {
      if (cls.prototype === undefined) {
          cls.prototype = {};
      }
      
      for (var k in obj) {
          cls.prototype[k] = obj[k];
      }
      
      return cls.prototype;
  }
  
  var inherit = exports.inherit = function(c, p, obj) {
      c.prototype = Object.create(p.prototype);
      
      for (var k in obj) {
          c.prototype[k] = obj[k];
      }
      
      return c.prototype;
  }
  
  var time_ms = exports.time_ms = function time_ms() {
    if (window.performance)
      return window.performance.now();
    else
      return new Date().getMilliseconds();
  }


  var cachering = exports.cachering = class cachering extends Array {
    constructor(func, size) {
      super()
      
      this.cur = 0;
      
      for (var i=0; i<size; i++) {
        this.push(func());
      }
    }
    
    static fromConstructor(cls, size) {
      var func = function() {
        return new cls();
      }
      
      return new exports.cachering(func, size);
    }
    
    next() {
      var ret = this[this.cur];
      this.cur = (this.cur+1)%this.length;
      
      return ret;
    }
  }

  var SetIter = exports.SetIter = class SetIter {
    constructor(set) {
      this.set = set;
      this.i   = 0;
      this.ret = {done : false, value : undefined};
    }
    
    [Symbol.iterator]() {
      return this;
    }
    
    next() {
      var ret = this.ret;

      while (this.i < this.set.items.length && this.set.items[this.i] === EmptySlot) {
        this.i++;
      }
      
      if (this.i >= this.set.items.length) {
        ret.done = true;
        ret.value = undefined;
        
        return ret;
      }
      
      
      ret.value = this.set.items[this.i++];
      return ret;
    }
  }

  var set = exports.set = class set {
    constructor(input) {
      this.items = [];
      this.keys = {};
      this.freelist = [];
      
      this.length = 0;
      
      if (typeof input == "string") {
        input = new String(input);
      }
      
      if (input != undefined) {
        if (Symbol.iterator in input) {
          for (var item of input) {
            this.add(item);
          }
        } else if ("forEach" in input) {
          input.forEach(function(item) {
            this.add(item);
          }, this);
        } else if (input instanceof Array) {
          for (var i=0; i<input.length; i++) {
            this.add(input[i]);
          }
        }
      }
    }
    
    [Symbol.iterator]() {
      return new SetIter(this);
    }
    
    add(item) {
      var key = item[Symbol.keystr]();
      
      if (key in this.keys) return;
      
      if (this.freelist.length > 0) {
        var i = this.freelist.pop();
        
        this.keys[key] = i;
        this.items[i] = item;
      } else {
        var i = this.items.length;
        
        this.keys[key] = i;
        this.items.push(item);
      }
      
      this.length++;
    }
    
    remove(item) {
      var key = item[Symbol.keystr]();
      
      if (!(key in this.keys)) {
        console.trace("Warning, item", item, "is not in set");
        return;
      }
      
      var i = this.keys[key];
      this.freelist.push(i);
      this.items[i] = EmptySlot;
      
      delete this.keys[key];
      
      this.length--;
    }
    
    has(item) {
      return item[Symbol.keystr]() in this.keys;
    }
    
    forEach(func, thisvar) {
      for (var i=0; i<this.items.length; i++) {
        var item = this.items[i];
        
        if (item === EmptySlot) 
          continue;
          
        thisvar != undefined ? func.call(thisvar, item) : func(item);
      }
    }
  }

  var _hash_null = {};

  var hashtable = exports.hashtable = class hashtable {
    constructor() {
      this.items = [];
      this._keys = {};
      this.length = 0;
    }
    
    set(key, val) {
      key = key[Symbol.keystr]();
      
      var i;
      if (!(key in this._keys)) {
        i = this.items.length;
        this.items.push(0);
        this._keys[key] = i;
        
        this.length++;
      } else {
        i = this._keys[key];
      }
      
      this.items[i] = val;
    }
    
    remove(key) {
      key = key[Symbol.keystr]();
      
      if (!(key in this._keys)) {
        console.trace("Warning, key not in hashtable:", key);
        return;
      }
      
      var i = this._keys[key];
      this.items[i] = _hash_null;
      delete this._keys[key];
      this.length--;
    }
    
    has(key) {
      key = key[Symbol.keystr]();
      
      return key in this._keys;
    }
    
    get(key) {
      key = key[Symbol.keystr]();
      if (!(key in this._keys)) {
        console.trace("Warning, item not in hash", key);
        return undefined;
      }
      
      return this.items[this._keys[key]];
    }
    
    add(key, val) {
      return this.set(key, val);
    }
    
    keys() {
      return Object.keys(this._keys);
    }
    
    values() {
      var ret = [];
      var len = this.items.length;
      
      for (var i=0; i<len; i++) {
        var item = this.items[i];
        if (item !== _hash_null)
          ret.push(item);
      }
      
      return ret;
    }
    
    forEach(cb, thisvar) {
      if (thisvar == undefined)
        thisvar = self;
      
      for (var k in this._keys) {
        var i = this._keys[k];
        cb.call(thisvar, k, this.items[i]);
      }
    }
  }

  var IDGen = exports.IDGen = class IDGen {
    constructor() {
      this._cur = 1;
    }
    
    next() {
      return this._cur++;
    }
    
    max_cur(id) {
      this._cur = Math.max(this._cur, id+1);
    }
    
    toJSON() {
      return {
        _cur : this._cur
      };
    }
    
    static fromJSON(obj) {
      var ret = new IDGen();
      ret._cur = obj._cur;
      return ret;
    }
  }


  function get_callstack(err) {
    var callstack = [];
    var isCallstackPopulated = false;

    var err_was_undefined = err == undefined;

    if (err == undefined) {
      try {
        _idontexist.idontexist+=0; //doesn't exist- that's the point
      } catch(err1) {
        err = err1;
      }
    }

    if (err != undefined) {
      if (err.stack) { //Firefox
        var lines = err.stack.split('\n');
        var len=lines.length;
        for (var i=0; i<len; i++) {
          if (1) {
            lines[i] = lines[i].replace(/@http\:\/\/.*\//, "|")
            var l = lines[i].split("|")
            lines[i] = l[1] + ": " + l[0]
            lines[i] = lines[i].trim()
            callstack.push(lines[i]);
          }
        }
        
        //Remove call to printStackTrace()
        if (err_was_undefined) {
          //callstack.shift();
        }
        isCallstackPopulated = true;
      }
      else if (window.opera && e.message) { //Opera
        var lines = err.message.split('\n');
        var len=lines.length;
        for (var i=0; i<len; i++) {
          if (lines[i].match(/^\s*[A-Za-z0-9\-_\$]+\(/)) {
            var entry = lines[i];
            //Append next line also since it has the file info
            if (lines[i+1]) {
              entry += ' at ' + lines[i+1];
              i++;
            }
            callstack.push(entry);
          }
        }
        //Remove call to printStackTrace()
        if (err_was_undefined) {
          callstack.shift();
        }
        isCallstackPopulated = true;
      }
     }

      var limit = 24;
      if (!isCallstackPopulated) { //IE and Safari
        var currentFunction = arguments.callee.caller;
        var i = 0;
        while (currentFunction && i < 24) {
          var fn = currentFunction.toString();
          var fname = fn.substring(fn.indexOf("function") + 8, fn.indexOf('')) || 'anonymous';
          callstack.push(fname);
          currentFunction = currentFunction.caller;
          
          i++;
        }
      }
    
    return callstack;
  }

  var print_stack = exports.print_stack = function print_stack(err) {
    try {
      var cs = get_callstack(err);
    } catch (err2) {
      console.log("Could not fetch call stack.");
      return;
    }
    
    console.log("Callstack:");
    for (var i=0; i<cs.length; i++) {
      console.log(cs[i]);
    }
  }

  var fetch_file = exports.fetch_file = function fetch_file(path) {
      var url = location.origin + "/" + path
      
      var req = new XMLHttpRequest(
      );
      
      return new Promise(function(accept, reject) {
        req.open("GET", url)
        req.onreadystatechange = function(e) {
          if (req.status == 200 && req.readyState == 4) {
              accept(req.response);
          } else if (req.status >= 400) {
            reject(req.status, req.statusText);
          }
        }
        req.send();
      });
  }
  
  return exports;
});
