"use strict";

let _octree = undefined;

define([
  "util", "vectormath", "isect"
], function(util, vectormath, isect) {
  "use strict";
  
  let exports = _octree = {};

  var LEAF_LIMIT = 8

  let Vector3 = vectormath.Vector3;
  let ray_tri_isect = isect.ray_tri_isect;
  let aabb_ray_isect = isect.aabb_ray_isect;
  let triBoxOverlap = isect.triBoxOverlap;
  
  let _csize = new Vector3();
  let _min = new Vector3();
  let _max = new Vector3();
  let _tris = [0, 0, 0];
  
  let OcNode = exports.OcNode = class OcNode {
    constructor(min, max) {
      this.children = new GArray();
      this.data = undefined;
      this.idata = undefined;
      
      this.leaf = false;
      this._ret = [0, [0, 0, 0]]; //cached return for .isect_ray
      
      this.min = new Vector3(min);
      this.max = new Vector3(max);

      this.cent = new Vector3(max).add(min).mulScalar(0.5);
      this.halfsize = new Vector3(max).sub(min).mulScalar(0.5);
      
      this.id = undefined;
    }
    
    isect_ray(co, dir) {
      if (this.children.length == 0) {
        var data = this.data;
        var idata = this.idata;
        var ilen = Math.floor(data.length/3);
        
        var ret = undefined;
        var t = 0;
        var reti = 0;
        
        for (var i=0; i<ilen; i++) {
          var ret2 = ray_tri_isect(co, dir, data[i*3], data[i*3+1], data[i*3+2]);
          if (ret2 != undefined && (ret==undefined || (ret[0]>0 && ret[0]<t))) {
            //console.log("yay, tri ray isect");
            
            ret = ret2;
            reti = i;
            t = ret[0];
          }
        }
        
        if (ret == undefined) return undefined;
        
        var ret2 = this._ret;
        ret2[0] = idata[reti];
        ret2[1][0] = ret[0];
        ret2[1][1] = ret[1];
        ret2[1][2] = ret[2];
        
        return ret2;
      } else {
        var ret = undefined;
        var t;
        
        for (var c of this.children) {
          if (aabb_ray_isect(co, dir, c.min, c.max)) {
            var ret2 = c.isect_ray(co, dir);
            if (ret2 == undefined) continue;
            
            //console.log("t:", ret2[1][0]);
            if (ret == undefined || (ret2[1][0] > 0 && ret2[1][0] < t)) {
              ret = ret2;
              t = ret[1][0];
            }
          }
        }
        
        return ret;
      }
    }
    
    split() {
      if (this.children.length > 0)
        return;
      
      this.leaf = false;
      
      let csize = _csize, min = _min, max = _max;
      var omin = this.min;
      
      csize.load(this.halfsize);
      
      for (var x=0; x<2; x++) {
        min[0] = omin[0]+csize[0]*x;
        for (var y=0; y<2; y++) {
          min[1] = omin[1]+csize[1]*y;
          for (var z=0; z<2; z++) {
            min[2] = omin[2]+csize[2]*z;
            
            max.load(min).add(csize);
            
            var c = new OcNode(min, max);
            
            c.leaf = true;
            c.data = new GArray();
            c.idata = new GArray();
            
            this.children.push(c);
          }
        }
      }
      
      var data = this.data;
      var idata =  this.idata
      this.data = undefined;
      this.idata = undefined;
      
      var v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3();
      var ilen = Math.floor(data.length/3);
      
      for (var i=0; i<ilen; i++) {
        v1.load(data[i*3]); v2.load(data[i*3+1]); v3.load(data[i*3+2]);
        this.add_tri(v1, v2, v3, idata[i]);
      }
    }
    
    add_tri(v1, v2, v3, idx) {
      let tris = _tris;
      
      tris[0] = v1, tris[1] = v2, tris[2] = v3;
      for (var c of this.children) {
        if (triBoxOverlap(c.cent, c.halfsize, tris)) {
          c.add_tri(v1, v2, v3, idx);
          return;
        }
      }
      
      if (this.data == undefined) {
        console.log("evil in octree!");
        return;
      }
      
      this.data.push(new Vector3(v1));
      this.data.push(new Vector3(v2));
      this.data.push(new Vector3(v3));
      this.idata.push(idx);
      
      if (this.data.length*0.33 > LEAF_LIMIT) {
        this.split();
      }
    }
  }

  let OcTree = exports.OcTree = class OcTree {
    constructor(min, max) {
      this.min = new Vector3(min);
      this.max = new Vector3(max);
      
      this.root = new OcNode(min, max);
      this.root.leaf = true;
      this.root.data = new GArray();
      this.root.idata = new GArray();
    }
      
    add_tri(v1, v2, v3, idx) {
      this.root.add_tri(v1, v2, v3, idx);
    }
    
    
    //returns an array of vectors?
    isect_ray(co, dir) {
      return this.root.isect_ray(co, dir);
    }
  }
  
  return exports;
});
