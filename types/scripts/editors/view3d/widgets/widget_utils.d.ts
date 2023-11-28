export class TransMovWidget extends TransDataType {
    static genData(ctx: any, selectMask: any, propmode: any, propradius: any, toolop: any): TransDataElem[];
    static undoPre(ctx: any, elemlist: any): {
        paths: any[];
        cos: any[];
    };
    /**
     * @param ctx                : instance of ToolContext or a derived class
     * @param selmask            : SelMask
     * @param spacemode          : ConstraintSpaces
     * @param space_matrix_out   : Matrix4, optional, matrix to put constraint space in
     */
    static getCenter(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any, toolop: any): Vector3;
}
export class MovWidgetTranslateOp extends TranslateOp {
    static tooldef(): {
        name: string;
        uiname: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        outputs: any;
    };
}
export class MovableWidget extends WidgetBase {
    static canCall(ctx: any): boolean;
    constructor(manager: any, datapath: any, snapmode?: number);
    datapath: any;
    shapeid: string;
    snapMode: number;
    bad: boolean;
    onupdate: any;
    tools: {};
    addTools(selectOne: any, toggleSelectAll: any): this;
    get iterWidgets(): Generator<MovableWidget, void, unknown>;
    on_mousedown(e: any, localX: any, localY: any, was_touch: any): void;
    getSelect(): any;
    getValue(): any;
    setValue(val: any): void;
}
import { TransDataType } from '../transform/transform_base.js';
import { TransDataElem } from '../transform/transform_base.js';
import { Vector3 } from '../../../util/vectormath.js';
import { TranslateOp } from "../transform/transform_ops.js";
import { WidgetBase } from './widgets.js';
