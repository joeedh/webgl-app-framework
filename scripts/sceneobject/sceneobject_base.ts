import {DataBlock, DataRef} from '../core/lib_api';
import {Vector3, Matrix4, nstructjs} from '../path.ux/scripts/pathux.js';

import {StandardTools} from './stdtools.js';
import {INodeDef, Node, NodeFlags} from "../core/graph";
import {DependSocket, Matrix4Socket} from "../core/graphsockets";
import {Material} from "../core/material";
import {ToolContext} from "../../types/scripts/core/context";

export const ObjectDataTypes = [];

export interface IDataDefine {
  name: string,
  selectMask?: number,
  tools: any
}

export class SceneObjectData<InputSet = {}, OutputSet = {}> extends DataBlock<
  InputSet & { depend: DependSocket },
  OutputSet & { depend: DependSocket }
> {
  material?: Material = undefined;
  materials: Array<Material | undefined> = [];
  usesMaterial = false;

  constructor() {
    super();
  }

  applyMatrix(matrix = new Matrix4()) {
    console.error("applyMatrix: Implement me!");
    return this;
  }

  static dataDefine(): IDataDefine {
    return {
      name: "",
      selectMask: 0, //valid selection modes for StandardTools, see SelMask
      tools: StandardTools,
    }
  }

  static nodedef(): INodeDef {
    return {
      name: "",
      inputs: Node.inherit({
        depend: new DependSocket(),
      }),
      outputs: Node.inherit({
        depend: new DependSocket(),
      }),
      flag: Node.inherit(NodeFlags.SAVE_PROXY)
    }
  }

  static STRUCT = nstructjs.inlineRegister(this, `
SceneObjectData {
  materials : array(e, DataRef) | DataRef.fromBlock(e); 
}`);

  exec(ctx: ToolContext) {
    this.outputs.depend.graphUpdate();
  }

  static getTools() {
    let def = this.dataDefine();

    if (def.tools)
      return def.tools;

    return StandardTools;
  }

  getOwningObject() {
    for (let sock of this.inputs.depend.edges) {
      if (sock.node.constructor.name === "SceneObject" && (sock.node as unknown as any).data === this) {
        return sock.node;
      }
    }

    console.warn("orphaned sceneobjectdata?");
  }

  copyAddUsers() {
    return this.copy();
  }

  getBoundingBox() {
    let d = 5;

    console.warn("getBoundingBox: implement me!");

    return [
      new Vector3([d, d, d]),
      new Vector3([d, d, d])
    ]
  }

  /**draws IDs.  no need for packing,
   they're drawn into a float framebuffer

   red should be sceneobject id + 1.
   green should be any sub-id (also + 1) provided by
   sceneobjectdata, e.g. vertices in a mesh.
   */
  drawIds(view3d, gl, selectMask, uniforms, object) {

  }

  draw(view3d, gl, uniforms, program, object) {
    throw new Error("implement me");
  }

  drawWireframe(view3d, gl, uniforms, program, object) {

  }

  drawOutline(view3d, gl, uniforms, program, object) {
    this.drawWireframe(view3d, gl, uniforms, program, object);
  }

  onContextLost(e) {

  }

  dataLink(getblock, getblock_addUser) {
    super.dataLink(getblock, getblock_addUser);

    let mats = [];

    //non-datablock materials are allowed

    for (let i = 0; i < this.materials.length; i++) {
      let mat = getblock_addUser(this.materials[i], this);
      if (mat) {
        mats.push(mat);
      }
    }

    this.materials = mats;
  }

  static unregister(cls) {
    ObjectDataTypes.remove(cls);
  }

  static register(cls) {
    if (!cls.hasOwnProperty("dataDefine")) {
      throw new Error("missing .dataDefine static method");
    }

    let def = cls.dataDefine();

    if (!def.hasOwnProperty("selectMask")) {
      throw new Error("dataDefine() is missing selectMask field")
    }

    ObjectDataTypes.push(cls);
  }
}
