import {DataAPI, DataStruct, ToolProperty} from '../path.ux/scripts/pathux'
import {default as messageBus, IBusEmitterClass, IBusEmitter, BusTriggers} from './bus'
import {getAppStorage} from './app_storage'

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

  static defineAPI(api: DataAPI, st?: DataStruct) {
    st = st ?? api.mapStruct(FeatureFlagManager, true)

    const createKey = (flag: (typeof featureFlags)[number]) => {
      st.bool(flag.key, flag.key, flag.description, flag.description).customGetSet<FeatureFlagManager>(
        function () {
          return this.dataref.get(flag.key)
        },
        function (value: boolean) {
          this.dataref.set(flag.key, value)
        }
      )
    }
    for (const flag of featureFlags) {
      createKey(flag)
    }
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
] as const

/** exists to typecheck featureFlags above. */
const typecheckFeatureFlags = featureFlags as Readonly<Readonly<FeatureFlag>[]>

type FeatureFlagKeys = (typeof featureFlags)[number]['key']

export const FeatureFlags = new FeatureFlagManager()
