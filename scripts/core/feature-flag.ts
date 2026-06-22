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
    const flags = this.flags.map((f) => ({...f}))

    const existing = getAppStorage().getText(this.LSKEY)
    if (existing === undefined) {
      getAppStorage().setText(this.LSKEY, JSON.stringify(flags, undefined, 2))
      return
    }

    const existingFlags = JSON.parse(existing) as StoredFeatureFlag[]

    for (const flag of existingFlags) {
      const f = flags.find((f) => f.key === flag.key)
      if (f && f.mtime < flag.mtime) {
        f.value = flag.value
        f.mtime = flag.mtime
      } else {
        flags.push(flag)
      }
    }

    this.flags = flags
    getAppStorage().setText(this.LSKEY, JSON.stringify(flags, undefined, 2))
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
