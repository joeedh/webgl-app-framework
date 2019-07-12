var _kdtree = undefined;

//'ni' is shorthand for 'nodeindex', a point into the typed array data structure

define(["util", "vectormath", "math"], function(util, vectormath, math) {
  "use strict";
  
  var exports = _kdtree = {};
  var Vector3 = vectormath.Vector3;
  var Matrix4 = vectormath.Matrix4;
  
  //maximum points per node before splitting
  //make sure to raise this after testing
  var MAXPOINTS = 256
  
  /*seems like embedding the points in the nodes, while wasteful of memory,
    should be more cache efficient than referencing another typed array*/
  var NXMIN=0, NYMIN=1, NZMIN=2, NXMAX=3, NYMAX=4, NZMAX=5, NSPLITPLANE=6,
      NSPLITPOS=7, NCHILDA=8, NCHILDB=9, NTOTPOINT=10, TOTN=11+MAXPOINTS*4;

  //points are stored (x, y, z, id);
      
  var _insert_split_out = [0, 0];
  var _split_tmps = util.cachering.fromConstructor(Vector3, 64);
  
  var KDTree = exports.KDTree = class KDTree {
    constructor(min, max) {
      this.min = new Vector3(min);
      this.max = new Vector3(max);
      
      this._point_cachering = new util.cachering(() => {return {co : new Vector3(), id : undefined}}, 512);
      this._node_cachering = new util.cachering(() => {return {min : new Vector3(), max : new Vector3(), splitpos : undefined, splitplane : undefined, id : undefined}}, 512);
      this._search_cachering = util.cachering.fromConstructor(Vector3, 64);
      
      this.usednodes = 0;
      this.data = new Float64Array(TOTN*32);
      this.maxdepth = 128;
      
      this.lastReport = util.time_ms();
      this.reportsIgnored = 0;
      
      this.root = this.newNode(min, max);
    }
    
    report() {
      if (util.time_ms() - this.lastReport > 15) {
        console.log.apply(console, arguments);
        if (this.reportsIgnored > 0) {
          console.log("  ignored", this.reportsIgnored, "error messages");
          this.reportsIgnored = 0;
        }
        
        this.lastReport = util.time_ms();
      } else {
        this.reportsIgnored++;
      }
    }
    
    newNode(min, max) {
      var maxnodes = this.data.length / TOTN;
      
      if (this.usednodes >= maxnodes) {
        let newdata = new Float64Array(this.data.length*2);
        let data = this.data;
        let ilen = data.length;
        
        for (let i=0; i<ilen; i++) {
          newdata[i] = data[i];
        }
        
        this.data = newdata;
      }
      
      var ni = this.usednodes*TOTN;
      var data = this.data;
      
      for (let j=ni; j<ni+TOTN; j++) {
        data[j] = 0;
      }
      
      data[ni+NXMIN] = min[0];
      data[ni+NYMIN] = min[1];
      data[ni+NZMIN] = min[2];
      
      data[ni+NXMAX] = max[0];
      data[ni+NYMAX] = max[1];
      data[ni+NZMAX] = max[2];
      
      this.usednodes++;
      
      return ni;
    }
    
    insert(p, id) {
      let recurse = (ni, depth) => {
        var data = this.data;
        
        if (depth >= this.maxdepth) {
          this.report("Malformed data: failed to insert point", depth, p[0].toFixed(4), p[1].toFixed(4), p[2].toFixed(4), "id=", id, p);
          return;
        }
        
        //not a leaf node?
        if (data[ni+NCHILDA] != 0) {
          var axis = data[ni+NSPLITPLANE];
          var split = data[ni+NSPLITPOS];
          
          if (p[axis] == split) {
            //handle case of points exactly on boundary
            //distribute point randomly to children
            
            var child = !!(Math.random() > 0.5);
            //console.log("exact!", child, p[axis], split, axis);
            
            recurse(data[ni+NCHILDA+child], depth+1);
          } else if (p[axis] < split) {
            recurse(data[ni+NCHILDA], depth+1);
          } else {
            recurse(data[ni+NCHILDB], depth+1);
          }
          
        //a full leaf node?
        } else if (data[ni+NTOTPOINT] >= MAXPOINTS) {
          this.split(ni, _insert_split_out);
          
          this.insert.apply(this, arguments);
        } else { //add point
          var i = ni + NTOTPOINT + 1 + data[ni+NTOTPOINT]*4;
          
          data[i++] = p[0];
          data[i++] = p[1];
          data[i++] = p[2];
          data[i++] = id;
          
          data[ni+NTOTPOINT]++;
        }
      }
      
      recurse(this.root, 0);
    }
    
    forEachNode(cb, thisvar) {
      let cachering = this._node_cachering;
      let data = this.data;
      
      let recurse = (ni) => {
        var n = cachering.next();
        
        for (var i=0; i<3; i++) {
          n.min[i] = data[ni+i];
          n.max[i] = data[ni+3+i];
        }
        
        n.id = ni;
        n.splitplane = data[ni+NSPLITPLANE];
        n.splitpos = data[ni+NSPLITPOS];
        
        if (thisvar !== undefined) {
          cb.call(thisvar, n);
        } else {
          cb(n);
        }
        
        if (data[ni+NCHILDA] != 0) {
          recurse(data[ni+NCHILDA]);
          recurse(data[ni+NCHILDB]);
        }
      }
      
      recurse(this.root);
    }
    
    forEachPoint(cb, thisvar) {
      let cachering = this._point_cachering;
      
      let recurse = (ni) => {
        let data = this.data;
        
        if (data[ni+NCHILDA] != 0) {
          recurse(data[ni+NCHILDA]);
          recurse(data[ni+NCHILDB]);
        } else {
          let totpoint = data[ni+NTOTPOINT];
          let j = ni + NTOTPOINT + 1;
          
          for (let i=0; i<totpoint; i++) {
            let p = cachering.next();
            
            p.co[0] = data[j++];
            p.co[1] = data[j++];
            p.co[2] = data[j++];
            p.id = data[j++];
            
            if (thisvar !== undefined) {
              cb.call(thisvar, p);
            } else {
              cb(p);
            }
          }
        }
      }
      
      recurse(this.root);
    }
    
          //this._point_cachering
    
    //new_nodes_out is an array 
    split(ni, new_nodes_out) {
      //find split point
      let data = this.data;
      let startk = ni + NTOTPOINT + 1;
      let totp = data[ni + NTOTPOINT];
      
      let bestaxis = undefined;
      let bestsplit = undefined;
      let bestfit = undefined;
      
      if (totp == 0) {
        this.report("TRIED TO SPLIT AN EMPTY NODE!");
      }
        
      //find best split axis
      for (let axis=0; axis<3; axis++) {
        let centroid = 0;
        let amin = 1e17, amax=-1e17;
        
        for (let j=0, k=startk; j<totp; j++, k += 4) {
            centroid += data[k+axis];
            
            amin = Math.min(data[k+axis], amin);
            amax = Math.max(data[k+axis], amax);
        }
        
        if (amax-amin < 0.0001) {
          continue;
        }
        
        centroid /= totp;
        let fit = 0;
        
        for (let j=0, k=startk; j<totp; j++, k += 4) {
          fit += data[k+axis] < centroid ? -1 : 1;
        }
        fit = Math.abs(fit);
        
        var size=0;
        for (let k=0; k<3; k++) {
          size += Math.max(data[ni+3+k], data[ni+k]);
        }
        
        let aspect = (data[ni+3+axis] - data[ni+axis]) / size;
        
        if (aspect > 0 && aspect < 1)
          aspect = 1 / aspect;
        
        if (fit != totp && aspect > 0.001) {
          fit += aspect*7.0;
        }
        
        //console.log("A2", aspect);
      
        if (bestaxis === undefined || fit < bestfit) {
          bestfit = fit;
          bestsplit = centroid;
          bestaxis = axis;
        }
      }
      
      if (bestaxis === undefined) {
        this.report("Failed to split node; points were probably all duplicates of each other");
        return;
      }
      
//      console.log(bestsplit, bestaxis, ni);
      
      //split
      let min1 = _split_tmps.next().zero(), max1 = _split_tmps.next().zero();
      let min2 = _split_tmps.next().zero(), max2 = _split_tmps.next().zero();
      
      for (let i=0; i<3; i++) {
        min1[i] = data[ni+i];
        max1[i] = data[ni+NXMAX+i];
      }
      
      min2.load(min1);
      max2.load(max1);
      
      max1[bestaxis] = bestsplit;
      min2[bestaxis] = bestsplit;
      
      let c1 = this.newNode(min1, max1);
      let c2 = this.newNode(min2, max2);
      
      this.data[ni+NCHILDA] = c1;
      this.data[ni+NCHILDB] = c2;
      this.data[ni+NSPLITPOS] = bestsplit;
      this.data[ni+NSPLITPLANE] = bestaxis;
      
      this.data[ni+NTOTPOINT] = 0;
      
      if (new_nodes_out !== undefined) {
        new_nodes_out[0] = c1;
        new_nodes_out[1] = c2;
      }
      
      for (let k=startk, j=0; j<totp; j++, k += 4) {
        let p = _split_tmps.next().zero();
        
        p[0] = this.data[k], p[1] = this.data[k+1], p[2] = this.data[k+2];
        this.insert(p, this.data[k+3]);
      }
      
      this.data[ni+NTOTPOINT] = 0;
    }
    
    //if callback returns true then the search will stop
    search(p, r, callback, thisvar) {
      let stop = false;
      
      let data = this.data;
      let cachering = this._point_cachering;
      let co = this._search_cachering.next();
      
      let recurse = (ni) => {
        if (stop) {
          return;
        }
        
        if (data[ni+NCHILDA] != 0) {
          for (let si=0; si<2; si++) {
            let ni2 = data[ni+NCHILDA+si];
            let ok = 0;
            
            for (let i=0; i<3; i++) {
              let a = data[ni2+i], b = data[ni2+i+3];
              
              //console.log(a, b, p[i], r);
              ok += !!(p[i]+r > a && p[i]-r < b);
            }
            
            if (ok == 3) {
              recurse(ni2);
            }
          }
        } else if (data[ni+NCHILDA] == 0) {
          let totp = data[ni+NTOTPOINT];
          let k = ni+NTOTPOINT + 1;
          
          for (let j=0; j<totp; j++, k += 4) {
            co[0] = data[k];
            co[1] = data[k+1];
            co[2] = data[k+2];
            
            let dx = co[0] - p[0];
            let dy = co[1] - p[1];
            let dz = p.length > 2 ? (co[2] - p[2]) : 0;
              
            if (dx*dx + dy*dy + dz*dz < r*r) {
              let ret = cachering.next();
              let dostop;
              
              ret.co.load(co);
              ret.id = data[k+3];
              
              if (thisvar) {
                dostop = callback.call(thisvar, ret);
              } else {
                dostop = callback(ret);
              }
              
              if (dostop) {
                stop = true;
                break;
              }
            }
          }
        }
      }
      
      recurse(this.root);
    }
    
    balance() {
      /*
      balance tree.  idea is to do one level at a time, insert all points, subdivide all nodes in that
      level that needs subdivision and only then recurse.
      
      we can't do that with this data structure which is optimized for speed of memory access.
      so we have to build a temporary structure.
      */
      
      class Node extends Array {
        constructor(min, max) {
          super();
          
          this.min = new Vector3(min);
          this.max = new Vector3(max);
          this.bestpos = undefined;
          this.bestaxis = undefined;
          this.bestfit = undefined;
          
          this.nodes = [undefined, undefined];
          
        }
      }
      
      var min = new Vector3();
      var max = new Vector3();
      
      for (var i=0; i<3; i++) {
        min[i] = this.data[this.root+i];
        max[i] = this.data[this.root+3+i];
      }
      
      var root = new Node(min, max);
      
      this.forEachPoint((p, id) => {
        for (var j=0; j<3; j++) {
          root.push(p.co[j]);
        }
        
        root.push(p.id);
      });
      
      let recurse = (node, depth) => {
        if (depth >= this.maxdepth) {
          this.report("Malformed data: failed to insert point during balancing, depth:", depth);
          return;
        }
        
        if (node.length/4 < MAXPOINTS) {
          return;
        }
        
        let bestfit = undefined, bestpos = undefined, bestaxis = undefined;
        let size = 0;
        
        for (let axis=0; axis<3; axis++) {
          size = Math.max(size, node.max[axis] - node.min[axis]);
        }
        
        for (let axis=0; axis<3; axis++) {
          let centroid = 0;
          let amin = 1e17, amax = -1e17;
          
          for (let i=0; i<node.length; i += 4) {
            centroid += node[i+axis];
            
            amin = Math.min(amin, node[i+axis]);
            amax = Math.max(amax, node[i+axis]);
          }
          
          //points lie in axis's plane?
          if (amax-amin < 0.00001) {
            continue;
          }
          
          centroid /= node.length/4;
          
          let fit = 0;
          
          for (let i=0; i<node.length; i += 4) {
            fit += node[i+axis] < centroid ? -1 : 1;
          }
          fit = Math.abs(fit);
          
          let aspect = (node.max[axis] - node.min[axis]) / size;
          
          if (aspect > 0 && aspect < 1)
            aspect = 1 / aspect;
          
          if (fit != node.length/4 && aspect > 0.001) {
            fit += aspect*7.0;
          }

          if (bestfit === undefined || fit < bestfit) {
            bestfit = fit;
            bestpos = centroid;
            bestaxis = axis;
          }
        }
        
        if (bestfit === undefined) {
          this.report("data integrity error in balance(), node was fill with duplicate points");
          return;
        }
        
        node.bestpos = bestpos;
        node.bestaxis = bestaxis;
        node.bestfit = bestfit;
        
        //console.log(bestaxis, bestpos, bestfit);
        
        min.load(node.min);
        max.load(node.max);
        
        max[bestaxis] = bestpos;
        let n1 = new Node(min, max);
        
        max.load(node.max);
        min[bestaxis] = bestpos;
        let n2 = new Node(min, max);
        
        for (let i=0; i<node.length; i += 4) {
          let child = node[i+bestaxis] < bestpos ? n1 : n2;
          
          for (let j=0; j<4; j++) {
            child.push(node[i+j]);
          }
        }
        
        node.nodes[0] = n1;
        node.nodes[1] = n2;
        
        node.length = 0;
        
        recurse(n1, depth+1);
        recurse(n2, depth+1);
      }
      
      recurse(root, 0);
      
      this.data.fill(0, 0, this.data.length);
      this.usednodes = 0;
      this.root = this.newNode(root.min, root.max);
      
      let recurse2 = (node, ni) => {
        if (node.nodes[0] !== undefined) {
          this.data[ni+NSPLITPLANE] = node.bestaxis;
          this.data[ni+NSPLITPOS] = node.bestpos;
          
          let n1 = this.newNode(node.nodes[0].min, node.nodes[0].max);
          let n2 = this.newNode(node.nodes[1].min, node.nodes[1].max);
          
          this.data[ni+NCHILDA] = n1;
          this.data[ni+NCHILDB] = n2;
          
          recurse2(node.nodes[0], n1);
          recurse2(node.nodes[1], n2);
        } else {
          //console.log("yay, found points", ni, node.length/4);
          let data = this.data;
          
          data[ni+NTOTPOINT] = node.length/4;
          
          let j = ni + NTOTPOINT + 1;
          
          for (let i=0; i<node.length; i += 4) {
            if (i/4 >= MAXPOINTS) {
              this.report("ran over MAXPOINTS in balance!", node.length/4);
              break;
            }
            
            for (let k=0; k<4; k++) {
              data[j++] = node[i+k];
            }
          }
        }
      };
      
      recurse2(root, this.root);
    }
    
    draw(g) {
      let d = this.data;
      
      let recurse = (ni) => {
        g.beginPath();
        g.rect(d[ni+NXMIN], d[ni+NYMIN], d[ni+NXMAX] - d[ni+NXMIN], d[ni+NYMAX] - d[ni+NYMIN]);
        g.strokeStyle = "orange";
        g.fillStyle = "rgba(255, 150, 50, 0.25)";
        g.stroke();
        
        if (d[ni+NCHILDA] == 0.0) { //leaf node?
          g.fill();

          let r = 0.125*(this.max[0] - this.min[0]) / Math.sqrt(this.totpoint);
          let totpoint = d[ni+NTOTPOINT];

          g.beginPath();
          
          for (let i=0; i<totpoint*4; i += 4) {
            let i2 = ni + NTOTPOINT + 1 + i;
            
            let x = d[i2], y = d[i2+1], z = d[i2+2], id = d[i2+3];
            
            g.moveTo(x, y);
            g.arc(x, y, r, -Math.PI, Math.PI);
          }
          
          g.fillStyle = "rgba(100, 150, 250, 0.5)";
          g.fill();
        }
        
        if (d[ni+NCHILDA] != 0) {
          recurse(d[ni+NCHILDA]);
          recurse(d[ni+NCHILDB]);
        }
      }
      
      recurse(this.root);
    }
  }
  
  return exports;
});
