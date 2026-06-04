// Inversion bridge: registers the builtin-addon classes that feed the core data
// API into the dependency-free registry leaf, so core `api_define.ts` never
// imports `addons/builtin/*`.
//
// `getDataAPI()` runs in the AppState constructor before any addon `register(api)`
// hook, and `tools/gen-datapaths.mjs` doesn't boot addons at all — so these can't
// wait for the per-addon lifecycle. The side-effect import (from entry_point.js and
// the gen-datapaths shim) populates the registry at module load; `registerDataAPI`
// is idempotent. External addons instead register via `addon_base.ts`'s dispatcher.
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
