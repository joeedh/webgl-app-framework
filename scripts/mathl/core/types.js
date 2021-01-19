export class VarType {
  constructor(type) {
    this.type = type;
  }

  toString() {
    return `VarType(${this.type})`;
  }

  makeZero() {
    return 0.0;
  }

  getComponents() {
    return 1;
  }

  getBaseName() {
    return this.type;
  }

  getTypeName() {
    return "" + this.type;
  }

  getTypeNameSafe() {
    if (typeof this.type !== "string") {
      return this.type.getTypeNameSafe();
    }

    let s = this.getTypeName();

    s = s.replace(/[\[\]\(\)]/g, "_");
    return s;
  }
}

export class ArrayType extends VarType {
  constructor(type, size, alias="") {
    super();

    if (typeof type === "string") {
      type = new VarType(type);
    }

    this.alias = alias;
    this.type = type;
    this.size = size;
  }

  getComponents() {
    return this.size;
  }

  makeZero() {
    let ret = [];

    for (let i=0; i<this.size; i++) {
      ret.push(this.type.makeZero());
    }

    return ret;
  }

  getTypeName() {
    if (this.alias.length > 0) {
      return this.alias;
    }

    return `${this.type.getTypeName()}[${this.size}]`;

  }

  getBaseName() {
    return typeof this.type === "string" ? this.type : this.type.getBaseName();
  }

  getTypeNameSafe() {
    if (this.alias) {
      return this.alias;
    }

    return `${this.type.getTypeNameSafe()}_${this.size}_`;
  }

  toString() {
    return `ArrayType(${this.type}, ${this.size}, ${this.alias})`;
  }
}


export class DynamicArrayType extends ArrayType {
  constructor(type, alias="") {
    super();

    this.alias = alias;
    this.type = type;
  }

  getComponents() {
    return 100000;
  }

  makeZero() {
    return [];
  }

  getTypeName() {
    if (this.alias.length > 0) {
      return this.alias;
    }

    return `${this.type.getTypeName()}[]`;

  }

  getBaseName() {
    return typeof this.type === "string" ? this.type : this.type.getBaseName();
  }

  toString() {
    return `ArrayType(${this.type}, ${this.alias})`;
  }
}
