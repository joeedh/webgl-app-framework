
if (Math.fract === undefined) {
  Math.fract = (f) => f - Math.floor(f);
}

export * from '../path.ux/scripts/util/util.js';

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
  for (let k of Object.getOwnPropertyNames(parent.prototype)) {
    if (!(k in cls.prototype)) {
      cls.prototype[k] = parent.prototype[k];
    }
  }

  for (let k of Object.getOwnPropertySymbols(parent.prototype)) {
    if (cls.prototype[k] === undefined) {
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

