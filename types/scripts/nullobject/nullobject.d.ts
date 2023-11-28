export class NullObject extends SceneObjectData {
    static nodedef(): {
        name: string;
        flag: number;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
    };
    static dataDefine(): {
        name: string;
        selectMask: number;
        tools: any;
    };
}
export namespace NullObject {
    let STRUCT: string;
}
import { SceneObjectData } from "../sceneobject/sceneobject_base.js";
