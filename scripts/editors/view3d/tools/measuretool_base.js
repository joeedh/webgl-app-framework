import {Vector3} from "../../../util/vectormath.js";
import '../../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export const MeasureFlags = {
  SELECT : 1
};

export class MeasurePoint extends Vector3 {
  constructor(co) {
    super(co);

    if (co !== undefined && co instanceof MeasurePoint) {
      this.flag = co.flag;
    } else {
      this.flag = 0;
    }
  }

  get select() {
    return this.flag & MeasureFlags.SELECT;
  }

  copy() {
    let ret = new MeasurePoint(this);
    ret.flag = this.flag;

    return ret;
  }
}

MeasurePoint.STRUCT = `
MeasurePoint {
 0    : float;
 1    : float;
 2    : float;
 flag : int; 
}
`;
nstructjs.manager.add_class(MeasurePoint);

export class MeasureUtils {
  get points() {
    let ret = function* points(name, ctx) {
      if (ctx === undefined)
        throw new Error("ctx cannot be undefined");
      if (ctx.scene === undefined) {
        return;
      }

      let toolmode = ctx.scene.toolmode_namemap[name];
      if (!toolmode._isMeasureTool) {
        return;
      }

      for (let p of toolmode.points) {
        yield p;
      }
    };

    ret.selected = function* (name, ctx) {
      for (let p of measureUtils.points(name, ctx)) {
        if (p.flag & MeasureFlags.SELECT) {
          yield p;
        }
      }
    };

    return ret;
  }

  getPath(name, ctx, p) {
    let m = ctx.scene.toolmode_namemap[name];
    let i = m.points.indexOf(p);

    return `scene.tools.${name}.points[${i}]`;
  }

  setSelect(name, ctx, p, val) {
    if (ctx === undefined || ctx instanceof MeasurePoint) {
      throw new Error("ctx was undefined");
    }

    if (val ){
      p.flag |= MeasureFlags.SELECT;
    } else {
      p.flag &= ~MeasureFlags.SELECT;
    }
  };

  update(name, ctx) {
    if (ctx === undefined) {
      throw new Error("ctx cannot be undefined");
    }

    if (ctx.scene === undefined) {
      return;
    }

    let toolmode = ctx.scene.toolmode_namemap[name];

    if (toolmode._isMeasureTool) {
      toolmode.update();
    }

    window.redraw_viewport();
  }
}

export const measureUtils = new MeasureUtils();
