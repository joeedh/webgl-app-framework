import {ToolOp, ToolFlags} from "../path.ux/scripts/simple_toolsys.js";
import {StringProperty, IntProperty, EnumProperty,
        FlagProperty, BoolProperty, PropFlags, Vec3Property} from "../path.ux/scripts/toolprop.js";
import {PointSet} from './potree_types.js';
import {SceneObject} from '../sceneobject/sceneobject.js';

import {StandardTools} from "../sceneobject/stdtools.js";
import {Material} from "../core/material.js";

export class PackPointSetOp extends ToolOp {
  constructor() {
    super();
  }

  static canRun(ctx) {
    let ok = ctx.object !== undefined;
    ok = ok && ctx.object.data instanceof PointSet;
    ok = ok && !PointSet._packing;

    return ok;
  }


  static tooldef() {return {
    name     : "pack",
    uiname   : "Pack Active Pointset",
    toolpath : "pointset.pack",
    description : "Pack pointset into project file"
  }}

  exec(ctx) {
    let ptree = ctx.object.data;

    if (!ptree._packing) {
      ptree.pack();
    }
  }
};
ToolOp.register(PackPointSetOp);

export class AddPointSetOp extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname   : "Add Point Set",
    toolpath : "pointset.add",
    inputs : {
      url : new StringProperty(),
      select : new BoolProperty(true)
    },
    icon : -1,
    description : "Load a point set"
  }}

  exec(ctx) {
    let url = this.inputs.url.getValue();
    let scene = ctx.scene;

    let mat = new Material();
    ctx.datalib.add(mat);

    let pset = new PointSet();
    ctx.datalib.add(pset);

    let ob = new SceneObject();
    ctx.datalib.add(ob);

    ob.name = url;
    ob.data = pset;

    pset.material = mat;
    pset.name = url;
    pset.url = url;

    scene.add(ob);
    pset.load();

    if (this.inputs.select.getValue()) {
      scene.switchToolMode("object");
      scene.objects.setSelect(ob, true);
      scene.objects.setActive(ob);
    }

    //this technically violates MVC design rules
    window.setTimeout(() => {
      if (_appstate.ctx && _appstate.ctx.view3d) {
        _appstate.ctx.view3d.viewSelected(ob);
        window.redraw_viewport();
      }
    }, 500);
  }
}

ToolOp.register(AddPointSetOp);

export class PointSetTools extends StandardTools {

}
