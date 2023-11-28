export class RenderEngine {
    static register(cls: any): void;
    update(gl: any, view3d: any): void;
    resetRender(): void;
    render(camera: any, gl: any, viewbox_pos: any, viewbox_size: any, scene: any): void;
    destroy(gl: any): void;
}
export namespace RenderEngine {
    let engines: any[];
}
