import {
  F32BaseVector, IVectorConstructor, makeVector2, makeVector3, makeVector4,
  Vector2, Vector3, nstructjs, util, INumVector, IBaseVector, IVectorOrHigher, NumLitHigher
} from '../path.ux/scripts/pathux'

interface FVectorBase<LEN extends 2 | 3 | 4> extends IBaseVector<LEN, Array[number]> {
  constructor(a?: this | INumVector | IBaseVector<NumLitHigher<LEN>>, offset?: number, len?: number);
}

interface FVectorConstructor<Type, LEN extends 2 | 3 | 4> extends IVectorConstructor<Type, LEN> {
  new(a?: this | INumVector | IBaseVector<NumLitHigher<LEN>>, offset?: number, len?: number);
}

function myMakeVector3<Base extends IBaseVector<3>>(parent: IVectorConstructor<Base, 3>, structName: string,
                                                    structType?: string,
                                                    customConstructorCode?: string): FVectorConstructor<FVectorBase<3>, 3> {
  return makeVector3<Base>(parent, structName, structType, customConstructorCode) as FVectorConstructor<FVectorBase<3>, 3>
}

export class FVector3 extends myMakeVector3<FVectorBase<3>>(
  F32BaseVector as FVectorConstructor<Vector3, 3>,
  "FVector3Base",
  "float",
  `
  constructor() {
    if (arguments.length <= 1) {
      super(3);
    } else if (arguments.length >= 2) {
      if (!(arguments[0] instanceof ArrayBuffer)) {
        throw new Error("invalid arguments to FVector3");
      }
      
      super(...arguments);
    }
    
    if (arguments.length === 1) {
      const vec = arguments[0];
      
      this[0] = vec[0];
      this[1] = vec[1];
      this[2] = vec[2];
    } else {
      this[0] = this[1] = this[2] = 0.0;
    }
  }
  `) {
  /* inherits from mixin parent. */
  static STRUCT = nstructjs.inlineRegister(this, `
  FVector3 {
  }
  `)

  static fromArrayBuffer(buffer: ArrayBuffer) {

  }
}

const v = new FVector3(new ArrayBuffer(4), 0, 1);
