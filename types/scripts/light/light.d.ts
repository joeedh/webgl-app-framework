export namespace LightFlags {
    let SELECT: number;
    let HIDE: number;
    let LOCKED: number;
}
export namespace LightTypes {
    let POINT: number;
    let SUN: number;
    let AREA_DISK: number;
    let AREA_RECT: number;
}
export class Light extends SceneObjectData {
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
    };
    type: number;
    getBoundingBox(): any[];
    copy(): Light;
    copyAddUsers(): Light;
}
import { SceneObjectData } from '../sceneobject/sceneobject_base.js';
