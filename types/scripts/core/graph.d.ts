export function test(exec_cycles?: boolean): void;
export class GraphCycleError extends Error {
}
export namespace SocketTypes {
    let INPUT: number;
    let OUTPUT: number;
}
export namespace SocketFlags {
    let SELECT: number;
    let UPDATE: number;
    let MULTI: number;
    let NO_MULTI_OUTPUTS: number;
    let PRIVATE: number;
    let NO_UNITS: number;
    let INSTANCE_API_DEFINE: number;
    let NO_UI_EDITING: number;
}
export namespace NodeFlags {
    let SELECT_1: number;
    export { SELECT_1 as SELECT };
    let UPDATE_1: number;
    export { UPDATE_1 as UPDATE };
    export let SORT_TAG: number;
    export let CYCLE_TAG: number;
    export let DISABLED: number;
    export let ZOMBIE: number;
    export let SAVE_PROXY: number;
    export let FORCE_SOCKET_INHERIT: number;
    export let FORCE_FLAG_INHERIT: number;
    export let FORCE_INHERIT: number;
}
export namespace GraphFlags {
    let SELECT_2: number;
    export { SELECT_2 as SELECT };
    export let RESORT: number;
    export let CYCLIC_ALLOWED: number;
    export let CYCLIC: number;
}
export let NodeSocketClasses: any[];
export class NodeSocketType {
    static apiDefine(api: any, sockstruct: any): void;
    static register(cls: any): void;
    /**
     Callback for defining socket types.
     Child classes must implement this.
  
     @example
     static nodedef() { return {
        name   : "name",
        uiname : "uiname",
        color  : [0.5, 0.5, 0.5, 1.0],
        flag   : 0 //see SocketFlags
     }}
  
     */
    static nodedef(): {
        name: string;
        uiname: string;
        color: any;
        flag: number;
    };
    constructor(uiname?: any, flag?: number);
    uiname: any;
    name: any;
    socketName: any;
    socketType: any;
    edges: any[];
    node: any;
    graph_flag: number;
    graph_id: number;
    get hasEdges(): boolean;
    graphDestory(): void;
    graphDataLink(ownerBlock: any, getblock: any, getblock_addUser: any): void;
    onFileLoad(templateInstance: any): void;
    needInstanceAPI(): this;
    noUnits(): this;
    setAndUpdate(val: any, updateParentNode?: boolean): this;
    has(node_or_socket: any): boolean;
    /**
     Build ui for a node socket.
  
     Note that container has a data path prefix applied to it,
     so anything in container.prop that takes a datapath (e.g. container.prop)
  
     will have its path evaluated *relative to the node itself*,
     NOT Context as usual.
     */
    buildUI(container: any, onchange: any): void;
    copyValue(): void;
    cmpValue(b: any): void;
    diffValue(b: any): void;
    connect(sock: any): this;
    disconnect(sock: any): this;
    getValue(): void;
    setValue(val: any): void;
    copyTo(b: any): this;
    immediateUpdate(): void;
    update(): this;
    graphUpdate(updateParentNode?: boolean, _exclude?: any): this;
    copy(): any;
    loadSTRUCT(reader: any): void;
}
export namespace NodeSocketType {
    let STRUCT: string;
}
export class KeyValPair {
    constructor(key: any, val: any);
    key: any;
    val: any;
}
export namespace KeyValPair {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
/**
 Base class for all nodes
 It's required to implement the nodedef() static
 method in child classes.
 */
export class Node {
    static STRUCT: string;
    static graphDefineAPI(api: any, nodeStruct: any): void;
    static defineAPI(api: any, nodeStruct: any): void;
    /** get final node def with inheritance applied to input/output sockets
     *
     * @returns {{} & {name, uiname, flag, inputs, outputs}}
     */
    static getFinalNodeDef(): {} & {
        name;
        uiname;
        flag;
        inputs;
        outputs;
    };
    /**
     Type information for node, child classes
     must subtype this.  To inherit sockets,
     wrap inputs and/or outputs in Node.inherit, see example
  
     @example
  
     static nodedef() {return {
        name   : "name",
        uiname : "uiname",
        flag   : 0,  //see NodeFlags
        inputs : Node.inherit({
          input1 : new FloatSocket()
        }), //can inherit from parent class by wrapping in Node.inherit({})
  
        outputs : {
          output1 : new FloatSocket()
        }
      }}
     */
    static nodedef(): {
        name: string;
        uiname: string;
        flag: number;
        inputs: {};
        outputs: {};
    };
    /** see nodedef static method */
    static inherit(obj?: {}): InheritFlag;
    constructor(flag?: number);
    graph_uiname: any;
    graph_name: any;
    graph_ui_pos: Vector2;
    graph_ui_size: Vector2;
    graph_ui_flag: number;
    graph_id: number;
    graph_graph: any;
    graph_flag: number;
    inputs: {};
    outputs: {};
    icon: number;
    get allsockets(): Generator<any, void, unknown>;
    graphDataLink(ownerBlock: any, getblock: any, getblock_addUser: any): void;
    copyTo(b: any): void;
    copy(addLibUsers?: boolean, libOwner?: any): any;
    /**state is provided by client code, it's the argument to Graph.prototype.exec()
     *exec should call update on output sockets itself
     *DO NOT call super() unless you want to send an update signal to all
     *output sockets
     */
    exec(state: any): void;
    update(): this;
    graphDestroy(): void;
    graphUpdate(): this;
    afterSTRUCT(): void;
    loadSTRUCT(reader: any): this;
    graphDisplayName(): string;
    _save_map(map: any): KeyValPair[];
}
export class ProxyNode extends Node {
    static fromNode(node: any): ProxyNode;
    constructor();
    className: string;
    nodedef(): {
        inputs: {};
        outputs: {};
        flag: number;
    };
}
export namespace ProxyNode {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class CallbackNode extends Node {
    static nodedef(): {
        name: string;
        inputs: {};
        outputs: {};
        flag: number;
    };
    static create(name: any, callback: any, inputs?: {}, outputs?: {}): CallbackNode;
    constructor();
    callback: any;
}
export namespace CallbackNode {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export class GraphNodes extends Array<any> {
    constructor(graph: any, list: any);
    graph: any;
    active: any;
    highlight: any;
    get selected(): {
        (): Generator<any, void, unknown>;
        editable: any;
    };
    setSelect(node: any, state: any): void;
    /**
     swap node to first element in list.
  
     a convention in shader networks is that the active "output" node is the first one found in the list.
     this way users can click different output nodes to preview different subnetworks in real time.
     */
    pushToFront(node: any): this;
    0: any;
}
export class Graph {
    /**unfortunately we can't use normal event callbacks (or the graph itself)
     to send certain updates to the UI, because the sheer number of nodes
     in normal workflows would make that slow and error-prone.
     so, like with meshes, we use a random number that changes when the ui should
     redraw things.

     That said, in theory you could make the dependency graph compile into code
     like shader graphs compile to glsl.
     */
    updateGen: number;
    onFlagResort: any;
    nodes: GraphNodes;
    sortlist: any[];
    graph_flag: number;
    max_cycle_steps: number;
    cycle_stop_threshold: number;
    graph_idgen: util.IDGen;
    node_idmap: {};
    sock_idmap: {};
    copy(addLibUsers?: boolean, libOwner?: any): any;
    destroy(): void;
    clear(): this;
    load(graph: any): this;
    /**unfortunately we can't use normal event callbacks (or the graph itself)
     to send certain updates to the UI, because the sheer number of nodes
     in normal workflows would make that slow and error-prone.
     so, like with meshes, we use a random number that changes when the ui should
     redraw things*/
    signalUI(): void;
    flagResort(): void;
    sort(): void;
    _cyclic_step(context: any): number;
    _cyclic_exec(context: any): void;
    exec(context: any, force_single_solve?: boolean): void;
    update(): void;
    graphUpdate(): void;
    remove(node: any): void;
    has(node: any): boolean;
    add(node: any): this;
    dataLink(owner: any, getblock: any, getblock_addUser: any): void;
    loadSTRUCT(reader: any): this;
    relinkProxyOwner(n: any): void;
    execSubtree(startnode: any, context: any, checkStartParents?: boolean): void;
    _save_nodes(): any[];
}
export namespace Graph {
    let STRUCT_4: string;
    export { STRUCT_4 as STRUCT };
}
import { Vector2 } from '../path.ux/scripts/pathux.js';
declare class InheritFlag {
    constructor(data: any);
    data: any;
}
import { util } from '../path.ux/scripts/pathux.js';
export {};
