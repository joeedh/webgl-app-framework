import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';

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

export class TransDataType {
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
  
  static getCenter(ctx, elemlist) {
  }
  
  static calcAABB(ctx, elemlist) {
  }
  
  static update(ctx, elemlist) {
  }
}

