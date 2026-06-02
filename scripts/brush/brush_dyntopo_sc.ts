import {util} from '../path.ux/scripts/pathux.js'
import {nstructjs} from '../path.ux/pathux.js'

import {DynTopoEdgeModeSC, DynTopoSCMode, DynTopoFlagsSC, DynTopoOverridesSC} from './brush_base'

function feq(a: number, b: number) {
  return Math.abs(a - b) < 0.00001
}

// Property/flag key -> DynTopoOverridesSC enum-key (used by the tool-mode Proxy
// to decide whether a key resolves from the brush override or the tool default).
const apiKeyMap: {[k: string]: string} = {
  edgeMode     : 'EDGE_MODE',
  edgeSize     : 'EDGE_SIZE',
  collapseRatio: 'COLLAPSE_RATIO',
  grade        : 'GRADE',
  mode         : 'MODE',
  smoothLambda : 'SMOOTH_LAMBDA',
  maxSplits    : 'MAX_SPLITS',
  maxRounds    : 'MAX_ROUNDS',
}

for (const k in DynTopoOverridesSC) {
  apiKeyMap[k] = k
  apiKeyMap[`flag[${k}]`] = k
}

const _ddigest = new util.HashDigest()

/**
 * Dynamic-topology settings for the sculptcore-native sculpt path. Distinct from
 * the legacy pbvh `DynTopoSettings` (brush_dyntopo.ts): its fields map directly
 * onto the C++ `sculptcore::dyntopo::DynTopoParams`. The three edge-goal modes
 * (world / percent-of-radius / pixels) are resolved to a single `l_max` in TS via
 * {@link resolveEdgeGoal}; sculptcore stays camera-free.
 *
 * Like the legacy class it participates in the mode-default + per-brush override
 * model: a per-brush instance's `overrideMask` selects which fields come from the
 * brush vs. the tool-mode defaults (see SculptCorePaintMode's `_apiDynTopoSC`
 * Proxy). `overrideMask & NONE` means "inherit everything".
 */
export class DynTopoSettingsSC {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
  DynTopoSettingsSC {
    flag          : int;
    overrideMask  : int;
    edgeMode      : int;
    edgeSize      : float;
    collapseRatio : float;
    grade         : float;
    mode          : int;
    smoothLambda  : float;
    maxSplits     : int;
    maxRounds     : int;
  }`
  )

  flag = DynTopoFlagsSC.DO_FLIPS | DynTopoFlagsSC.DO_SMOOTH | DynTopoFlagsSC.PRESERVE_FEATURES
  overrideMask = DynTopoOverridesSC.NONE

  edgeMode = DynTopoEdgeModeSC.PERCENT
  edgeSize = 10.0 // 10% of the brush radius by default (PERCENT mode)
  collapseRatio = 0.5

  grade = 0.0
  mode = DynTopoSCMode.BOTH
  smoothLambda = 0.5
  maxSplits = 0
  maxRounds = 50

  constructor() {}

  static apiKeyToOverride(k: string): string {
    return apiKeyMap[k]
  }

  get enabled(): boolean {
    return !!(this.flag & DynTopoFlagsSC.ENABLED)
  }

  /**
   * Resolve the per-dab target edge length from the active mode. `radius` is the
   * brush radius in mesh/world units; `dist` is the world-units-per-pixel at the
   * dab point. Returns the split target `l_max` and the collapse target `l_min`.
   */
  resolveEdgeGoal(radius: number, dist: number): {l_max: number; l_min: number} {
    let l_max: number
    switch (this.edgeMode) {
      case DynTopoEdgeModeSC.WORLD:
        l_max = this.edgeSize
        break
      case DynTopoEdgeModeSC.PIXELS:
        l_max = this.edgeSize * dist
        break
      case DynTopoEdgeModeSC.PERCENT:
      default:
        l_max = (this.edgeSize / 100.0) * radius
        break
    }
    // Guard against a zero/negative target (would make every edge a split
    // candidate and never converge); fall back to a small fraction of radius.
    if (!(l_max > 0)) {
      l_max = Math.max(radius * 0.05, 1e-6)
    }
    const l_min = l_max * this.collapseRatio
    return {l_max, l_min}
  }

  calcHashKey(d = _ddigest.reset()) {
    d.add(this.flag)
    d.add(this.overrideMask)
    d.add(this.edgeMode)
    d.add(this.edgeSize)
    d.add(this.collapseRatio)
    d.add(this.grade)
    d.add(this.mode)
    d.add(this.smoothLambda)
    d.add(this.maxSplits)
    d.add(this.maxRounds)

    return d.get()
  }

  equals(b: this) {
    let r = true

    r = r && this.flag === b.flag
    r = r && this.overrideMask === b.overrideMask
    r = r && this.edgeMode === b.edgeMode
    r = r && this.mode === b.mode
    r = r && this.maxSplits === b.maxSplits
    r = r && this.maxRounds === b.maxRounds

    r = r && feq(this.edgeSize, b.edgeSize)
    r = r && feq(this.collapseRatio, b.collapseRatio)
    r = r && feq(this.grade, b.grade)
    r = r && feq(this.smoothLambda, b.smoothLambda)

    return r
  }

  loadDefaults(defaults: this): this {
    const b = defaults
    const mask = this.overrideMask
    const dyn = DynTopoOverridesSC

    if (mask & dyn.NONE) {
      this.load(b)
      return this
    }

    for (const k in DynTopoFlagsSC) {
      const f = DynTopoFlagsSC[k as keyof typeof DynTopoFlagsSC]
      if (typeof f !== 'number') {
        continue
      }
      if (!(mask & f)) {
        if (b.flag & f) {
          this.flag |= f
        } else {
          this.flag &= ~f
        }
      }
    }

    if (!(mask & dyn.EDGE_MODE)) this.edgeMode = b.edgeMode
    if (!(mask & dyn.EDGE_SIZE)) this.edgeSize = b.edgeSize
    if (!(mask & dyn.COLLAPSE_RATIO)) this.collapseRatio = b.collapseRatio
    if (!(mask & dyn.GRADE)) this.grade = b.grade
    if (!(mask & dyn.MODE)) this.mode = b.mode
    if (!(mask & dyn.SMOOTH_LAMBDA)) this.smoothLambda = b.smoothLambda
    if (!(mask & dyn.MAX_SPLITS)) this.maxSplits = b.maxSplits
    if (!(mask & dyn.MAX_ROUNDS)) this.maxRounds = b.maxRounds

    return this
  }

  load(b: this): this {
    this.flag = b.flag
    this.overrideMask = b.overrideMask
    this.edgeMode = b.edgeMode
    this.edgeSize = b.edgeSize
    this.collapseRatio = b.collapseRatio
    this.grade = b.grade
    this.mode = b.mode
    this.smoothLambda = b.smoothLambda
    this.maxSplits = b.maxSplits
    this.maxRounds = b.maxRounds

    return this
  }

  copy(): this {
    return new DynTopoSettingsSC().load(this) as unknown as this
  }
}
