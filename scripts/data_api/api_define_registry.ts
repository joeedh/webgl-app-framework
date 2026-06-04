/**
 * Dependency-free registry of the classes that participate in the data API.
 *
 * Kept separate from `api_define.ts` to avoid a cycle: `api_define.ts` imports
 * every participating class, so were it to also own `registerDataAPI`, a class
 * importing it back (`class → api_define → class`) would touch the registry in its
 * temporal dead zone and crash. This leaf has no app imports, so its array is
 * initialized before any class module runs and registration order is irrelevant.
 */
import type {DataAPI, DataStruct} from '../path.ux/scripts/pathux.js'

/**
 * Data-API definition contract: a static `defineAPI(api, struct?)` that declares
 * and returns the class's `DataStruct`. `struct` defaults to `api.mapStruct(this)`;
 * subclasses chain base props via `super.defineAPI(api, struct)`.
 */
export type DefineAPIClass = (abstract new (...args: any[]) => any) & {
  defineAPI(api: DataAPI, struct?: DataStruct): DataStruct
}

const dataAPIRegistry: DefineAPIClass[] = []

/**
 * Register a class so its `defineAPI` runs while the data API is built. Idempotent.
 * Core classes call this at module scope; builtin-addon classes via the
 * `builtin_data_api.ts` bridge; external addons via `addon_base.ts`'s dispatcher.
 */
export function registerDataAPI(cls: DefineAPIClass): void {
  if (!dataAPIRegistry.includes(cls)) {
    dataAPIRegistry.push(cls)
  }
}

/** The classes registered via {@link registerDataAPI}, in registration order. */
export function getDataAPIRegistry(): readonly DefineAPIClass[] {
  return dataAPIRegistry
}

/**
 * Classes whose `defineAPI` has already run against the live API. Shared by
 * `getDataAPI()`'s build pass and `addon_base.ts`'s dispatcher (which live-defines a
 * late-enabled addon's classes) so nothing — e.g. `Mesh` — is ever defined twice.
 */
const _definedDataAPI = new WeakSet<DefineAPIClass>()

/** True once {@link markDataAPIDefined} has recorded `cls`. */
export function isDataAPIDefined(cls: DefineAPIClass): boolean {
  return _definedDataAPI.has(cls)
}

/** Record that `cls`'s `defineAPI` has been run against the live API. */
export function markDataAPIDefined(cls: DefineAPIClass): void {
  _definedDataAPI.add(cls)
}
