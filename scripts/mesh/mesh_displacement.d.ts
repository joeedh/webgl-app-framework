import type {CustomDataElem} from "./customdata";
import type {Vector3} from "../path.ux";
import type {Mesh} from "./mesh";

export declare class DispLayerVert extends CustomDataElem<Vector3> {
  worldco: Vector3;
  smoothco: Vector3;
  baseco: Vector3;
}

export declare function onFileLoadDispVert(mesh: Mesh): void;

export declare function checkDispLayers(mesh: Mesh): void;

export declare function updateDispLayers(mesh: Mesh, activeLayerIndex?: number): void;

declare enum DispLayerFlags {
  ENABLED = 1,
  NEEDS_INIT = 2
}
