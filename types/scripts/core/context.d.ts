declare const BaseOverlay_base: {
    new (appstate: any): {
        [x: string]: any;
        ctx: any;
        _state: any;
        state: any;
        onRemove(have_new_file?: boolean): void;
        copy(): any;
        validate(): void;
    };
    [x: string]: any;
    contextDefine(): {
        name: string;
        flag: number;
    };
    resolveDef(): any;
};
export class BaseOverlay extends BaseOverlay_base {
    static contextDefine(): {
        name: string;
    };
    get messagebus(): import("./bus.js").MessageBus;
    messagebus_save(): any;
    messagebus_load(): import("./bus.js").MessageBus;
    get settings(): any;
    settings_save(): any;
    settings_load(ctx: any, data: any): any;
    get timeStart(): any;
    get timeEnd(): any;
    get gl(): any;
    gl_save(): any;
    gl_load(ctx: any, data: any): void;
    validate(): boolean;
    get toolDefaults(): any;
    toolDefaults_save(): any;
    toolDefaults_load(): any;
    get propCache(): any;
    propCache_save(): any;
    propCache_load(ctx: any, data: any): any;
    get last_tool(): any;
    copy(): BaseOverlay;
    get material(): any;
    get playing(): any;
    get graph(): any;
    get toolmode(): any;
    get toolstack(): any;
    get api(): any;
    get datalib(): any;
    toolmode_save(): any;
    toolmode_load(ctx: any, data: any): any;
    get scene(): any;
    get strandset_object(): any;
    get strandset(): any;
    get object(): any;
    get tetmesh(): any;
    get smesh(): any;
    get mesh(): any;
    get light(): any;
    get selectedObjects(): any;
    get selectedLightObjects(): any[] | Generator<any, void, unknown>;
    /**returns selected mesh objects,
     ignoring objects that use the same mesh
     instance (only one will get yielded in that case)
     */
    get selectedMeshObjects(): Generator<any, void, unknown>;
}
declare const ViewOverlay_base: {
    new (appstate: any): {
        [x: string]: any;
        ctx: any;
        _state: any;
        state: any;
        onRemove(have_new_file?: boolean): void;
        copy(): any;
        validate(): void;
    };
    [x: string]: any;
    contextDefine(): {
        name: string;
        flag: number;
    };
    resolveDef(): any;
};
export class ViewOverlay extends ViewOverlay_base {
    validate(): boolean;
    get activeTexture(): any;
    activeTexture_save(): any;
    activeTexture_load(ctx: any, data: any): any;
    get modalFlag(): any;
    setModalFlag(f: any): void;
    clearModalFlag(f: any): void;
    copy(): ViewOverlay;
    get view3d(): any;
    get propsbar(): any;
    get menubar(): any;
    set selectMask(arg: any);
    get selectMask(): any;
    get resbrowser(): any;
    get debugEditor(): any;
    get gl(): any;
    get nodeEditor(): any;
    get shaderEditor(): any;
    get nodeViewer(): any;
    get editors(): import("../editors/editor_base.js").EditorAccessor;
    editors_save(): {};
    editors_load(ctx: any, data: any): any;
    get area(): any;
    get editor(): any;
    get screen(): any;
}
export class ToolContext extends Context {
    _state: any;
    play(): void;
    stop(): void;
    saveProperty_intern(val: any, owning_key: any): any;
    loadProperty_intern(ctx: any, data: any): any;
}
export class ViewContext extends ToolContext {
}
import { Context } from "./context_base.js";
export {};