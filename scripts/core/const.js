export const APP_VERSION = 7;
export const APP_KEY_NAME = "webgl-app-framework";
export const FILE_EXT = "wproj";
export const FILE_MAGIC = "WPRJ";

import config from '../config/config.js';

export var cacheSelectBufs = config.cacheSelectBufs;

export const EDGE_LINKED_LISTS = false;

export const DEBUG = {
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
};

window.DEBUG = DEBUG;
