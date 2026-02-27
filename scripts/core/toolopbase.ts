import {
  ToolOp, ToolProperty, util, nstructjs,
  PropertySlots
} from "../path.ux/scripts/pathux.js";
import {ToolContext, ViewContext} from "../../types/scripts/core/context";

export class ToolOpBase<InputSet extends PropertySlots, OutputSet extends PropertySlots> extends ToolOp<
  InputSet, OutputSet, ToolContext, ViewContext
> {
}


