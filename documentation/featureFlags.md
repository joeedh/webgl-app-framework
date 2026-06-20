# Feature Flags

**Source:** `scripts/core/feature-flag.ts`

Feature flags are boolean knobs that control opt-in or experimental features.
They are persisted per-user through the app storage backend
(`scripts/core/app_storage.ts`) and exposed to the Data API so they can be
wired into UI panels with the standard binding system.

## Using a flag

Import the singleton and call `get`:

```ts
import {FeatureFlags} from '../core/feature-flag'

if (FeatureFlags.get('sculptcore.quad_remesher')) {
  // ...
}
```

`get` returns the stored override if one exists, otherwise the flag's default
value defined in the `featureFlags` array.

To gate a whole feature's UI, cover every surface:

- widgets/panels — wrap the `buildHeader`/`buildSettings` calls in
  `if (FeatureFlags.get(...))` (see `SculptCorePaintMode` for
  `litemesh.quad_remesh`);
- the op-search menu — override the ToolOp's `static canRun(ctx)` to return the
  flag (`searchBoxOk` consults it, and it also blocks execution).

The singleton is also exposed as the `window.FeatureFlags` debug-surface global
(see [debugSurface.md](debugSurface.md)) for CDP / `--eval` probes; `set`
persists immediately, so probes should restore the prior value.

## Setting / resetting a flag

```ts
FeatureFlags.set('sculptcore.quad_remesher', false) // override
FeatureFlags.reset('sculptcore.quad_remesher')      // back to default
```

`set` persists the change and emits a `FLAG_SET` bus event (`FeatureFlagManager`
event channel) so listeners can react at runtime.

## Reacting to changes

```ts
import messageBus from '../core/bus'
import {FeatureFlagManager} from '../core/feature-flag'

messageBus.on(FeatureFlagManager, 'FLAG_SET', ({key, value}) => {
  // ...
})
```

## Adding a flag

Append an entry to the `featureFlags` `as const` array at the bottom of
`feature-flag.ts`:

```ts
const featureFlags = [
  // ...existing entries...
  {
    key        : 'my_feature.thing',
    description: 'Human-readable description shown in UI',
    type       : 'bool',
    value      : false,   // default value
  },
] as const
```

`uiName` is optional; if omitted the key is used as the display label.

The `FeatureFlagKeys` union type is derived automatically from the array, so
`FeatureFlags.get('my_feature.thing')` will typecheck immediately after adding
the entry — no other registration is needed.

## Data API / UI binding

`FeatureFlagManager.defineAPI` registers each flag as a bool property on the
manager's `DataStruct`, and the manager is rooted in the context tree at
`settings.featureFlags` (via an `AppSettings` getter — flag storage stays
separate from AppSettings persistence). Flag keys contain dots, which datapath
member names cannot, so each property's apiname is the mangled
`featureFlagApiName(key)` (non-word characters → `_`):

```
settings.featureFlags.sculptcore_quad_remesher
```

This is set up automatically for every entry in `featureFlags` — after adding
a flag, run `pnpm gen:paths` to add its path to the generated catalog.

The Settings editor (`scripts/editors/settings/SettingsEditor.ts`) lists every
flag as a checkbox in its **Feature Flags** tab, built from
`FeatureFlags.definitions` + `featureFlagApiName`, so new flags appear there
with no editor changes. `tests/e2e/settings_editor.e2e.ts` guards the tab and
the path round-trip.

## Persistence and merge semantics

Flags are serialized as JSON under the storage key `feature-flags-app`, written
through `getAppStorage()` (`scripts/core/app_storage.ts`) — **not** raw
`localStorage` or mathl's emulated local storage. The backend is chosen at
runtime: the browser build stores the JSON in `localStorage`, while the NW.js
build writes it to a discrete `feature-flags.json` file under the `.sculptcore`
directory (`<repo>/.sculptcore` from source, `~/.sculptcore` when packaged).
The key→filename mapping lives in `FILE_NAMES` in `app_storage.ts`.

The `save()` / `merge()` path uses last-write-wins by `mtime`: if the same key
appears in both the in-memory list and the stored JSON, whichever has the higher
`mtime` wins. Unknown keys from storage are preserved (forward-compatible).
`value: undefined` in storage means "use the default" — only explicit overrides
are stored.
