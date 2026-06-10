import {LocalStorage} from '../mathl/index'
import {DataAPI, DataStruct, ToolProperty} from '../path.ux/scripts/pathux'

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

export class FeatureFlagManager {
  flags: StoredFeatureFlag[] = []
  localStorage = LocalStorage.mathlLocalStorage
  private LSKEY = 'feature-flags-app'

  constructor() {
    this.load()
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
    const json = this.localStorage.getItem(this.LSKEY) as string | undefined
    this.flags = json ? (JSON.parse(json) as StoredFeatureFlag[]) : this.flags
  }

  private merge() {
    const flags = this.flags.map((f) => ({...f}))

    if (!this.localStorage.has(this.LSKEY)) {
      this.localStorage.setItem(this.LSKEY, JSON.stringify(flags, undefined, 2))
      return
    }

    const existing = this.localStorage.getItem(this.LSKEY) as string
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
    this.localStorage.setItem(this.LSKEY, JSON.stringify(flags, undefined, 2))
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
export const featureFlagManager = new FeatureFlagManager()

// each entry must satisfy FeatureFlag
export const featureFlags = [
  {
    key        : 'sculptcore.quad_remesher',
    description: 'Enable quad remesher',
    type       : 'bool',
    value      : false,
  },
] as const

/** exists to typecheck featureFlags above. */
const typecheckFeatureFlags = featureFlags as Readonly<Readonly<FeatureFlag>[]>

type FeatureFlagKeys = (typeof featureFlags)[number]['key']
