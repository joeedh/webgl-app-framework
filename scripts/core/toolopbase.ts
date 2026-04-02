import {ToolOp, PropertySlots} from '../path.ux/scripts/pathux.js'
import {ToolContext, ViewContext} from './context.js'

export class ToolOpBase<InputSet extends PropertySlots, OutputSet extends PropertySlots> extends ToolOp<
  InputSet,
  OutputSet,
  ToolContext,
  ViewContext
> {}
