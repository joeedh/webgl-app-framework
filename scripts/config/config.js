let exports = {
  pathuxConfig: {
    addHelpPickers: true,

    useAreaTabSwitcher: false,
    autoSizeUpdate: true,
    showPathsInToolTips: true,
    colorSchemeType: "light",
    useNumSliderTextboxes: true,

    menu_close_time: 500,
    doubleClickTime: 500,

    //timeout for press-and-hold (touch) version of double clicking
    doubleClickHoldTime: 750
  },

  cacheSelectBufs: true
}

//load config_local.js if it exists
let script = document.createElement("script");
script.setAttribute("type", "module");
script.innerText = `
  import * as configlocal from './scripts/config/config_local.js';
  import {cconst} from './scripts/path.ux/scripts/pathux.js';
  import config from './scripts/config/config.js';
  
  let local = configlocal.default;
  
  if (local.pathuxConfig) {
    let a = local.pathuxConfig;
    let b = config.pathuxConfig;
    
    for (let k in a) {
      b[k] = a[k];
    }
    
    cconst.loadConstants(config.pathuxConfig);
  }
  
  for (let k in local) {
    if (k === "pathuxConfig") {
      continue;
    }
    
    config[k] = local[k];
  }
  
`;

document.body.appendChild(script);
window._config = exports;

//import './config_local.js';

export default exports;
