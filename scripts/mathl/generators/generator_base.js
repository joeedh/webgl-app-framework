export const CodeGenerators = [];

export class CodeGenerator {
  constructor(ctx, args={}) {
    this.ctx = ctx;
    this.args = args;
  }

  genCode(ast) {

  }

  static generatorDefine() {
    return {
      typeName: ""
    }
  }

  static getGenerator(name) {
    for (let cls of CodeGenerators) {
      if (cls.generatorDefine().typeName === name) {
        return cls;
      }
    }
  }

  static register(cls) {
    if (cls.generatorDefine === CodeGenerator.generatorDefine) {
      throw new Error("missing generatorDefine static method for " + cls.name);
    }

    CodeGenerators.push(cls);
  }
}
