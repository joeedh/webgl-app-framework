let exports = {
  addonLoadWaitTime : 500,
  svgIcons : true,
  pathuxConfig: {
    addHelpPickers: true,

    useAreaTabSwitcher: true,
    autoSizeUpdate: true,
    showPathsInToolTips: true,
    colorSchemeType: "dark",
    useNumSliderTextboxes: true,

    menu_close_time: 500,
    doubleClickTime: 500,

    //timeout for press-and-hold (touch) version of double clicking
    doubleClickHoldTime: 750
  },

  DEBUG : {
    simplemesh : false,
    enableDebugGraphPanel : true,
    verboseDataPath : 0, //show verbose data path debug messages
    gl  : 0,
    fbo : 0,
    doOnce : false,
    modalEvents : true,

    domEvents : false,
    domEventAddRemove : false,

    datapaths : false,

    screenAreaPosSizeAccesses : false,
    buttonEvents : false,

    debugUIUpdatePerf : false,

    contextSystem : 0,
    screenborders : false,
    allBordersMovable: false,

    areaConstraintSolver: false

    /*
    customWindowSize : {
      width : 512,
      height :  512
    }
    //*/
  },

  cacheSelectBufs: true
}

if (!window.__baseModulePath) {
  window.__baseModulePath = "./scripts";
}

//load config_local.js if it exists
let script = document.createElement("script");
script.setAttribute("type", "module");
script.innerText = `
  import * as configlocal from '${__baseModulePath}/config/config_local.js';
  import {cconst} from '${__baseModulePath}/path.ux/scripts/pathux.js';
  import config from '${__baseModulePath}/config/config.js';
  
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
