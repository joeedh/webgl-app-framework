//handle to module.  never access in code; for debug console use only.
var _canvas_patch = undefined;

define([
  "util", "math", "vectormath"
], function(util, math, vectormath) {
  "use strict";

  var exports = _canvas_patch = {};
  
  var Vector2 = vectormath.Vector2, Vector3 = vectormath.Vector3;
  var Vector4 = vectormath.Vector4, Matrix4 = vectormath.Matrix4;

  var patch_canvas2d = exports.patch_canvas2d = function patch_canvas2d(g) {
    g._matrix = new Matrix4();
    g._imatrix = new Matrix4();
    
    var transform_cachering = util.cachering.fromConstructor(Vector3, 128);
    
    function transform(x, y) { 
      var p = transform_cachering.next();
      p[0] = x, p[1] = y, p[2] = 0.0;
      
      p.multVecMatrix(g._matrix);
      p[0] = Math.abs(p[0]);
      p[1] = Math.abs(p[1]);
      
      return p;
    }
    
    g._rect = g.rect;
    g.rect = function(x, y, w, h) {
      //y -= h;
      
      var p1 = transform(x, y), p2 = transform(x+w, y+h);
      this._rect(p1[0], p2[1], Math.abs(p2[0]-p1[0]), Math.abs(p2[1]-p1[1]));
    }
    
    g._clearRect = g.clearRect;
    g.clearRect = function(x, y, w, h) {
      var p1 = transform(x, y), p2 = transform(x+w, y+h);
      this._clearRect(p1[0], p1[1], Math.abs(p2[0]-p1[0]), Math.abs(p2[1]-p1[1]));
    }
    
    g._moveTo = g.moveTo;
    g.moveTo = function(x, y) {
      var p = transform(x, y);
      this._moveTo(p[0], p[1]);
    }
    
    g._lineTo = g.line
    g.lineTo = function(x, y) {
      var p = transform(x, y);
      this._lineTo(p[0], p[1]);
    }
    
    g._arc = g.arc;
    g.arc = function(x, y, r, a1, a2) {
      var p = transform(x, y);
      //r = transform(0.0, r).vectorLength();
      
      this._arc(p[0], p[1], r, a1, a2);
    }
    
    g._bezierCurveTo = g.bezierCurveTo;
    g.bezierCurveTo = function(x1, y1, x2, y2, x3, y3) {
      var p1 = transform(x1, y1);
      var p2 = transform(x2, y2);
      var p3 = transform(x3, y3);
      
      this._bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    }
    
    var mat = new Matrix4();
    
    g._scale = g.scale;
    g.scale = function(x, y) {
      mat.makeIdentity();
      mat.scale(x, y, 1.0);
      
      this._matrix.multiply(mat);
    }
    
    g._translate = g.translate;
    g.translate = function(x, y) {
      mat.makeIdentity();
      mat.translate(x, y, 1.0);
      
      this._matrix.multiply(mat);
    }
  }
  
  return exports;
});
