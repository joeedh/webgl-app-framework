import {DataAPI, DataStruct, ToolProperty} from '../path.ux/scripts/pathux'
import {default as messageBus, IBusEmitterClass, IBusEmitter, BusTriggers} from './bus'
import {getAppStorage} from './app_storage'
import {registerDataAPI} from '../data_api/api_define_registry'

/** Flag keys contain dots; datapath member apinames cannot. */
export function featureFlagApiName(key: string): string {
  return key.replace(/[^\w]/g, '_')
}

export interface FeatureFlag {
  key: string
  uiName?: string
  description: string
  type: 'bool' // only bool for now
  value: boolean
}

type StoredFeatureFlag = Omit<FeatureFlag, 'value'> & {
  /** undefined means use default value */
  value?: FeatureFlag['value']
  /** last modification time */
  mtime: number
}

export class FeatureFlagManager implements IBusEmitter<typeof FeatureFlagManager> {
  static busDefine() {
    return {
      events  : ['FLAG_SET'],
      triggers: [],
    } as const
  }

  flags: StoredFeatureFlag[] = []
  private LSKEY = 'feature-flags-app'

  constructor() {
    this.load()
    messageBus.addEmitter(this, FeatureFlagManager)

    for (const flag of featureFlags) {
      if (!this.has(flag.key)) {
        this.flags.push({
          ...flag,
          value: undefined,
          mtime: Date.now(),
        })
      }
    }
  }

  onTrigger(type: BusTriggers<typeof FeatureFlagManager>, data: any) {
    //
  }

  has(key: FeatureFlagKeys) {
    return this.flags.find((f) => f.key === key) !== undefined
  }

  get(key: FeatureFlagKeys) {
    return this.flags.find((f) => f.key === key)!.value ?? featureFlags.find((flag) => flag.key === key)!.value
  }

  getDef(key: FeatureFlagKeys): FeatureFlag {
    return featureFlags.find((f) => f.key === key)!
  }

  /** The canonical flag definitions (defaults), not the stored overrides. */
  get definitions(): readonly Readonly<FeatureFlag>[] {
    return typecheckFeatureFlags
  }

  set(key: FeatureFlagKeys, value: boolean) {
    const flag = this.flags.find((f) => f.key === key)!
    if (flag.value !== value) {
      flag.value = value
      flag.mtime = Date.now()
      this.save()
      messageBus.emit(this, FeatureFlagManager, 'FLAG_SET', {key, value})
    }
  }

  reset(key: keyof typeof featureFlags) {
    const flag = this.flags.find((f) => f.key === key)!
    if (flag.value !== undefined) {
      flag.value = undefined
      flag.mtime = Date.now()
      this.save()
    }
  }

  load() {
    const json = getAppStorage().getText(this.LSKEY)
    this.flags = json ? (JSON.parse(json) as StoredFeatureFlag[]) : this.flags
  }

  private merge() {
    /* Merge in-memory flags with whatever's on disk, keyed by `key` with the
     * newest mtime winning. Deduping by key is essential: the previous version
     * pushed a duplicate for every flag whose stored copy wasn't newer, so the
     * array grew on every save until JSON.stringify blew the string-length limit.
     * Building a Map also collapses any duplicates already on disk. */
    const byKey = new Map<string, StoredFeatureFlag>()
    const consider = (flag: StoredFeatureFlag) => {
      const prev = byKey.get(flag.key)
      if (!prev || prev.mtime < flag.mtime) {
        byKey.set(flag.key, {...flag})
      }
    }

    for (const f of this.flags) {
      consider(f)
    }
    const existing = getAppStorage().getText(this.LSKEY)
    if (existing !== undefined) {
      for (const f of JSON.parse(existing) as StoredFeatureFlag[]) {
        consider(f)
      }
    }

    this.flags = [...byKey.values()]
    getAppStorage().setText(this.LSKEY, JSON.stringify(this.flags, undefined, 2))
  }

  static defineAPI(api: DataAPI, st?: DataStruct): DataStruct {
    st = st ?? api.mapStruct(FeatureFlagManager, true)

    const createKey = (flag: Readonly<FeatureFlag>) => {
      const key = flag.key as FeatureFlagKeys
      /* customGetSet means the member path is never dereferenced, but path.ux
       * still parses it — so it must be the dot-free mangled name too. */
      const apiname = featureFlagApiName(flag.key)
      st!.bool(apiname, apiname, flag.uiName ?? flag.key, flag.description).customGetSet<FeatureFlagManager>(
        function () {
          return this.dataref.get(key)
        },
        function (value: boolean) {
          this.dataref.set(key, value)
        }
      )
    }
    for (const flag of typecheckFeatureFlags) {
      createKey(flag)
    }

    return st
  }

  save() {
    this.merge()
  }
}

// each entry must satisfy FeatureFlag
const featureFlags = [
  {
    key        : 'sculptcore.quad_remesher',
    description: 'Enable quad remesher',
    type       : 'bool',
    value      : true,
  },
  {
    key        : 'sculptcore.auto_defrag',
    description: 'Auto-compact mesh DRAM layout at stroke end when fragmented (dyntopo)',
    type       : 'bool',
    value      : true,
  },
  {
    key        : 'sculptcore.select_flush_prefer_op_domain',
    description: "Prefer an op's own selected domain over a derived one; when off, merge instead",
    type       : 'bool',
    value      : true,
  },
  {
    key        : 'sculptcore.gpu_brush',
    uiName     : 'GPU Brushes',
    description: 'Run eligible global brushes (kelvinlet) on the GPU when dyntopo is off',
    type       : 'bool',
    value      : true,
  },
  {
    key        : 'sculptcore.gpu_brush_grab',
    uiName     : 'GPU Grab Brush',
    description: 'Also run the grab brush on the GPU (off until soak; needs GPU Brushes on)',
    type       : 'bool',
    value      : false,
  },
  {
    key        : 'sculptcore.gpu_brush_verify',
    uiName     : 'GPU Brush Shadow-Verify',
    description: 'Run GPU-eligible dabs on both paths and diff them (CPU stays authoritative)',
    type       : 'bool',
    value      : false,
  },
  {
    key        : 'sculptcore.sculpt_layers',
    uiName     : 'Sculpt Layers',
    description: 'Sculpt-layer stack: the Layer Draw brush + the LiteMesh layer panel (experimental)',
    type       : 'bool',
    value      : false,
  },
  {
    key        : 'sculptcore.multires',
    uiName     : 'Multires Subsurf',
    description: 'Multiresolution subdivision sculpting: the LiteMesh multires panel + level ops (experimental)',
    type       : 'bool',
    value      : false,
  },
  {
    key        : 'sculptcore.vdm_sculpt',
    uiName     : 'VDM Sculpting',
    description: 'Vector-displacement sculpting: the LiteMesh VDM panel + Draw-brush texel splatting (experimental)',
    type       : 'bool',
    value      : false,
  },
] as const

/** exists to typecheck featureFlags above. */
const typecheckFeatureFlags = featureFlags as readonly Readonly<FeatureFlag>[]

type FeatureFlagKeys = (typeof featureFlags)[number]['key']

registerDataAPI(FeatureFlagManager)

export const FeatureFlags = new FeatureFlagManager()

declare global {
  interface Window {
    FeatureFlags: FeatureFlagManager
  }
}
/* Debug-surface global (documentation/debugSurface.md): lets CDP / --eval
 * probes flip flags at runtime. */
if (typeof window !== 'undefined') {
  window.FeatureFlags = FeatureFlags
}
