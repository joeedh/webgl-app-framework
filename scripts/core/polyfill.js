let myglobal;

if (typeof window === "undefined") {
  if (typeof self !== "undefined") {
    myglobal = self;
  } else if (typeof globalThis !== "undefined") {
    myglobal = globalThis;
  } else if (typeof global !== "undefined") {
    myglobal = global;
  }
} else {
  myglobal = window;
}

if (Array.prototype.replace === undefined) {
  Array.prototype.replace = function replace(a, b, fail_error = true) {
    let i = this.indexOf(a);
    if (i < 0) {
      if (fail_error) {
        throw new Error("object a not in array")
      } else {
        console.warn("object not in array:", a);
        return;
      }
    }

    this[i] = b;
  }
}

if (Array.prototype.set === undefined) {
  Array.prototype.set = function set(array, src, dst, count) {
    src = src === undefined ? 0 : src;
    dst = dst === undefined ? 0 : dst;
    count = count === undefined ? array.length : count;

    if (count < 0) {
      throw new RangeError("Count must be >= zero");
    }

    let len = Math.min(this.length - dst, array.length - src);
    len = Math.min(len, count);

    for (let i = 0; i < len; i++) {
      this[dst + i] = array[src + i];
    }

    return this;
  }

  Float64Array.prototype.set = Array.prototype.set;
  Float32Array.prototype.set = Array.prototype.set;
  Uint8Array.prototype.set = Array.prototype.set;
  Uint8ClampedArray.prototype.set = Array.prototype.set;
  Int32Array.prototype.set = Array.prototype.set;
  Int16Array.prototype.set = Array.prototype.set;
  Int8Array.prototype.set = Array.prototype.set;
}

if (Array.prototype.reject === undefined) {
  Array.prototype.reject = function reject(func) {
    return this.filter((item) => !func(item));
  }
}

myglobal.list = function list(iter) {
  var ret = [];

  if (typeof iter === "string") {
    iter = new String();
  }

  if (Symbol.iterator in iter) {
    for (var item of iter) {
      ret.push(item);
    }
  } else {
    iter.forEach(function (item) {
      ret.push(item);
    }, this);
  }

  return ret;
}

//*

function makeGlobalArrayIterCache() {
  let itercache = myglobal._itercache = {
    cur  : 0,
    cache: [],

    start: function (array) {
      if (this.cur >= this.cache.len) {
        this.cache.push(new ArrayIter());
      }
      return this.cache[this.cur++].reset(array);
    },

    end: function (iter) {
      if (iter !== this.cache[this.cur-1]) {
        throw new Error("bleh");

        this.cache[iter.idx] = new ArrayIter(iter.idx);

        iter.idx = this.cache.length;
        this.cache.push(iter);
      } else {
        this.cur = Math.max(this.cur-1, 0);
      }
    }
  }

  class ArrayIter {
    constructor(idx) {
      this.array = undefined;
      this.i = 0;
      this.idx = idx;
      this.ret = {done: true, value: undefined};
      this.done = true;
    }

    reset(array) {
      this.array = array;
      this.i = 0;
      this.ret.done = false;
      this.ret.value = undefined;
      this.done = false;

      return this;
    }

    [Symbol.iterator]() {
      return this;
    }

    next() {
      if (this.done) {
        console.log(this.ret);
        throw new Error("iter is dead");
      }

      let ret = this.ret;
      let array = this.array;

      if (this.i >= array.length) {
        ret.done = true;
        ret.value = undefined;
        this.finish();
        return ret;
      } else {
        ret.done = false;
        ret.value = array[this.i];
        this.i++;
      }

      return ret;
    }

    finish() {
      if (!this.done) {
        this.done = true;
        itercache.end(this);
        this.ret.value = undefined;
        this.ret.done = true;
      }
    }

    return() {
      this.finish();

      return this.ret;
    }
  }


  for (let i = 0; i < 1024; i++) {
    itercache.cache.push(new ArrayIter(i));
  }

  let func = function () {
    return itercache.start(this);
  }

  func.itercache = itercache;
  return func;
}

myglobal.debugNodeAllocs = function() {
  let newelem = document.createElement;
  let newtext = document.createTextNode;

  document.createElement = function() {
    console.warn("element!");
    return newelem.apply(this, arguments);
  }

  document.createTextNode = function() {
    console.warn("text node!");
    return newtext.apply(this, arguments);
  }
}
//Override array iterator to not allocate too much
//Array.prototype[Symbol.iterator] = makeGlobalArrayIterCache();

function testiter() {
  let iter = makeGlobalArrayIterCache()

  let array = [1, 2, 3, 4, 5];
  for (let item of iter.call(array)) {
    for (let item2 of iter.call(array)) {
      if (item === item2) {
        break;
      }
    }
    console.log(item)
  }
  console.log(iter.itercache.cur);
}

if (Array.prototype.clone === undefined) {
  Array.prototype.clone = function () {
    return this.slice(0);
  }
}

if (Array.prototype.pop_i === undefined) {
  Array.prototype.pop_i = function (idx) {
    if (idx < 0 || idx >= this.length) {
      throw new Error("Index out of range");
    }

    while (idx < this.length) {
      this[idx] = this[idx + 1];
      idx++;
    }

    this.length -= 1;
  }
}

if (Math.sign === undefined) {
  Math.sign = function sign(f) {
    return (f > 0.0)*2.0 - 1.0;
  };
}

if (Math.fract === undefined) {
  Math.fract = function fract(f) {
    var sn = (f >= 0)*2.0 - 1.0;

    f = f*sn - Math.floor(f*sn);
    sn = sn < 0.0;

    return f*(1 - sn) + (1.0 - f)*sn;
  };
}

if (Math.tent === undefined) {
  Math.tent = function tent(f) {
    return 1.0 - Math.abs(Math.fract(f) - 0.5)*2.0;
  };
}

if (Array.prototype.remove === undefined) {
  Array.prototype.remove = function (item, suppress_error) {
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
  String.prototype.contains = function (substr) {
    return String.search(substr) >= 0;
  }
}

String.prototype[Symbol.keystr] = function () {
  return this;
}

Number.prototype[Symbol.keystr] = Boolean.prototype[Symbol.keystr] = function () {
  return "" + this;
}

