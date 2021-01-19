/*
if (typeof window === "undefined" && typeof self === "undefined") {
  let localStorageFile = "localStorage.json";

  function readLS() {
    if (!fs.existsSync(localStorageFile)) {
      fs.writeFileSync(localStorageFile, "{}")
    }
    let buf = fs.readFileSync(localStorageFile, "utf8");
    return JSON.parse(buf);
  }

  globalThis.localStorage = new Proxy({}, {
    get(rec, prop) {
      let json = readLS();

      return json[prop];
    }, set(target, prop, val) {
      if (typeof val !== "string") {
        val = JSON.stringify(val);
      }

      let json = readLS();
      json[prop] = val;
      json = JSON.stringify(json);
      fs.writeFileSync(localStorageFile, json);

      return true;
    }

  })
}
*/

if (typeof window !== "undefined" && typeof globalThis === "undefined") {
  window.globalThis = window;
} else if (typeof globalThis === undefined && typeof global !== "undefined") {
  global.globalThis = global;
}


if (Set.prototype.map === undefined) {
  Set.prototype.map = function(func, thisArg) {
    let ret = new Set();
    let i = 0;

    if (thisArg) {
      for (let item of this) {
        ret.add(func(item, i++, this));
      }
    } else {
      for (let item of this) {
        ret.add(func.call(thisArg, item, i++, this));
      }
    }

    return ret;
  }
}

if (Set.prototype.filter === undefined) {
  Set.prototype.filter = function(func, thisArg) {
    let ret = new Set();
    let i = 0;

    if (thisArg) {
      for (let item of this) {
        if (func(item, i++, this)) {
          ret.add(item);
        }
      }
    } else {
      for (let item of this) {
        if (func.call(thisArg, item, i++, this)) {
          ret.add(item);
        }
      }
    }

    return ret;
  }
}

if (Set.prototype.reduce === undefined) {
  Set.prototype.reduce = function(func, initialVal) {
    let accum = initialVal;
    let i = 0;

    for (let item of this) {
      accum = func(accum, item, i++, this);
    }

    return accum;
  }
}

if (Array.prototype.set === undefined) {
    Array.prototype.set = function set(array, src, dst, count) {
        src = src === undefined ? 0 : src;
        dst = dst === undefined ? 0 : dst;
        count = count === undefined ? array.length :  count;
        
        if (count < 0) {
            throw new RangeError("Count must be >= zero");
        }
        
        let len = Math.min(this.length-dst, array.length-src);
        len = Math.min(len, count);
        
        for (let i=0; i<len; i++) {
            this[dst+i] = array[src+i];
        }
        
        return this;
    }

    if (Float64Array.prototype.set === undefined) {
      Float64Array.prototype.set = Array.prototype.set;
      Float32Array.prototype.set = Array.prototype.set;
      Uint8Array.prototype.set = Array.prototype.set;
      Uint8ClampedArray.prototype.set = Array.prototype.set;
      Int32Array.prototype.set = Array.prototype.set;
      Int16Array.prototype.set = Array.prototype.set;
      Int8Array.prototype.set = Array.prototype.set;
    }
}

if (Array.prototype.reject === undefined) {
    Array.prototype.reject = function reject(func) {
        return this.filter((item) => !func(item));
    }
}

if (globalThis.Symbol === undefined) { //eek!
  globalThis.Symbol = {
    iterator : "$__iterator__$",
    keystr   : "$__keystr__$"
  }
} else if (Symbol.keystr === undefined) {
  Symbol.keystr = Symbol("keystr");
}

globalThis.list = function list(iter) {
  let ret = [];

  if (typeof iter === "string") {
    for (let i=0; i<iter.length; i++) {
      ret.push(iter[i]);
    }

    return ret;
  }

  if (Symbol.iterator in iter) {
    for (let item of iter) {
      ret.push(item);
    }
  } else {
    iter.forEach(function(item) {
      ret.push(item);
    }, this);
  }
  
  return ret;
};

if (Math.fract === undefined) {
  Math.fract = function fract(f) {
    return f - Math.floor(f);
  };
}

if (Math.tent === undefined) {
  Math.tent = function tent(f) {
    return 1.0 - Math.abs(Math.fract(f)-0.5)*2.0;
  };
}

if (Math.sign === undefined) {
  Math.sign = function sign(f) {
    return (f>0.0)*2.0-1.0;
  };
}

if (Array.prototype.pop_i === undefined) {
  Array.prototype.pop_i = function(idx) {
    if (idx < 0 || idx >= this.length) {
      throw new Error("Index out of range");
    }
    
    while (idx < this.length) {
      this[idx] = this[idx+1];
      idx++;
    }
    
    this.length -= 1;
  }
}

if (Array.prototype.remove === undefined) {
  Array.prototype.remove = function(item, suppress_error) {
    var i = this.indexOf(item);
    
    if (i < 0) {
      if (suppress_error)
        console.trace("Warning: item not in array", item);
      else
        throw new Error("Error: item not in array " + item);
      
      return;
    }
    
    this.pop_i(i);
  }
}

if (String.prototype.contains === undefined) {
  String.prototype.contains = function(substr) {
    return String.search(substr) >= 0;
  }
}

String.prototype[Symbol.keystr] = function() {
  return this;
};

Number.prototype[Symbol.keystr] = Boolean.prototype[Symbol.keystr] = function() {
  return ""+this;
};

Array.prototype[Symbol.keystr] = function() {
  let key = "";
  for (let item of this) {
    key += item[Symbol.keystr]() + ":";
  }

  return key;
};

