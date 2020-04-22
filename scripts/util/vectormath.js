export * from '../path.ux/scripts/vectormath.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/vectormath.js';

window.Vector3 = Vector3;

Vector2.prototype.asTHREE = function() {
 return new THREE.Vector2(this[0], this[1]);
};

Vector2.prototype.loadTHREE = function(v) {
  this[0] = v.x;
  this[1] = v.y;

  return this;
};
Vector3.prototype.loadTHREE = function(v) {
  this[0] = v.x;
  this[1] = v.y;
  this[2] = v.z;

  return this;
};
Vector3.prototype.asTHREE = function() {
  return new THREE.Vector3(this[0], this[1], this[2]);
};

Vector4.prototype.loadTHREE = function(v) {
  this[0] = v.x;
  this[1] = v.y;
  this[2] = v.z;
  this[3] = v.w;

  return this;
};
Vector4.prototype.asTHREE = function() {
  return new THREE.Vector4(this[0], this[1], this[2], this[3]);
};


Quat.prototype.loadTHREE = function(v) {
  this[0] = v.x;
  this[1] = v.y;
  this[2] = v.z;
  this[3] = v.w;

  return this;
};

export function Matrix4ToTHREE(mat) {
  let m2 = new THREE.Matrix4();

  m2.fromArray(mat.getAsArray());

  return m2;
}

