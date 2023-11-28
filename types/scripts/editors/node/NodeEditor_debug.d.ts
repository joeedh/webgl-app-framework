export function getNodeViewer(screen: any): any;
export function showDebugNodePanel(screen: any): void;
export function hideDebugNodePanel(screen: any): void;
export function toggleDebugNodePanel(screen: any): void;
export class NodeViewer extends Editor {
    static define(): {
        apiname: string;
        tagname: string;
        areaname: string;
        uiname: string;
        icon: number;
    };
    graphPath: string;
    graphClass: string;
    _last_graph_path: string;
    velpan: VelPan;
    _last_scale: Vector2;
    canvases: {};
    nodes: {};
    node_idmap: {};
    sockSize: number;
    extraNodeWidth: number;
    canvas: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    getGraph(): any;
    getCanvas(id: any): any;
    hashNode(node: any): string;
    _on_velpan_change(): void;
    clear(): void;
    buildNode(node: any): {
        pos: Vector2;
        size: Vector2;
        inputs: {};
        outputs: {};
    };
    updateCanvaSize(): void;
    rebuild(): void;
    on_resize(): void;
}
export namespace NodeViewer {
    let STRUCT: string;
}
import { Editor } from "../editor_base.js";
import { VelPan } from "../velpan.js";
import { Vector2 } from "../../path.ux/scripts/pathux.js";
