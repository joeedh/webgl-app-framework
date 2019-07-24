import * as appstate from './core/appstate.js';

import {Icons} from './editors/icon_enum.js';
import {setIconMap, setIconManager, IconManager, UIBase} from './path.ux/scripts/ui_base.js';

export let iconmanager = new IconManager([
  document.getElementById("iconsheet16"),
  document.getElementById("iconsheet24"),
  document.getElementById("iconsheet32"),
  document.getElementById("iconsheet40"),
  document.getElementById("iconsheet50"),
  document.getElementById("iconsheet64"),
  document.getElementById("iconsheet64"),
], [16, [24, 16], 32, [40, 32], [50, 32], [64, 32], [64, 64], [80, 64], [128, 64]], 16);

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

window.init = () => {
  console.log("init!");
  appstate.init();
}
