// Side-effect: assigns globalThis._framework so externalized addon bundles
// (which see `@framework/api` as a stub looking up globalThis._framework.api)
// resolve to the main bundle's namespace. Must run before any addon's
// addon_register side effects below.
import './_framework_runtime.js'

import './typescript_entry.js'
import './camera/camera.js'

import * as appstate from './core/appstate.js'
import {loadShapes} from './webgl/simplemesh_shapes.js'

import './test/test_base.js'
import './test/test_sculpt.js'
import './test/test.js'
import './test/test_sculpt_run.js'

import * as mesh from '../addons/builtin/mesh/src/mesh.js'
import * as mesh_types from '../addons/builtin/mesh/src/mesh_types.js'
import * as customdata from '../addons/builtin/mesh/src/customdata'
import * as mesh_customdata from '../addons/builtin/mesh/src/mesh_customdata.js'
import * as mesh_base from '../addons/builtin/mesh/src/mesh_base.js'

// Registers the default-scene-with-cube builder against core/default_file. Once
// mesh moves into a builtin addon (plan §6 step 6) this side-effect import goes
// away and the addon's register() hook performs the registration.
import '../addons/builtin/mesh/src/default_scene.js'

// Announces the mesh subsystem to AddonManager as an internal builtin addon so
// other addons can declare `dependencies: ['mesh']`. See plan §6 step 6.
import '../addons/builtin/mesh/src/addon_register.js'

// Same pattern for subsurf (depends on mesh). See plan §6 step 7.
import '../addons/builtin/subsurf/src/addon_register.js'

// Same pattern for mesh_edit toolmode (depends on mesh). See plan §6 step 8.
import '../addons/builtin/mesh_edit/src/addon_register.js'

// Same pattern for curve toolmode (depends on mesh + mesh_edit). See plan §6 step 8.
import '../addons/builtin/curve/src/addon_register.js'

// Same pattern for tetmesh toolmode (depends on mesh). See plan §6 step 8.
import '../addons/builtin/tetmesh/src/addon_register.js'

// Registers mesh-grid file-version migrations against core/file_migrations.
// Once mesh moves out of the main bundle this side-effect import disappears.
import '../addons/builtin/mesh/src/migrations.js'

// Mesh-specific Open-dialog wrapper around ImportOBJOp. Was previously in
// core/app_ops.js, moved here to keep core from importing mesh. See plan §3.
import '../addons/builtin/mesh/src/import_obj_op.js'

// View3D toolmode registrations. Was previously in core/appstate.ts; moved
// here so core stops importing from editors/view3d/tools. See plan §3 / §12.
import './editors/view3d/tools/tools.js'

// FBX loader (relocated with the mesh subsystem into addons/builtin/mesh/).
// Side-effect import — registers the FBX loader against the global so other
// callers can use it.
import '../addons/builtin/mesh/src/fbxloader.js'

export {mesh, mesh_types, customdata, mesh_customdata, mesh_base}

import addon, {startAddons} from './addon/addon.js'

import config from './config/config.js'
import {setupPathux} from './setup_pathux.js'
import {nstructjs} from './path.ux/pathux.js'
import * as sculptcore from '@sculptcore/api/api'

await sculptcore.loadWasm()

export function handleNodeArguments() {
  console.error('arguments', process, process.arguments, process.argv)

  //XXX stupid electron

  let fs = require('fs')
  console.error(fs.existsSync('arguments.txt'))

  if (!fs.existsSync('arguments.txt')) {
    return
  }

  let buf = fs.readFileSync('arguments.txt', 'utf8')
  buf = buf.replace(/[ \t]+/g, ' ').trim()

  let args = buf.split(' ')
  _appstate.arguments = args
  console.log(args)

  addon.handleArgv(args)
}

export async function init() {
  console.log('init!')

  await sculptcore.getWasm()

  //give addons 500 ms to load
  let timeout = config.addonLoadWaitTime
  if (timeout === undefined) {
    timeout = 500
  }

  setupPathux()
  nstructjs.setWarningMode(0)
  nstructjs.validateStructs()

  appstate.preinit()

  console.log('Loading addons')
  startAddons(false)

  window.setTimeout(() => {
    loadShapes()

    appstate.init()
    window.setTimeout(() => {
      window._print_evt_debug = true
    }, 100)

    if (window.haveElectron) {
      window.setTimeout(() => {
        handleNodeArguments()
      }, 0)
    }

    //shortcut for console use only
    if (typeof CTX === 'undefined') {
      Object.defineProperty(window, 'CTX', {
        get: () => {
          return _appstate.ctx
        },
      })
    }
  }, timeout)
}
