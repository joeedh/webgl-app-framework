import cconst2 from "./path.ux/scripts/config/const.js";
import config from './config/config.js';
import {IconManager, setBaseUnit, setIconManager, setIconMap, setMetric, UIBase} from './path.ux/scripts/pathux.js';
import {Icons} from './editors/icon_enum.js';
import {resolvePath} from './config.js';

export var iconmanager;

export function setupIconsRastered() {
  iconmanager = new IconManager([
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
}

export function setupIconsSvg() {
  let iconsheet = document.createElement("img");
  iconsheet.src = resolvePath("assets/iconsheet.svg");

  iconmanager = new IconManager([iconsheet, iconsheet, iconsheet, iconsheet],
  [[32, 16], [32, 24], [32, 40], [32, 32]], 16);

  setIconManager(iconmanager, {
    SMALL : 0,
    LARGE : 1,
    XLARGE : 2
  });

  window.updateIconDPI = () => {
    //do nothing.
  };
}

export function setupPathux() {
  config.pathuxConfig.DEBUG = config.DEBUG || {};
  cconst2.loadConstants(config.pathuxConfig);
  window.DEBUG = cconst2.DEBUG;

  setBaseUnit("meter");
  setMetric(true);

  if (config.svgIcons) {
    setupIconsSvg();
  } else {
    setupIconsRastered();
  }
}