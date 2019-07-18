import * as appstate from './core/appstate.js';

import {Icons} from './editors/icon_enum.js';
import {setIconMap} from './path.ux/scripts/ui_base.js';
setIconMap(Icons);

window.init = () => {
  console.log("init!");
  appstate.init();
}
