import {PropertySlots, ToolOp, Vector2, Vector3, Vector4} from '../../path.ux/scripts/pathux.js'
import {ToolOpBase} from '../../core/toolopbase'
import {DrawLine} from './view3d'

export abstract class View3DOp<InputSet extends PropertySlots, OutputSet extends PropertySlots> extends ToolOpBase<
  InputSet,
  OutputSet
> {
  drawlines: any[]
  drawquads: any[]
  drawlines2d: any[]

  constructor() {
    super()

    this.drawlines = []
    this.drawquads = []
    this.drawlines2d = []
  }

  modalEnd(wasCancelled?: boolean) {
    this.resetDrawLines()
    return super.modalEnd(wasCancelled)
  }

  addDrawQuad(v1: Vector3, v2: Vector3, v3: Vector3, v4: Vector3, color: Vector4, useZ = true) {
    let dq = this.modal_ctx.view3d.makeDrawQuad(v1, v2, v3, v4, color, useZ)
    this.drawquads.push(dq)
    return dq
  }

  addDrawLine(v1: Vector3, v2: Vector3, color: Vector4, useZ = true) {
    let dl = this.modal_ctx.view3d.makeDrawLine(v1, v2, color as unknown as number[], useZ)
    this.drawlines.push(dl)
    return dl
  }

  addDrawLine2D(v1: Vector2, v2: Vector2, color: Vector4) {
    let overdraw: any = this.modal_ctx.view3d.overdraw as unknown as any

    let dl = overdraw.line(v1, v2, color)
    this.drawlines2d.push(dl)

    return dl
  }

  addDrawCircle2D(p: Vector2, r: number, color: Vector4, quality = 15) {
    let steps = Math.ceil((r * 2.0 * Math.PI) / quality)
    steps = Math.max(steps, 6)

    let t = -Math.PI,
      dt = (2.0 * Math.PI) / (steps - 1)
    let p1 = new Vector2()
    let p2 = new Vector2()

    for (let i = 0; i < steps; i++, t += dt) {
      p1[0] = Math.sin(t) * r + p[0]
      p1[1] = Math.cos(t) * r + p[1]

      if (i > 0) {
        this.addDrawLine2D(p2, p1, color)
      }

      p2.load(p1)
    }
  }

  resetTempGeom() {
    this.resetDrawLines()
  }

  resetDrawLines() {
    for (let dl of this.drawlines) {
      this.modal_ctx.view3d.removeDrawLine(dl)
    }

    for (let dl of this.drawlines2d) {
      dl.remove()
    }

    for (let dq of this.drawquads) {
      this.modal_ctx.view3d.removeDrawQuad(dq)
    }

    this.drawlines.length = 0
    this.drawquads.length = 0
    this.drawlines2d.length = 0
  }

  removeDrawLine(dl: any) {
    if (this.drawlines.indexOf(dl) >= 0) {
      this.modal_ctx.view3d.removeDrawLine(dl)
      this.drawlines.remove(dl)
    } else if (this.drawlines2d.indexOf(dl) >= 0) {
      this.drawlines2d.remove(dl)
      dl.remove()
    }
  }
}
