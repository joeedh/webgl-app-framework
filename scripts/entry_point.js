import * as appstate from './core/appstate.js';
import {loadShapes} from './core/simplemesh_shapes.js';

import './test/test_base.js';
import './test/test_sculpt.js';
import './test/test.js';
import './test/test_sculpt_run.js';

import addon, {startAddons} from './addon/addon.js';

import {nstructjs} from './path.ux/scripts/util/struct.js';
import {cconst} from './path.ux/scripts/pathux.js';
import config from './config/config.js';

import {setMetric, setBaseUnit} from "./path.ux/scripts/core/units.js";
import {Icons} from './editors/icon_enum.js';
import {setIconMap, setIconManager, IconManager, UIBase} from './path.ux/scripts/core/ui_base.js';

setBaseUnit("foot");
setMetric(false);

export let iconmanager = new IconManager([
  document.getElementById("iconsheet16"),
  document.getElementById("iconsheet24"),
  document.getElementById("iconsheet32"),
  document.getElementById("iconsheet40"),
  document.getElementById("iconsheet50"),
  document.getElementById("iconsheet64"),
  document.getElementById("iconsheet64"),
], [16, [24, 24], 32, [40, 32], [50, 32], [64, 32], [64, 64], [80, 64], [128, 64]], 16);

setIconMap(Icons);
let _last_dpi = undefined;

window.updateIconDPI = () => {
  let dpi = UIBase.getDPI();

  if (dpi === _last_dpi)
    return;

  _last_dpi = dpi;

  if (dpi < 1.0) {
    setIconManager(iconmanager, {
      SMALL: 0,
      LARGE: 2,
      XLARGE: 6
    });
  } else if (dpi <= 1.25) {
    setIconManager(iconmanager, {
      SMALL: 0,
      LARGE: 2,
      XLARGE: 6
    });
  } else if (dpi <= 1.5) {
    setIconManager(iconmanager, {
      SMALL: 1,
      LARGE: 3,
      XLARGE: 6
    });
  } else {
    setIconManager(iconmanager, {
      SMALL: 2,
      LARGE: 5,
      XLARGE: 6
    });
  }
};

updateIconDPI();

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

  appstate.preinit();

  console.log("Loading addons");
  startAddons(false);

  window.setTimeout(() => {
    nstructjs.validateStructs();

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
