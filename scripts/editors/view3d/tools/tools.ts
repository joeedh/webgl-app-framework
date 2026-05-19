// ObjectEditor and PanToolMode stay in core (always-present, not addons).
import './selecttool'
import './view3d_panmode'

// The remaining toolmodes are addons. addon_register.ts side-effect-imports
// each one (registering it with ToolMode.register at import time) and then
// announces them to AddonManager so they show up in the addon system. See
// plan §6 step 8.
import './addon_register'

// sculptcore_ops still needs to be imported for ToolOp side-effect registrations
// — those are addon-owned but the operator classes aren't currently routed
// through the addon system. Lands properly when sculptcore actually moves to
// out-of-bundle build.
import './sculptcore_ops'

export {ToolModes} from '../view3d_toolmode.js'
