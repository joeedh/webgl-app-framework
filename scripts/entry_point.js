import './typescript_entry.js'
import './camera/camera.js'

import * as appstate from './core/appstate.js';
import {loadShapes} from './core/simplemesh_shapes.js';

import './test/test_base.js';
import './test/test_sculpt.js';
import './test/test.js';
import './test/test_sculpt_run.js';

import * as mesh from './mesh/mesh.js';
import * as mesh_types from './mesh/mesh_types.js';
import * as customdata from './mesh/customdata';
import * as mesh_customdata from './mesh/mesh_customdata.js';
import * as mesh_base from './mesh/mesh_base.js';

export {mesh, mesh_types, customdata, mesh_customdata, mesh_base};

import addon, {startAddons} from './addon/addon.js';

import config from './config/config.js';
import {setupPathux} from './setup_pathux.js';
import {nstructjs} from './path.ux/pathux.js';

export function handleNodeArguments() {
  console.error("arguments", process, process.arguments, process.argv);

  //XXX stupid electron

  let fs = require('fs');
  console.error(fs.existsSync('arguments.txt'));

  if (!fs.existsSync('arguments.txt')) {
    return;
  }

  let buf = fs.readFileSync("arguments.txt", "utf8");
  buf = buf.replace(/[ \t]+/g, ' ').trim();

  let args = buf.split(" ");
  _appstate.arguments = args;
  console.log(args);

  addon.handleArgv(args);
}

export function init() {
  console.log("init!");

  //give addons 500 ms to load
  let timeout = config.addonLoadWaitTime;
  if (timeout === undefined) {
    timeout = 500;
  }

  setupPathux();
  nstructjs.validateStructs();

  appstate.preinit();

  console.log("Loading addons");
  startAddons(false);

  window.setTimeout(() => {
    loadShapes();

    appstate.init();
    window.setTimeout(() => {
      window._print_evt_debug = true;
    }, 750);

    if (window.haveElectron) {
      window.setTimeout(() => {
        handleNodeArguments();
      }, 0);
    }

    //shortcut for console use only
    if (typeof CTX === "undefined") {
      Object.defineProperty(window, "CTX", {
        get: () => {
          return _appstate.ctx;
        }
      })
    }
  }, timeout);
};
