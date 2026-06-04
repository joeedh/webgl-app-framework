/**
 * Standalone registry of the classes that participate in the data API.
 *
 * This module is intentionally **dependency-free** (only type-only imports from
 * path.ux). Each participating core class registers itself at module scope with
 * `registerDataAPI(cls)`, importing only this leaf — never `api_define.ts`.
 *
 * Why a separate file: `api_define.ts` imports every one of those class modules,
 * so if it also *owned* `registerDataAPI`/`dataAPIRegistry`, a class doing
 * `import {registerDataAPI} from './api_define.js'` would form a cycle
 * (`class → api_define → class`). The class module evaluates first and would
 * touch `dataAPIRegistry` (a module-scoped `const`) inside its temporal dead
 * zone → a runtime crash. Keeping the registry in this leaf — which has no app
 * imports — means its array is fully initialized before any class module runs,
 * so registration order is irrelevant and no cycle exists.
 *
 * `getDataAPI()` (in `api_define.ts`) reads the populated list.
 */
import type {DataAPI, DataStruct} from '../path.ux/scripts/pathux.js'

/**
 * The canonical data-API definition contract (see
 * documentation/plans/api-define-defineapi-refactor.md). A participating class
 * exposes a static `defineAPI(api, struct?)` that declares its `DataStruct` and
 * returns it. `struct` defaults to `api.mapStruct(this)`; subclasses pass it
 * through `super.defineAPI(api, struct)` to chain base properties.
 */
export type DefineAPIClass = (abstract new (...args: any[]) => any) & {
  defineAPI(api: DataAPI, struct?: DataStruct): DataStruct
}

const dataAPIRegistry: DefineAPIClass[] = []

/**
 * Register a class so its `defineAPI` is invoked while the data API is built.
 * Idempotent. Core classes call this at module scope from their own source file
 * (importing only this leaf). Addon classes must NOT — they route through the
 * addon `register(api)` hook (see documentation/addons.md) so they can be torn
 * down cleanly; the few that are still hard-registered live in
 * `registerAddonDataAPIClasses()` in `api_define.ts`.
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
