/*
Transform interface refactor:

1. Refactor TransDataType
  - Should be able to pass in custom TransDataTypes to transform ops,
    maybe via subclassing?
  - Or maybe I'll make a new ListProperty tool property, so I can pass in
    lists of strings.

2. Add a transformDefine to transDataType abstract class:
  static transformDefine() {return {
    name   : "",
    uiname : "",
    flag   : 0
  }}

3.  Add a isValid static to transDataType
  static isValid(ctx) {
    //return if ctx is valid for this data
  }
*/

import * as util from '../../../util/util.js';
import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import {ToolOp, UndoFlags, keymap, ListProperty, StringSetProperty} from '../../../path.ux/scripts/pathux.js';

export const ConstraintSpaces = {
  WORLD : 0,
  LOCAL : 1,
  NORMAL: 2,
  //2-16 are reserved for further global types

  //children will add types here
};

//proportional edit mode, "magnet tool"
export const PropModes = {
  SMOOTH     : 0,
  SHARP      : 1,
  EXTRA_SHARP: 2,
  SPHERE     : 3,
  LINEAR     : 4,
  CONSTANT   : 5,
};

export class TransDataElem {
  constructor(typecls) {
    this.data1 = undefined; //set by client code
    this.data2 = undefined; //set by client code
    this.no = undefined; //used by inflate
    this.mesh = undefined;

    this.index = -1;
    this.symFlag = 0; //see MeshSymFlags
    this.w = 1.0;
    this.type = typecls;
  }
}

export class TransDataList extends Array {
  constructor(typeclass, data) {
    super();

    this.type = typeclass;

    if (data !== undefined) {
      for (let item of data) {
        this.push(item);
      }
    }
  }
}

export class TransformData extends Array {
  constructor() {
    super();

    this.center = new Vector3();
    this.scenter = new Vector2();
  }
}

export let TransDataTypes = [];
export let TransDataMap = {};

export class TransDataType {
  static transformDefine() {
    return {
      name  : "",
      uiname: "",
      flag  : 0,
      icon  : -1
    }
  }

  static isValid(ctx, toolop) {
    return true;
  }

  static buildTypesProp(default_value = undefined) {
    let def = new util.set();

    for (let cls of TransDataTypes) {
      let tdef = cls.transformDefine();

      def.add(tdef.name);
    }

    return new StringSetProperty(default_value, def);
  }

  static getClass(name) {
    return TransDataMap[name];
  }

  static register(cls) {
    let def = cls.transformDefine();

    TransDataTypes.push(cls);
    TransDataMap[def.name] = cls;
  }

  static calcPropCurve(dis, propmode, propradius) {
    dis /= propradius;
    dis = 1.0 - Math.min(Math.max(dis, 0.0), 1.0);

    if (propmode === PropModes.SMOOTH) {
      dis = dis*dis*(3.0 - 2.0*dis);
    } else if (propmode === PropModes.SPHERE) {
      dis = 1.0 - (1.0 - dis)*(1.0 - dis);
    } else if (propmode === PropModes.SHARP) {
      dis *= dis;
    } else if (propmode === PropModes.EXTRA_SHARP) {
      dis *= dis*dis*dis;
    } else if (propmode === PropModes.CONSTANT) {
      dis = 1.0;
    }

    return dis;
  }

  static genData(ctx, selectmode, propmode, propradius, toolop) {
  }

  static applyTransform(ctx, elem, do_prop, matrix, toolop) {
  }

  static undoPre(ctx, elemlist) {
    //returns undo data
  }

  static undo(ctx, undodata) {
  }


  /**
   * @param ctx                : instance of ToolContext or a derived class
   * @param selmask            : SelMask
   * @param spacemode          : ConstraintSpaces
   * @param space_matrix_out   : Matrix4, optional, matrix to put constraint space in
   */
  static getCenter(ctx, list, selmask, spacemode, space_matrix_out, toolop) {

  }

  static calcAABB(ctx, toolop) {
  }

  static update(ctx, elemlist) {
  }
}

