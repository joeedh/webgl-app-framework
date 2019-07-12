"use strict";

/*
NOTE: spatial hash doesn't guarantee that
      points returned by .search really are
      less than the search radius away
*/

import * as util from 'util';

import {
  Vector2, Vector3, Matrix4
} from 'vectormath';

window.check_prime = function(n) {
  for (var i=2; i<n; i++) {
    if ((n/i) == Math.floor(n/i)) {
      return i;
    }
  }
  
  return -1;
}

window.gen_primes = function gen_primes(force_regen) {
  var regen = force_regen || localStorage.hash_primes == undefined;
  regen = regen || localStorage.hash_primes == "undefined";
  
  if (!regen) {
    return JSON.parse(localStorage.hash_primes);
  }
  
  console.log("generating primes. . .");
  
  var arr = [];
  var size = 5*1024*1024;
  for (var i=0; i<size; i++) {
    arr.push(i);
  }
  
  var primes = [];
  for (var i=2; i<size; i++) {
    if (arr[i] == 0)
      continue;
    
    primes.push(arr[i]);
    
    for (var j=i+i; j<size; j += i) {
      arr[j] = 0;
    }
  }
  
  primes = primes.slice(4, primes.length);
  var ret = [];
  
  //build list such that primes increase
  //at roughly 1.5x rate
  for (var i=0; i<primes.length-1; i++) {
    var si = i;
    while (i<primes.length-1 && primes[i+1]/primes[si] < 1.25) {
      i++;
    }
    
    ret.push(primes[i]);
  }
  
  localStorage.hash_primes = JSON.stringify(ret);
  
  return ret;
}

var IKEY = 0
var IIDX = 1

export class IntegerHash {
    constructor(startsize) {
      if (startsize == undefined)
        startsize = 2048;
      
      this.primes = gen_primes();
      
      this.cursize = 0;
      var size = this.primes[0];
      
      while (size < startsize) {
        this.cursize++;
        size = this.primes[this.cursize];
      }
      
      this.size = this.primes[this.cursize];
      
      this.table = new Int32Array(this.size*2);
      this.avg_c = 0;
      this.max_c = 0;
      this.tot_c = 0;
      
      this.length = 0;
      this.table.fill(-1);
    }
    
    hash(key) {
      //key += 1024*1024;
      
      var hash;
      if (key < 0) {
        hash = (-key) + 1// ^ (~536870911); //(~((1<<25)-1));
        //hash = hash*hash*2;
        
        hash = this.size - (hash % this.size) - 1;
      } else {
        hash = (key+1) % this.size;
      }
      
      if (isNaN(hash)) {
        throw new Error("NaN hash! " + key);
      }
      return hash;
    }
    
    remove_at(i) {
      var key = this.table[i];
      var starthash = Math.floor(i/2), hash=starthash;
      
      var t = this.table, sz = this.size, _ci=0;
      var off = 1, lasthash = hash;
      
      while (t[hash*2] != -1) {
        var next = (starthash+off)%sz;
        off += 1;
        
        if (_ci++ > 9000) {
          console.log("infinite loop!")
          break;
        }
        
        //if (t[hash*2] != key) {
        //  hash = next;
        //  continue;
        //}
        
        t[lasthash*2] = t[next*2];
        t[lasthash*2+1] = t[next*2+1];
        
        lasthash = hash;
        hash = next;
      }
      
      if (t[lasthash*2] == key) {
        t[lasthash*2] = -1;
        t[lasthash*2+1] = -1;
      }
      
      this.length--;
    }
    
    reset() {
      this.table.fill(-1);
      this.length = 0;
      
      this.avg_c = 0.0;
      this.tot_c = 0.0;
      this.max_c = 0.0;
    }
    
    nextsize() {
      this.cursize++;
      this.size = this.primes[this.cursize];
      this.length = 0;
      
      var t = new Int32Array(this.size*2);
      t.fill(-1);
      
      var t2 = this.table;
      
      this.table = t;
      for (var i=0; i<t2.length; i += 2) {
        if (t2[i] == -1) 
          continue;
        
        this.insert(t2[i], t2[i+1]);
      }
    }
    
    insert(key, idx) {
      //key = Math.floor(key);
      
      if (this.length > this.size*0.3333) {
        this.nextsize();
      }
      
      var t = this.table;
      var sz = this.size;
      
      var hash = this.hash(key);
      
      var _c=0;
      var maxc = this.size*20;
      var key2 = key;
      var off = 1;
      
      var starthash = hash;
      
      while (t[hash*2] != -1) {
        hash = (starthash+off)%sz;
        off += 1;
        
        if (_c++ > maxc || _c++ > 5300) {
          console.trace("infinite loop", off, _c, key, hash, idx, this.length, maxc, this.size);
          break;
        }
      }
      
      this.tot_c++;
      this.avg_c += _c;
      this.max_c = Math.max(this.max_c, _c);
      
      t[hash*2] = key;
      t[hash*2+1] = idx;
      
      this.length++;
      
      return hash*2;
    }
}

var search_ret = [];

export class SearchIter {
  constructor() {
    this.shash = undefined;
    this.co = new Vector2();
    this.r = undefined;
    this.i = -1;
    this.is_closed = true;
    this.key = undefined;
    this.hash = undefined;
    this.starthash = undefined;
    this.off = undefined;
    this._c = 0;
    
    this.sco = new Vector2();
    this.du = new Vector2();
    this.stepi = 0;
    this.stepj = 0;
    this.first = true;
    
    this.ret = {done : false, value : undefined};
  }
  
  [Symbol.iterator]() {
    return this;
  }
  
  bind(shash, p, r) {
    this.co.load(p);
    this.r = r;
    
    this.shash = shash;
    this.is_closed = false;
    this.first = true;
    
    this.key = shash.shash(p[0], p[1]);
    this.hash = shash.hash(this.key)%shash.size;
    this.starthash = this.hash;
    this.ret.done = false;
    
    this.i = this.hash*2;
    
    this.off = 1;
    this._c = 0;
    
    var cz = shash.cellsize;
    var dx = Math.ceil(r/cz) + 1;
    
    this.stepi = dx*2;
    this.stepj = dx*2;
    this.startj = dx*2;
    this.ijwid2 = dx;
    
    this.pi = Math.floor(p[0]/shash.cellsize);
    this.pj = Math.floor(p[1]/shash.cellsize);
    
    this.du[0] = this.du[1] = cz/(dx-1);
    
    this.shash.search_depth++;
    return this;
  }
  
  close() {
    this.return();
  }
  return() {
    if (this.is_closed) {
        return;
    }
    
    this.shash.search_depth--; // = Math.max(this.shash.search_depth-1, 0);
    
    this.is_closed = true;
  }
  
  next() {
    var ret = this.ret;
    if (this.is_closed) {
      ret.done = true;
      ret.value = undefined;
      return ret;
    }
    
    var i = this.i;
    var t = this.shash.table;
    
    //console.log("_c", this._c);
    
    if (this._c++ > 5000) {
      console.log("infinite loop in searchiter");
      ret.done = true;
      ret.value = undefined;
      
      this.return();
      return ret;
    }
    
    if (t[i] == -1 || this.first) {
      this.first = false;
      
      if (this.stepi == 0 && this.stepj == 0) {
        ret.done = true;
        ret.value = undefined;
        
        this.return();
        return ret;
      } else {
        if (this.stepj == 0) {
          this.stepj = this.startj;
          this.stepi--;
        }
        
        var ijwid2 = this.ijwid2;
        //console.log("stepi", this.stepi-ijwid2, "stepj", this.stepj-ijwid2);
        //console.log(this.pi, this.pj);
        
        this.stepj--;
        var x = this.pi + this.stepi - ijwid2;
        var y = this.pj + this.stepj - ijwid2;
        
        var key = this.key = this.shash.ishash(x, y);
        var hash = this.shash.hash(key)%this.shash.size;
        
        this.hash = hash;
        this.starthash = hash;
        this.off = 1;
        this.i = hash*2;
        
        return this.next();
      }
    }
    
    if (t[i] != this.key) {
      this.hash = (this.starthash + this.off) % this.shash.size;
      this.off += 1;
      this.i = this.hash*2;
      
      return this.next();
    }
    
    var idx = t[i+1];
    
    //console.log("idx", idx);
    if (idx == undefined) {
      console.log("EEK!!", i, t.length, t[i], t[i+1]);
    }
    ret.value = this.shash.point_eidmap[idx];

    this.hash = (this.starthash + this.off) % this.shash.size;
    this.off += 1;
    this.i = this.hash*2;
    
    return ret;
  }
}

export class SpatialHash extends IntegerHash {
  constructor(startsize) {
    super(startsize);
    
    this.search_iters = new Array(32);
    this.search_depth=0;
    
    for (var i=0; i<this.search_iters.length; i++) {
      this.search_iters[i] = new SearchIter();
    }
    
    this.cellsize = 0.1;
    this.idxmap = new Int32Array(this.size);
    this.idxmap.fill(-1);
    this.point_eidmap = new Array(this.size);
    
    this.smul1 = ~~(4/this.cellsize)+1;
    this.smul2 = ~~(256/this.cellsize)+8;
  }
  
  _getp(eid) {
    return this.point_eidmap[eid];
  }
  
  _setp(eid, p) {
    this.point_eidmap[eid] = p;
  }
  
  reset() {
    super.reset();
    
    this.idxmap.fill(-1);
    //this.point_eidmap = {}
  }
  
  nextsize() {
    super.nextsize();
    
    this.idxmap = new Int32Array(this.size*2);
    this.idxmap.fill(-1);

    var i = 0;
    var table = this.table;
    
    while (i < table.length) {
      var key = table[i++], idx = table[i++];
      
      if (key == -1)
        continue;
      
      this.idxmap[idx] = i-2;
    }
  }
  
  resize_idxmap(size) {
    size = Math.max(size, this.idxmap.length*2);
    var idx = new Int32Array(size);
    var pmap = new Array(size);
    idx.fill(-1);
    
    for (var i=0; i<this.idxmap.length; i++) {
      idx[i] = this.idxmap[i];
      pmap[i] = this.point_eidmap[i];
    }
    
    this.idxmap = idx;
  }
  
  //doesn't divide by cellsize
  ishash(x, y) {
    var key = x*this.smul1 + y*this.smul2;
    
    return key;
  }
  
  shash(x, y) {
    var x = Math.floor(x/this.cellsize);
    var y = Math.floor(y/this.cellsize);
    
    var key = x*this.smul1 + y*this.smul2;
    
    return key;
  }
  
  update(p, idx) {
    var cz = this.cellsize;
    
    this.point_eidmap[idx] = p;
    
    if (idx >= this.idxmap.length) {
      this.resize_idxmap(idx*2);
    }

    var idxmap = this.idxmap;
    var key = this.shash(p[0], p[1]);
    
    if (idxmap[idx] != -1) {
      if (this.idxmap[idx] == key) {
        return;
      }
      
      //XXX
      this.remove_at(idxmap[idx])
      idxmap[idx] = -1;
    }
    
    idxmap[idx] = this.insert(key, idx);
  }
  
  search(p, r) {
    var ret = search_ret;
    ret.length = 0;
    
    r *= 1.4143;
    
    var cz = this.cellsize;
    var x = Math.floor(p[0]/cz), y = Math.floor(p[1]/cz);
    
    var sx=Math.floor((p[0]-r)/cz);
    var sy=Math.floor((p[1]-r)/cz);
    
    var ex=Math.ceil((p[0]+r)/cz);
    var ey=Math.ceil((p[1]+r)/cz);
    
    var t = this.table;
    var size = this.size;
    var ps = this.point_eidmap;
    
    //console.log(sx, ex, sy, ey, x, y);
    for (var i=sx; i<=ex; i++) {
      for (var j=sy; j<=ey; j++) {
        var x2=i, y2=j;
        
        var key = this.ishash(x2, y2);
        var starthash = this.hash(key), hash = starthash;
        var off = 1;
        
        while (t[hash*2] != -1) {
          if (key != t[hash*2]) {
            hash = (starthash+off) % size;
            off += 1;
            continue;
          }
          
          var idx = t[hash*2+1];
          var p = ps[idx];
          
          if (p == undefined) {
            hash = (starthash+off) % size;
            off += 1;
            continue;
          }
          
          //if (p == undefined)
          //  continue;
          ret.push(p);
          
          hash = (starthash+off) % size;
          off += 1;
        }
      }
    }
    
    return ret;
  }
  
  search2(p, r) {
    var idx = this.search_depth%this.search_iters.length;
    
    //return new SearchIter().bind(this, p, r);
    return this.search_iters[idx].bind(this, p, r);
  }
}

export function test_shash() {
  var TOT = 1520

  var ihash = new SpatialHash(TOT*3+1);
  
  var ps = [];
  for (var i=0; i<TOT; i++) {
    var x = Math.random(), y = Math.random();
    
    var p = new Vector2([x, y]);
    
    p.eid = i;
    ps.push(p);
    
    var idx = p.eid;
    ihash.update(p, p.eid);
  }
  
  function* generator() {
    var _c = 0;
    
    for (var p of ps) {
      var tot=0, totinside=0, goalinside=0;
      var limit = 0.1;
      
      for (var p2 of ps) {
        if (p.vectorDistance(p2) < limit) {
          goalinside++;
        }
      }
      
      for (var p2 of ihash.search(p, limit)) {
        //console.log(p, p2);
        tot++;
        if (p.vectorDistance(p2) < limit) {
          totinside++;
        }
      }
      
      if (_c++ % 50 == 0) {
        console.log("tot:", tot, "totinside", totinside, "should be:", goalinside);
        yield;
      }
      
      //break;
    }
  }
  
  var job = generator();
  var last = util.time_ms();
  
  while (!job.next().done) {
  }
  /*
  var timer = window.setInterval(function() {
    //if (util.time_ms()-last < 100) {
    //  return;
    //}
    last = util.time_ms();
    
    try {
      var ret = job.next();
      if (ret.done) {
        window.clearInterval(timer);
      }
    } catch(error) {
        window.clearInterval(timer);
        util.print_stack(error);
    }
  }, 100);
  */
  console.log(ihash.table, ihash.size, ihash.length);
  console.log("average lookup time", ihash.avg_c/ihash.tot_c);
  console.log("max lookup time", ihash.max_c);
  
  return ihash;
}
