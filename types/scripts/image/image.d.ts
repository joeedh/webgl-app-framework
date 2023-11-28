export namespace ImageFlags {
    let SELECT: number;
    let HIDE: number;
    let UPDATE: number;
}
export namespace ImageTypes {
    let GENERATED: number;
    let BYTE_BUFFER: number;
    let FLOAT_BUFFER: number;
    let URL: number;
}
export namespace ImageGenTypes {
    let COLOR: number;
    let UVGRID: number;
}
export class ImageBlock extends DataBlock {
    static blockDefine(): {
        uiName: string;
        typeName: string;
        defaultName: string;
        icon: number;
    };
    static nodedef(): {
        name: string;
        uiname: string;
        inputs: {};
        outputs: {
            depend: DependSocket;
        };
        flag: number;
    };
    type: number;
    genType: number;
    flag: number;
    width: number;
    height: number;
    byteBuffer: any;
    floatBuffer: Float32Array;
    updateGen: number;
    genColor: Vector4;
    url: string;
    ready: boolean;
    gpuHasData: boolean;
    gl: any;
    glType: any;
    glTex: any;
    glRegen: boolean;
    _drawFBO: FBO;
    _tex2: any;
    _last_update_key: any;
    _promises: any[];
    _image: HTMLImageElement;
    getDrawFBO(gl: any): FBO;
    freeDrawFBO(gl: any): this;
    swapWithFBO(gl: any): this;
    packAsURL(): void;
    _copyTo(b: any): void;
    copy(): any;
    downloadFromGL(): void;
    _convertToFloat(): this;
    fbuf: Float32Array;
    _convertToByte(): this;
    convertTypeTo(type: any): this;
    getGlTex(gl: any): any;
    calcUpdateKey(digest?: any): void;
    _firePromises(): void;
    update(): void;
    _regen(): HTMLImageElement;
    getImage(): Promise<any>;
    _save(): string;
}
export class ImageUser {
    constructor(image: any);
    image: any;
    dataLink(ownerBlock: any, getblock: any, getblock_addUser: any): void;
    calcUpdateKey(digest?: any): any;
}
export namespace ImageUser {
    let STRUCT: string;
}
import { DataBlock } from '../core/lib_api.js';
import { Vector4 } from '../path.ux/scripts/pathux.js';
import { FBO } from '../core/fbo.js';
import { DependSocket } from '../core/graphsockets.js';
