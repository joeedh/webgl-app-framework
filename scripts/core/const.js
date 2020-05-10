export const APP_VERSION = 3;
export const APP_KEY_NAME = "potree_viewer";
export const FILE_EXT = "pproj";
export const FILE_MAGIC = "POTV";

export const autoSizeUpdate = true;

export const DEBUG = {
  enableDebugGraphPanel : true,
  verboseDataPath : 0, //show verbose data path debug messages
  gl  : 0,
  fbo : 0,
  doOnce : false,
  modalEvents : true,
  potreeEvents : false,

  datapaths : false,

  screenAreaPosSizeAccesses : false,

  contextSystem : 0,
  screenborders : false,
  allBordersMovable: false,

  areaConstraintSolver: true
  /*
  customWindowSize : {
    width : 512,
    height :  512
  }
  //*/
};

window.DEBUG = DEBUG;
