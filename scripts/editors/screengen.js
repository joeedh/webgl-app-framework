import {MenuBarEditor} from "./menu/MainMenu.js";
import {SideBarEditor} from "./sidebar/SideBarEditor.js";
import {PropsEditor} from "./properties/PropsEditor.js";
import {View3D} from "./view3d/view3d.js";

export function genResBrowserScreen(appstate, ResourceBrowser) {
  let screen = document.createElement("webgl-app-x");

  let oldscreen = appstate.screen;

  screen.ctx = appstate.ctx;
  screen.size[0] = oldscreen.size[0];
  screen.size[1] = oldscreen.size[1];

  let sarea = document.createElement("screenarea-x");

  sarea.ctx = appstate.ctx;
  sarea.floating = false;

  sarea.pos[0] = 0.0;
  sarea.pos[1] = 0.0;

  sarea.size[0] = oldscreen.size[0];
  sarea.size[1] = oldscreen.size[1];

  sarea.switch_editor(ResourceBrowser);
  screen.appendChild(sarea);

  return screen;
}

export function genDefaultScreen(appstate) {
  let screen = _appstate.screen;

  screen.clear();
  screen.ctx = appstate.ctx;

  let sarea = document.createElement("screenarea-x");

  sarea.ctx = appstate.ctx;
  sarea.floating = false;

  sarea.pos[0] = sarea.pos[1] = 0.0;
  sarea.size[0] = appstate.screen.size[0];
  sarea.size[1] = appstate.screen.size[1];

  sarea.switch_editor(View3D);

  screen.appendChild(sarea);
  
  let t = 35 / sarea.size[1];
  //let smenu = document.createElement("screenarea-x");
  //*
  let smenu = sarea;

  sarea = screen.splitArea(sarea, t, true);
  
  smenu.switch_editor(MenuBarEditor);
  smenu.floating = false;
  //*/

  let sidebar = document.createElement("screenarea-x");
  sidebar.pos[0] = 0.0;
  sidebar.pos[1] = sarea.pos[1] + 50;
  sidebar.size[0] = 350;
  sidebar.size[1] = sarea.size[1] - 50;
  sidebar.ctx = _appstate.ctx;
  sidebar.switch_editor(SideBarEditor);

  screen.appendChild(sidebar);


  let props = document.createElement("screenarea-x");
  props.size[0] = 5;
  props.size[1] = screen.size[1];
  props.pos[0] = screen.size[0] - props.size[0];
  props.pos[1] = 0;
  props.ctx = _appstate.ctx;
  props.switch_editor(PropsEditor);

  screen.appendChild(props);

  screen.listen();
}
  
window._genDefaultScreen = genDefaultScreen;
