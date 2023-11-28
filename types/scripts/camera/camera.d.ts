export class CameraData extends SceneObjectData {
    static nodedef(): {
        flag: number;
        name: string;
        uiname: string;
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
    camera: Camera;
    curve: any;
    finalCamera: Camera;
    type: number;
    speed: number;
    set height(arg: number);
    get height(): number;
    azimuth: number;
    _drawkey: string;
    mesh: SimpleMesh;
    _last_hash: any;
    pathFlipped: boolean;
    set rotate(arg: number);
    get rotate(): number;
    set flipped(arg: boolean);
    get flipped(): boolean;
    gen(gl: any): void;
    exec(ctx: any): void;
    curvespline: any;
}
import { SceneObjectData } from "../sceneobject/sceneobject_base.js";
import { Camera } from "../core/webgl.js";
import { SimpleMesh } from "../core/simplemesh.js";
