import {MenuBarEditor} from "./menu/MainMenu.js";
import {PropsEditor} from "./properties/PropsEditor.js";
import {View3D} from "./view3d/view3d.js";

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

  let sprop = document.createElement("screenarea-x");
  sprop.floating = true;
  sprop.pos[0] = 0.0;
  sprop.pos[1] = sarea.pos[1];
  sprop.size[0] = 350;
  sprop.size[1] = sarea.size[1];
  sprop.ctx = _appstate.ctx;
  sprop.switch_editor(PropsEditor);

  screen.appendChild(sprop);

  screen.listen();
}
  
window._genDefaultScreen = genDefaultScreen;
