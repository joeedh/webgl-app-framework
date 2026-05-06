import {LiteMesh} from '../../../lite-mesh'
import {AttrRef, Vector3LayerElem} from '../../../mesh/mesh_customdata'
import {PaintOpBase} from './pbvh_base'

export class SculptPaintOp extends PaintOpBase<LiteMesh, {}, {}> {
  static tooldef() {
    return {
      toolpath: 'sculptcore.paint',
      inputs  : {},
      outputs : {},
      is_modal: true,
    }
  }

  getSampler() {
    return this.modal_ctx!.object!.data as LiteMesh
  }

  initOrigData(mesh: LiteMesh) {
    return new AttrRef<Vector3LayerElem>(-1)
  }

  getSymflag() {
    // TODO: Implement
    return 0
  }
}
ToolOp.register(SculptPaintOp)

