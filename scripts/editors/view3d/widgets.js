import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
        FlagProperty, ToolProperty, Vec3Property,
        PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {WidgetShapes} from './widget_shapes.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/math.js';

export const WidgetFlags = {
  SELECT    : 1,
  //HIDE      : 2,
  HIGHLIGHT : 4,
  CAN_SELECT : 8
};

export class WidgetShape {
  constructor(view3d) {
    this.pos = new Vector3();
    this.rot = new Vector3();
    this.scale = new Vector3();

    this.flag = WidgetFlags.CAN_SELECT;
    this.owner = undefined;

    this.color = new Vector4([0.1, 0.5, 1.0, 1.0]);
    this.hcolor = new Vector4([0.7, 0.7, 0.7, 0.5]); //highlight color

    this.matrix = new Matrix4();
    this.drawmatrix = new Matrix4();

    this.mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);

    this.onclick = () => {
      console.log("widget click!");
    }
  }

  destroy(gl) {
    this.mesh.destroy(gl);
    this.mesh = undefined;
  }

  distToMouse(view3d, x, y) {
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

  draw(gl, manager, matrix) {
    if (this.mesh === undefined) {
      console.warn("missing mesh in WidgetShape.prototype.draw()");
      return;
    }

    this.mesh.program = Shaders.WidgetMeshShader;

    this.mesh.uniforms.color = this.color;

    let mat = this.drawmatrix;
    mat.load(this.matrix).multiply(matrix);

    this.mesh.uniforms.polygonOffset = 0.0;
    this.mesh.uniforms.projectionMatrix = manager.view3d.camera.rendermat;
    this.mesh.uniforms.objectMatrix = mat;

    this.mesh.draw(gl);

    if (this.flag & WidgetFlags.HIGHLIGHT) {
      gl.enable(gl.BLEND);

      this.mesh.draw(gl, {
        polygonOffset : 0.1,
        color         : this.hcolor
      });
    }
  }
}

export class WidgetArrow extends WidgetShape {
  constructor(manager) {
    super();
  }

  draw(gl, manager, matrix) {
    this.mesh = manager.shapes.ARROW;

    super.draw(gl, manager, matrix);
  }

  distToMouse(view3d, x, y) {
    let v1 = new Vector3([0,0,0]);
    let v2 = new Vector3([0,0,1]);

    v1.multVecMatrix(this.drawmatrix);
    v2.multVecMatrix(this.drawmatrix);

    view3d.project(v1);
    view3d.project(v2);

    let dis = dist_to_line_2d(new Vector2([x, y]), v1, v2, true);

    return dis;
  }
}

export class WidgetBase {
  constructor() {
    this.flag = 0;
    this.children = [];
    this.shape = undefined;
    this.manager = undefined; //is set by WidgetManager
    this.matrix = new Matrix4();
    this._tempmatrix = new Matrix4();
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
    //throw new Error("implement me");
    return false;
  }

  /**note that it's valid for containers
   * to return themselves, *if* they have
   * a shape and aren't purely containers
   * @param x view3d-local coordinate x
   * @param y view3d-local coordinate y
   */
  findNearest(view3d, x, y, limit=35) {
    let mindis, minret;

    if (this.shape !== undefined) {
      let dis = this.shape.distToMouse(view3d, x, y);
      
      mindis = dis;
      minret = this;
    }

    for (let child of this.children) {
      let dis = child.findNearest(view3d, x, y);
      if (mindis === undefined || dis < mindis) {
        mindis = dis;
        minret = child;
      }
    }

    if (mindis !== undefined && mindis > limit) {
      return undefined;
    }

    return {
      data : minret,
      dis  : mindis
    };
  }

  update(manager) {
    if (this.isDead) {
      this.remove();
    }
  }

  remove() {
    this.manager.remove(this);
  }

  on_mousedown(localX, localY) {
  }

  on_mousemove(localX, localY) {
  }

  on_mouseup(localX, localY) {
  }

  on_keydown(localX, localY) {

  }

  draw(gl, manager, matrix=undefined) {
    let mat = this._tempmatrix;

    mat.makeIdentity();
    mat.load(this.matrix);

    if (matrix !== undefined) {
      mat.multiply(matrix);
    }

    for (let w of this.children) {
      w.draw(gl, manager, mat);
    }

    if (this.shape === undefined) {
      return;
    }

    if (this.flag & WidgetFlags.HIGHLIGHT) {
      this.shape.flag |= WidgetFlags.HIGHLIGHT;
    } else {
      this.shape.flag &= ~WidgetFlags.HIGHLIGHT;
    }

    this.shape.draw(gl, manager, mat);
  }
}

export class WidgetManager {
  constructor(view3d) {
    this.view3d = view3d;
    this.widgets = [];
    this.shapes = {};

    this.widgets.active = undefined;
    this.widgets.highlight = undefined;

    let test = new WidgetBase();
    test.shape = new WidgetArrow(this);
    this.test = test;

    this.add(test);

    this.ready = false;
  }

  loadShapes() {
    for (let k in WidgetShapes) {
      let mesh = WidgetShapes[k].copy();
      let smesh = mesh.genRender();

      this.shapes[k] = smesh;
    }

    this.ready = true;
  }

  /**see view3d.getSubEditorMpos for how localX/localY are derived*/
  on_mousedown(localX, localY) {
    let w = this.findNearest(localX, localY);
    console.log("w", w);

    if (w !== undefined) {
      w.on_mousedown(localX, localY);
      return true;
    }
  }

  findNearest(x, y, limit=55) {
    let mindis = 1e17;
    let minw = undefined;

    for (let w of this.widgets) {
      let ret = w.findNearest(this.view3d, x, y);

      if (ret === undefined) {
        continue;
      }

      let dis = ret.dis;

      if ((minw === undefined || dis < mindis) && dis < limit) {
        mindis = dis;
        minw = ret.data;
      }
    }
      
    return minw;
  }

  on_mousemove(localX, localY) {
    let w = this.findNearest(localX, localY);
    
    console.log(w);

    if (this.widgets.highlight !== w) {
      if (this.widgets.highlight !== undefined) {
        this.widgets.highlight.flag &= ~WidgetFlags.HIGHLIGHT;
      }

      this.widgets.highlight = w;
      if (w !== undefined) {
        w.flag |= WidgetFlags.HIGHLIGHT;
      }

      window.redraw_viewport();
    }

    if (w !== undefined) {
      return true;
    }
  }
  
  on_mouseup(localX, localY) {
    
  }

  add(widget) {
    widget.manager = this;
    this.widgets.push(widget);
  }

  remove(widget) {
    if (this.view3d !== undefined && this.view3d.gl !== undefined) {
      widget.destroy(this.view3d.gl);
    }

    widget.manager = undefined;
    this.widgets.remove(widget);
  }

  destroy(gl) {
    for (let k in this.shapes) {
      let shape = this.shapes[k];
      shape.destroy(gl);
    }
  }

  draw(gl, view3d) {
    this.view3d = view3d;
    this.gl = gl;

    for (let widget of this.widgets) {
      widget.draw(gl, this);
    }
  }

  updateWidgets() {

  }

  update(view3d) {
    this.view3d = view3d;

    for (let widget of this.widgets) {
      widget.update(this);
    }
  }
}
