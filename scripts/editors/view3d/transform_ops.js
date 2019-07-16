import {TransDataElem, TransformData, TransDataList, TransDataType, PropModes, TransDataTypes, TransDataList} from "./transform_base";
import {MeshTransType} from "./transform_types";
import {ToolOp, UndoFlags} from "../../path.ux/scripts/simple_toolsys";
import {IntProperty, FlagProperty, EnumProperty,
        Vec3Property, Vec4Property, FloatProperty,
        BoolProperty, PropFlags, PropTypes, PropSubTypes
       } from "../../path.ux/scripts/toolprop.js";
import {SelMask} from './selectmode.js';

export class TransformOp extends ToolOp {
  constructor() {
    super();

    this.tdata = undefined;
  }

  static tooldef() {return {
    uiname      : "transform base",
    is_modal    : true,

    inputs       : {
      value      : new Vec3Property(),
      selmask    : new EnumProperty(undefined, SelMask),
      propmode   : new EnumProperty(0, PropModes, undefined,
                   "Prop Mode", "Proportional (magnet) mode",
                   PropFlags.SAVE_LAST_VALUE),
      propradius : new FloatProperty(0.125, "propradius", "Prop Radius",
                       "Proportional radius", PropFlags.SAVE_LAST_VALUE)
    }
  }}

  genTransData(ctx) {
    let tdata = this.tdata = new TransformData();
    let propmode = this.inputs.propmode.getValue();
    let propradius = this.inputs.propradius.getValue();
    let selmask = this.inputs.selmask.getValue();

    console.log("selmask", selmask, "propmode", propmode, "propradius", propradius);

    for (let type of TransDataTypes) {
      let list = type.genData(ctx, selmask, propmode, propradius);
      if (list === undefined || list.length == 0) {
        continue;
      }

      if (!(list instanceof TransDataList)) {
        list = new TransDataList(type, list);
      }

      tdata.push(list);
    }

    return tdata;
  }
}
