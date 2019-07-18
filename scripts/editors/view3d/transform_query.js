import {keymap} from '../../path.ux/scripts/simple_events.js';
import {TransDataElem, TransformData, TransDataType, PropModes, TransDataTypes, TransDataList} from "./transform_base.js";
import {MeshTransType} from "./transform_types.js";
import {ToolOp, UndoFlags} from "../../path.ux/scripts/simple_toolsys.js";
import {IntProperty, FlagProperty, EnumProperty,
  Vec3Property, Mat4Property, FloatProperty,
  BoolProperty, PropFlags, PropTypes, PropSubTypes
} from "../../path.ux/scripts/toolprop.js";
import {SelMask} from './selectmode.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {View3DOp} from './view3d_ops.js';
import {isect_ray_plane} from '../../path.ux/scripts/math.js';
import {cachering} from '../../util/util.js';

let cent_rets = cachering.fromConstructor(Vector3, 64);

export function calcTransCenter(ctx, selmask) {
  let cent = cent_rets.next().zero();
  let tot = 0.0;

  for (let type of TransDataTypes) {
    cent.add(type.getCenter(ctx, selmask));
    tot++;
  }

  if (tot > 0.0) {
    cent.mulScalar(1.0 / tot);
  }

  return cent;
}
