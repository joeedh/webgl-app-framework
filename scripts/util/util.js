export * from '../path.ux/scripts/util.js';

import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

/*
compatibility functions
*/
export function inherit(c, p, obj) {
  c.prototype = Object.create(p.prototype);

  for (var k in obj) {
    c.prototype[k] = obj[k];
  }

  return c.prototype;
}
export function mixin(cls, parent) {
  for (var k of Object.getOwnPropertyNames(parent.prototype)) {
    if (!(k in cls.prototype)) {
      cls.prototype[k] = parent.prototype[k];
    }
  }
}


//XXX compatibility class functions
export function init_prototype(cls, obj) {
  if (cls.prototype === undefined) {
    cls.prototype = {};
  }

  for (var k in obj) {
    cls.prototype[k] = obj[k];
  }

  return cls.prototype;
}

