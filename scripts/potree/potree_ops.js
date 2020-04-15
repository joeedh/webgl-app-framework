import {ToolOp, ToolFlags} from "../path.ux/scripts/simple_toolsys.js";
import {StringProperty, IntProperty, EnumProperty,
        FlagProperty, BoolProperty, PropFlags, Vec3Property} from "../path.ux/scripts/toolprop.js";
import {PointSet} from './potree_types.js';
import {SceneObject} from '../sceneobject/sceneobject.js';

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

    let pset = new PointSet();
    ctx.datalib.add(pset);

    let ob = new SceneObject();
    ctx.datalib.add(ob);

    ob.name = url;
    ob.data = pset;
    pset.name = url;
    pset.url = url;

    scene.add(ob);
    pset.load();

    if (this.inputs.select.getValue()) {
      scene.objects.setSelect(ob, true);
      scene.objects.setActive(ob);
    }
  }
}

ToolOp.register(AddPointSetOp);
