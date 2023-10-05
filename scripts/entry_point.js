import * as appstate from './core/appstate.js';
import {loadShapes} from './core/simplemesh_shapes.js';

import './test/test_base.js';
import './test/test_sculpt.js';
import './test/test.js';
import './test/test_sculpt_run.js';

import addon, {startAddons} from './addon/addon.js';

import config from './config/config.js';
import {setupPathux} from './setup_pathux.js';
import {nstructjs} from './path.ux/pathux.js';

if (0) {
  let _addEvt = window.addEventListener;
  let cbmap = new Map();

  window.addEventListener = function (type, cb, opt) {
    let cb2 = cb;

    if (type.startsWith("key")) {
      cb2 = function (e) {
        console.log(type, "cb", cb);
        return cb(e);
      }

      cbmap.set(cb, cb2);
    }

    return _addEvt.call(window, type, cb2, opt);
  }

  let _remEvt = window.removeEventListener;
  window.removeEventListener = function (type, cb, opt) {
    let cb2 = cbmap.get(cb);
    if (cb2) {
      cb = cb2;
    }

    return _remEvt.call(window, type, cb, opt);
  }
}

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

window.init = () => {
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
