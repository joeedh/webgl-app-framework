export function api_define_graphclasses(api: any): void;
export let GraphTypes: any[];
export let GraphMap: {};
export class AbstractGraphClass {
    static graphdef(): {
        typeName: string;
        uiName: string;
        graph_flag: number;
    };
    static buildAPI(api: any): void;
    /** register an abstract graph class, don't subclass this*/
    static registerClass(cls: any): void;
    static getGraphClass(name: any): any;
    static create(cls_name: any): any;
    /** add a node class to this type */
    static register(cls: any): void;
}
export namespace AbstractGraphClass {
    let NodeTypes: any[];
}
