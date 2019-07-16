import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
        FlagProperty, ToolProperty, Vec3Property, Vec4Property,
        Vec2Property, PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys';

export const ShapeFlags = {
  SELECT     : 1,
  HIDE       : 2,
  CAN_SELECT : 4
};

export class WidgetShape {
  constructor() {
    this.pos = new Vector3();
    this.rot = new Vector3();
    this.scale = new Vector3();

    this.flag = ShapeFlags.CAN_SELECT;
    this.owner = undefined;

    this.matrix = new Matrix4();
    this.mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);

    this.onclick = () => {
      console.log("widget click!");
    }
  }

  distToMouse(x, y) {
    throw new Error("implement me");
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  copyTo(b) {
    b.flag = this.flag;
    b.owner = this.owner;
    b.matrix.load(this.matrix);
    b.loc.load(this.loc);
    b.rot.load(this.rot);
    b.scale.load(this.scale);
    b.mesh = this.mesh;

    return b;
  }

  draw(gl, matrix) {

  }
}

export class WidgetArrow extends WidgetShape {
  constructor() {
    super();
    S
  }
}

export class WidgetBase {
  constructor() {
    this.children = [];
    this.shape = undefined;
    this.manager = undefined; //is set by WidgetManager
  }

  static wigetDefine() {return {
    uiName   : "name",
    typeName : "typeName",
    selMask  : undefined,
    icon     : -1
  }}

  //can this widget run?
  static ctxValid(ctx) {
    return ctx.view3d.selectmode & this.constructor.widgetDefine().selMask;
  }

  get isDead() {
    throw new Error("implement me");
  }

  /**note that it's valid for containers
   * to return themselves, *if* they have
   * a shape and aren't purely containers
   * @param x view3d-local coordinate x
   * @param y view3d-local coordinate y
   */
  findNearest(x, y, limit=35) {
    let mindis, minret;

    if (this.shape !== undefined) {
      let dis = this.shape.distToMouse(x, y);

      mindis = dis;
      minret = this;
    }

    for (let child of this.children) {
      let dis = child.findNearest(x, y);
      if (mindis === undefined || dis < mindis) {
        mindis = dis;
        minret = child;
      }
    }

    if (mindis !== undefined && mindis > limit) {
      return undefined;
    }

    return minret;
  }

  update() {
    if (this.isDead) {
      this.remove();
    }
  }

  remove() {
    this.manager.remove(this);
  }

  on_mousedown(e) {
  }

  on_mousemove(e) {
  }

  on_mouseup(e) {
  }

  on_keydown(e) {

  }
}

export class WidgetManager {
  constructor() {
    this.widgets = [];
  }

  add(widget) {
    widget.manager = this;
    this.widgets.push(widget);
  }

  remove(widget) {
    widget.manager = undefined;
    this.widgets.remove(widget);
  }
}
