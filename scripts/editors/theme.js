/*
 * WARNING: AUTO-GENERATED FILE
 * 
 * Copy to scripts/editors/theme.js
 */

import {CSSFont, setTheme} from "../path.ux/scripts/core/ui_base.js";

export const theme = {
  base:  {
    AreaHeaderBG        : 'rgba(75,75,75, 1)',
    BasePackFlag        : 0,
    BoxDepressed        : 'rgba(76,74,74, 1)',
    BoxHighlight        : 'rgba(99,119,142, 1)',
    DefaultText         : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 12,
      color   : 'rgba(255,255,255, 1)'
    }),
    Disabled            : {
      'background-color' : 'rgb(72, 72, 72)',
      'background-size' : '5px 3px',
      'border-radius' : '15px',
    },
    LabelText           : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 12,
      color   : 'rgba(255,255,255, 1)'
    }),
    TitleText           : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 12,
      color   : 'rgba(250,250,250, 1)'
    }),
    'background-color'  : 'rgba(99,99,99, 1)',
    'border-color'      : 'rgba(164,164,164, 1)',
    'border-radius'     : 12,
    'focus-border-color': 'rgba(55,155,255, 1)',
    'focus-border-width': 2,
    oneAxisPadding      : 2,
    padding             : 1,
  },

  button:  {
    'background-color': 'rgba(99,99,99, 1)',
    'border-color'    : 'rgba(164,164,164, 1)',
    'border-radius'   : 7,
    'border-style'    : 'solid',
    'border-width'    : 1,
    height            : 20,
    margin            : 2,
    'margin-bottom'   : 1,
    'margin-left'     : 1,
    'margin-right'    : 1,
    'margin-top'      : 1,
    padding           : 1,
    width             : 100,
  },

  checkbox:  {
    CheckSide: 'left',
    height   : 32,
    width    : 32,
  },

  colorfield:  {
    'background-color': 'rgb(181,181,181)',
    circleSize        : 16,
    colorBoxHeight    : 24,
    fieldSize         : 400,
    height            : 256,
    hueHeight         : 32,
    width             : 256,
  },

  colorpickerbutton:  {
    height: 24,
    width : 100,
  },

  curvewidget:  {
    CanvasBG          : 'rgba(83,83,83, 1)',
    CanvasHeight      : 256,
    CanvasWidth       : 256,
    'background-color': 'rgb(181,181,181)',
  },

  dropbox:  {
    'border-width': 1,
    dropTextBG    : 'rgba(62,62,62, 1)',
    height        : 22,
    padding       : 4,
    width         : 32,
  },

  iconbutton:  {
    'background-color': 'rgba(15,15,15, 0)',
    'border-color'    : 'rgba(171,171,171, 1)',
    'border-radius'   : 8,
    'border-width'    : 1,
    drawCheck         : true,
    height            : 32,
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 1,
    width             : 32,
  },

  iconcheck:  {
    BoxDepressed      : 'rgba(76,74,74, 1)',
    BoxHighlight      : 'rgba(99,119,142, 1)',
    'background-color': 'rgba(168,168,168, 0.2385107302198223)',
    'border-color'    : 'rgba(171,171,171, 1)',
    'border-radius'   : 8,
    'border-width'    : 1,
    drawCheck         : true,
    height            : 32,
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 1,
    width             : 32,
  },

  listbox:  {
    ListActive   : 'rgba(200, 205, 215, 1.0)',
    ListHighlight: 'rgba(155, 220, 255, 0.5)',
    height       : 200,
    margin       : 1,
    padding      : 1,
    width        : 175,
  },

  menu:  {
    MenuBG         : 'rgba(60,60,60, 1)',
    MenuBorder     : '1px solid grey',
    MenuHighlight  : 'rgba(74,149,255, 0.367)',
    MenuSeparator  : `
      width : 100%;
      height : 2px;
      padding : 0px;
      margin : 0px;
      border : none;
      background-color : grey; 
    `,
    MenuSpacing    : 5,
    MenuText       : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 14,
      color   : 'rgba(214,214,214, 1)'
    }),
    'border-color' : 'grey',
    'border-radius': 5,
    'border-style' : 'solid',
    'border-width' : 1,
  },

  numslider:  {
    'background-color': 'rgba(75,75,75, 1)',
    'border-color'    : 'rgba(227,227,227, 1)',
    'border-radius'   : 7,
    'border-style'    : 'solid',
    'border-width'    : 1,
    height            : 22,
    width             : 135,
  },

  numslider_simple:  {
    SlideHeight       : 10,
    TextBoxWidth      : 45,
    'background-color': 'rgba(162,162,162, 1)',
    height            : 18,
    labelOnTop        : true,
    width             : 100,
  },

  numslider_textbox:  {
    TextBoxHeight     : 25,
    TextBoxWidth      : 55,
    'background-color': 'rgba(219,219,219, 1)',
    height            : 25,
    labelOnTop        : true,
    width             : 120,
  },

  overdraw:  {
    'background-color': 'rgba(0,0,0,0)',
    'border-width'    : 0,
    margin            : 0,
    padding           : 0,
  },

  panel:  {
    HeaderBorderRadius    : 5.829650280441558,
    HeaderRadius          : 5.829650280441558,
    TitleBackground       : 'rgba(98,98,98, 1)',
    TitleBorder           : 'rgba(104,104,104, 1)',
    TitleText             : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 14,
      color   : 'rgba(234,234,234, 1)'
    }),
    'background-color'    : 'rgba(52,52,52, 0.43137210023169426)',
    'border-color'        : 'rgba(0,0,0, 0.5598061397157866)',
    'border-radius'       : 7.243125760182565,
    'border-style'        : 'groove',
    'border-width'        : 1.141,
    'margin-bottom'       : 15.762442435166511,
    'margin-bottom-closed': 0,
    'margin-top'          : 0.2606556353343805,
    'margin-top-closed'   : 0,
    'padding-bottom'      : 1.9097964125268978,
    'padding-left'        : 0,
    'padding-right'       : 0,
    'padding-top'         : 2.7584516087430044,
  },

  popup:  {
    'background-color': 'rgba(70,70,70, 1)',
  },

  richtext:  {
    DefaultText       : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 16,
      color   : 'rgba(35, 35, 35, 1.0)'
    }),
    'background-color': 'rgb(245, 245, 245)',
  },

  screenborder:  {
    'border-inner'   : 'rgba(127,127,127, 1)',
    'border-outer'   : 'rgba(8,8,8, 1)',
    'border-width'   : 2,
    'mouse-threshold': 5,
  },

  scrollbars:  {
    border  : undefined,
    color   : undefined,
    color2  : undefined,
    contrast: undefined,
    width   : undefined,
  },

  sidebar:  {
    'background-color': 'rgba(55, 55, 55, 0.5)',
  },

  strip:  {
    'background-color': 'rgba(75,75,75, 0.6764705134373085)',
    'border-color'    : 'rgba(0,0,0, 0.31325409987877156)',
    'border-radius'   : 10,
    'border-style'    : 'solid',
    'border-width'    : 1,
    margin            : 1,
    oneAxisPadding    : 2,
    padding           : 2,
  },

  tabs:  {
    TabActive         : 'rgba(79,79,79, 1)',
    TabBarRadius      : 6,
    TabHighlight      : 'rgba(50, 50, 50, 0.2)',
    TabInactive       : 'rgba(61,61,61, 1)',
    TabStrokeStyle1   : 'rgba(0,0,0, 1)',
    TabStrokeStyle2   : 'rgba(0,0,0, 1)',
    TabText           : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 18,
      color   : 'rgba(187,187,187, 1)'
    }),
    'background-color': 'rgba(123,123,123, 0.7426724664096175)',
  },

  textbox:  {
    DefaultText       : new CSSFont({
      font    : 'sans-serif',
      weight  : 'normal',
      variant : 'normal',
      style   : 'normal',
      size    : 14,
      color   : 'rgba(231,231,231, 1)'
    }),
    'background-color': 'rgba(61,61,61, 1)',
  },

  tooltip:  {
    ToolTipText       : new CSSFont({
      font    : 'sans-serif',
      weight  : 'bold',
      variant : 'normal',
      style   : 'normal',
      size    : 12,
      color   : 'rgba(225, 225, 225, 1.0)'
    }),
    'background-color': 'rgba(55,55,55, 1)',
    'border-color'    : 'rgba(139,139,139, 1)',
    'border-radius'   : 3,
    'border-style'    : 'solid',
    'border-width'    : 1,
    padding           : 5,
  },

  treeview:  {
    itemIndent: 10,
    rowHeight : 18,
  },

  vecPopupButton:  {
    height : 18,
    padding: 3,
    width  : 100,
  },

};

setTheme(theme);
