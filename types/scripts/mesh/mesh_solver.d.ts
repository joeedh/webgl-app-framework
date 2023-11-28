export const FloatArrayClass: Float64ArrayConstructor;
export namespace DerivFlags {
    let FIRST: number;
    let SECOND: number;
    let DEFAULT: number;
}
export class SolverSettings extends LayerSettingsBase {
    speed: number;
}
export namespace SolverSettings {
    let STRUCT: string;
}
export class SolverElem extends CustomDataElem<any> {
    static apiDefine(api: any): void;
    static define(): {
        typeName: string;
        uiTypeName: string;
        defaultName: string;
        valueSize: any;
        flag: number;
        settingsClass: typeof SolverSettings;
    };
    constructor();
    oldco: Vector3;
    oldvel: Vector3;
    vel: Vector3;
    force: Vector3;
    scratch: Vector4;
    mass: number;
    clear(): this;
    copyTo(b: any): void;
}
export namespace SolverElem {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class Constraint {
    constructor(klst: any, params: any, wlst: any, vel_lst: any, force_lst: any, scratch_lst: any);
    bad: boolean;
    slst: any;
    flst: any;
    vlst: any;
    wlst: any;
    glst2: Float64Array[];
    glst3: Float64Array[];
    glst: Float64Array[];
    hlst: Float64Array[];
    klst: any[];
    klst2: Float64Array[];
    klst3: Float64Array[];
    params: any;
    df: number;
    set(klst: any, wlst?: any, params?: any): this;
    evaluate(deriveFlag?: number): void;
    applyMass(): void;
}
export class DiffConstraint extends Constraint {
    constructor(func: any, klst: any, params: any, wlst: any, vlst: any, flst: any, slst: any);
    func: any;
    evaluate(derivFlag?: number): any;
}
export class VelConstraint extends Constraint {
    constructor(func: any, velfunc: any, accfunc: any, klst: any, params: any, wlst: any, vlst: any, flst: any, slst: any);
    func: any;
    velfunc: any;
    accfunc: any;
    evaluate(derivFlag?: number): any;
}
export class Solver {
    gk: number;
    cons: any[];
    implicitSteps: number;
    mesh: any;
    cd_slv: number;
    last_print_time: number;
    last_print_time_2: number;
    clientData: any;
    start(mesh: any): void;
    finish(): void;
    add(con: any): void;
    remove(con: any): void;
    solve_intern(gk?: number): number;
    solve(steps?: number, gk?: number): number;
    [Symbol.iterator](): IterableIterator<any>;
}
import { LayerSettingsBase } from './customdata.js';
import { CustomDataElem } from './customdata.js';
import { Vector3 } from '../util/vectormath.js';
import { Vector4 } from '../util/vectormath.js';
