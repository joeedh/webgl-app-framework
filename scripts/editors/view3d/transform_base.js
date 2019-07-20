import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';

export const ConstraintSpaces = {
  WORLD      : 0,
  LOCAL      : 1,
  NORMAL     : 2
  //2-16 are reserved for further global types

  //children will add types here
};

//proportional edit mode, "magnet tool"
export const PropModes = {
  NONE   : 0,
  SMOOTH : 1,
  SHARP  : 2
};

export class TransDataElem {
  constructor(typecls) {
    this.data1 = undefined; //set by client code
    this.data2 = undefined; //set by client code
    this.index = -1;
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

export class TransDataType {
  static register(cls) {
    TransDataTypes.push(cls);
  }

  static calcPropCurve(dis, propmode, propradius) {
    dis /= propradius;
    dis = 1.0 - Math.min(Math.max(dis, 0.0), 1.0);
    
    if (propmode == PropTypes.SMOOTH) {
      dis = dis*dis*(3.0 - 2.0*dis);
    } else {
      dis *= dis;
    }
    
    return dis;
  }
  
  static genData(ctx, selectmode, propmode, propradius) {
  }
  
  static applyTransform(ctx, elem, do_prop) {
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
  static getCenter(ctx, selmask, spacemode, space_matrix_out) {
    
  }
  
  static calcAABB(ctx) {
  }
  
  static update(ctx, elemlist) {
  }
}

