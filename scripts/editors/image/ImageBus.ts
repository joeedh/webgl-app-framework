// forward bus to avoid circular imports
export class ImageBus {
  static busDefine() {
    return {
      events  : [],
      triggers: ['resetDrawLines', 'flagRedraw', 'addDrawLine'],
    } as const
  }
}
