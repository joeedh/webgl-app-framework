export function makeDefaultMaterial(): Material;
export class MakeMaterialOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        description: string;
        inputs: {
            dataPathToSet: StringProperty;
            name: StringProperty;
        };
        outputs: {
            materialID: IntProperty;
        };
    };
    static invoke(ctx: any, args: any): MakeMaterialOp;
    exec(ctx: any): void;
}
export class UnlinkMaterialOp extends ToolOp {
    static tooldef(): {
        uiname: string;
        toolpath: string;
        icon: number;
        description: string;
        inputs: {
            dataPathToUnset: StringProperty;
        };
    };
    static invoke(ctx: any, args: any): UnlinkMaterialOp;
    exec(ctx: any): void;
}
export class MaterialFlags {
}
export const DefaultMat: any;
export class Material extends ShaderNetwork {
    /**
     * Checks if a material name "Default" exists in ctx.datalib and returns it,
     * otherwise it returns a frozen Material instance.
     * @param ctx : Context
     * @returns Material
     * */
    static getDefaultMaterial(ctx: any): any;
    static nodedef(): {
        name: string;
        uiname: string;
        inputs: {};
        outputs: {};
    };
    calcSettingsHash(): void;
}
import { ToolOp } from '../path.ux/scripts/pathux.js';
import { StringProperty } from '../path.ux/scripts/pathux.js';
import { IntProperty } from '../path.ux/scripts/pathux.js';
import { ShaderNetwork } from "../shadernodes/shadernetwork.js";
