// Inversion bridge: registers the builtin-addon classes that participate in the
// core data API into the dependency-free registry leaf
// (`scripts/data_api/api_define_registry.ts`).
//
// WHY THIS EXISTS — core's `scripts/data_api/api_define.ts` must not import
// `addons/builtin/*` (the addon-decoupling rule). But `getDataAPI()` runs inside
// the `AppState` constructor (via `appstate.preinit()`), *before* `startAddons`
// runs any addon `register(api)` hook, and the data-API catalog generator
// (`tools/gen-datapaths.mjs`) doesn't boot addons at all. So these classes can't
// wait for the per-addon lifecycle hook — the registry must already be populated
// when `getDataAPI` walks it.
//
// The fix is to invert the dependency: instead of core reaching *down* into the
// addons, this builtin-layer module reaches *up* into the core registry and
// registers the classes itself. It is imported for its side effects from
// `scripts/entry_point.js` (so it runs at module-load, before preinit) and from
// `tools/gen-datapaths.mjs`'s entry shim (so the catalog generator sees the same
// classes). `registerDataAPI` is idempotent, so importing it from both is safe.
//
// External (non-builtin) addons enabled after startup register their own
// data-API classes through their `register(api)` hook instead — see the
// DataBlock/SceneObjectData branch in `scripts/addon/addon_base.ts`'s
// `register(cls)` dispatcher, which both registers the class and live-defines it
// against the already-built API.
import {registerDataAPI} from '../../scripts/data_api/api_define_registry.js'

import {Mesh} from './mesh/src/mesh.js'
import {Vertex, Element} from './mesh/src/mesh_types.js'
import {BVHSettings} from './mesh/src/bvh.js'
import {CurveSpline} from './curve/src/curve.js'

registerDataAPI(BVHSettings)
registerDataAPI(Element)
registerDataAPI(Vertex)
registerDataAPI(Mesh)
registerDataAPI(CurveSpline)
