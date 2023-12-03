export function getWebGL(): any;

export function initWebGL(): void;

export function loadShaders(gl: any): void;

export class ThreeCamera {
  constructor(camera: any);

  camera: any;
  camerastack: any[];
  uniform_stack: any[];
  uniforms: {};

  pushCamera(camera: any): void;

  popCamera(): void;

  set matrixWorld(arg: any);
  get matrixWorld(): any;

  set matrixWorldInverse(arg: any);
  get matrixWorldInverse(): any;

  set projectionMatrix(arg: any);
  /**
   * Okay, a bit of nomenclature difference with three.js here.
   * I like to call the final matrix the projection matrix, while
   * three.js is calling the perspective matrix the projection matrix.
   * */
  get projectionMatrix(): any;

  set projectionMatrixInverse(arg: any);
  get projectionMatrixInverse(): any;

  pushUniforms(uniforms: any): void;

  popUniforms(): {};

  set near(arg: any);
  get near(): any;

  set far(arg: any);
  get far(): any;

  get fov(): any;

  updateProjectionMatrix(): void;

  get isPerspectiveCamera(): boolean;

  clone(): ThreeCamera;
}

export class DrawQuad {
  constructor(v1: any, v2: any, v3: any, v4: any, color: any, useZ: any);

  v1: Vector3;
  v2: Vector3;
  v3: Vector3;
  v4: Vector3;
  color: Vector4;
  useZ: boolean;
}

export class DrawLine {
  constructor(v1: any, v2: any, color: number[], useZ: any);

  color: Vector4;
  useZ: boolean;
  v1: Vector3;
  v2: Vector3;
}

export class View3D extends Editor {
  static defineAPI(api: any): void;

  static define(): {
    has3D: boolean;
    tagname: string;
    areaname: string;
    uiname: string;
    icon: number;
  };

  drawHash: number;
  renderSettings: RenderSettings;
  _last_camera_hash: any;
  fps: number;
  subViewPortSize: number;
  subViewPortPos: Vector2;
  _nodes: any[];
  _pobj_map: {};
  _last_render_draw: number;
  renderEngine: RealtimeEngine;
  flag: number;
  orbitMode: number;
  localCursor3D: Matrix4;
  cursorMode: number;
  _viewvec_temps: util.cachering;
  glPos: number[];
  glSize: number[];
  T: number;
  camera: Camera;
  activeCamera: Camera;
  start_mpos: Vector2;
  last_mpos: Vector2;
  drawlines: any[];
  selectbuf: GPUSelectBuffer;
  _select_transparent: boolean;
  _last_selectmode: number;
  transformSpace: number;
  drawmode: number;
  threeCamera: ThreeCamera;

  set cameraMode(arg: number);
  get cameraMode(): number;

  get cursor3D(): any;

  set selectmode(arg: any);
  get selectmode(): any;

  get sortedObjects(): any;

  updateClipping(): void;

  get widgets(): any;

  makeGraphNodes(): void;

  _graphnode: CallbackNode;

  addGraphNode(node: any): void;

  remGraphNode(node: any): void;

  getGraphNode(): CallbackNode;

  deleteGraphNodes(): void;

  viewAxis(axis: any, sign?: number): void;

  viewSelected(ob?: any): void;

  get select_transparent(): boolean;

  getViewVec(localX: any, localY: any): any;

  project(co: any, mat?: any): any;

  unproject(co: any, mat?: any): any;

  setCursor(mat: any): void;

  rebuildHeader(): void;

  doEvent(type: any, e: any, docontrols: any): any;

  overdraw: HTMLElement;
  mdown: boolean;

  glInit(): void;

  gl: any;
  canvas: any;
  grid: SimpleMesh;

  getTransBounds(): Vector3[];

  getTransCenter(transformSpace?: number): any;

  getTransMatrix(transformSpace?: number): any;

  getLocalMouse(x: any, y: any): any[];

  _showCursor(): number;

  updateCursor(): void;

  checkCamera(): void;

  makeGrid(): SimpleMesh;

  on_resize(newsize: any): void;

  _testCamera(): void;

  getSelectBuffer(ctx: any): GPUSelectBuffer;

  onCameraChange(): void;

  drawCameraView(): void;

  viewportDraw(): void;

  resetRender(): void;

  drawRender(extraDrawCB: any): void;

  drawThreeScene(): void;

  threeRenderer: any;

  updatePointClouds(): void;

  onContextLost(e: any): void;

  viewportDraw_intern(): void;

  drawDrawLines(gl: any): void;

  makeDrawQuad(v1: any, v2: any, v3: any, v4: any, color: any, useZ?: boolean): void;

  makeDrawLine(v1: any, v2: any, color?: number[], useZ?: boolean): DrawLine;

  removeDrawLine(dl: DrawLine): void;

  removeDrawQuad(dq: DrawQuad): void;

  resetDrawLines(): void;

  drawObjects(camera?: Camera): void;

  copy(): HTMLElement;

  loadSTRUCT(reader: any): void;
}

import {Vector3} from '../../util/vectormath.js';
import {Vector4} from '../../util/vectormath.js';
import {Editor} from '../editor_base.js';
import {RenderSettings} from "../../renderengine/renderengine_realtime.js";
import {Vector2} from '../../util/vectormath.js';
import {RealtimeEngine} from "../../renderengine/renderengine_realtime.js";
import {Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {Camera} from '../../core/webgl.js';
import {GPUSelectBuffer} from './view3d_select.js';
import {CallbackNode} from "../../core/graph.js";
import {SimpleMesh} from '../../core/simplemesh.js';
