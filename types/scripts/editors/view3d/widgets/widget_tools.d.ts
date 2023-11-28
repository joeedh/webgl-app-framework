export class WidgetSceneCursor extends WidgetBase {
    static widgetDefine(): {
        uiName: string;
        typeName: string;
        selMask: any;
        flag: number;
        icon: number;
    };
}
export class NoneWidget extends WidgetBase {
    static widgetDefine(): {
        uiname: string;
        name: string;
        icon: number;
        flag: number;
    };
    static validate(ctx: any): boolean;
}
export class TransformWidget extends WidgetBase {
    static validate(ctx: any): boolean;
    create(ctx: any, manager: any): void;
    /** space: see ConstraintSpaces */
    getTransMatrix(space?: any): Matrix4;
    getTransAABB(): Vector3[];
    getTransCenter(): any;
}
export class ThreeAxisWidget extends TransformWidget {
}
export class TranslateWidget extends ThreeAxisWidget {
    static widgetDefine(): {
        uiname: string;
        name: string;
        icon: number;
        flag: number;
    };
    constructor(manager: any);
    axes: any[];
    center: any;
    plane_axes: any[];
    startTool(axis: any, localX: any, localY: any): void;
}
export class ScaleWidget extends ThreeAxisWidget {
    static widgetDefine(): {
        uiname: string;
        name: string;
        icon: number;
        flag: number;
    };
    constructor(manager: any);
    axes: any[];
    center: any;
    startTool(axis: any, localX: any, localY: any): void;
}
export class RotateWidget extends TransformWidget {
    static widgetDefine(): {
        uiname: string;
        name: string;
        icon: number;
        flag: number;
    };
    static nodedef(): {
        name: string;
        inputs: {
            data: any;
        };
    };
    _first: boolean;
    axes: any[];
    onclick(e: any, axis: any): void;
    update(): void;
}
export class InflateWidget extends TransformWidget {
    static widgetDefine(): {
        uiname: string;
        name: string;
        icon: number;
        flag: number;
    };
    static nodedef(): {
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
    };
    _first: boolean;
    arrow: any;
    onclick(e: any): void;
    update(): void;
}
import { WidgetBase } from './widgets.js';
import { Matrix4 } from '../../../util/vectormath.js';
import { Vector3 } from '../../../util/vectormath.js';
