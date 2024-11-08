/*
 * WARNING: AUTO-GENERATED FILE
 *
 * Copy to scripts/editors/theme.js
 */

import {CSSFont, setTheme} from "../path.ux/scripts/core/ui_base.js";

export const theme = {
  NodeEditor: {
    NodeOverrides     : {
      base             : {
        width: 65,
      },
      button           : {
        width: 65,
      },
      numslider        : {
        width: 65,
      },
      numslider_simple : {
        width: 65,
      },
      numslider_textbox: {
        width: 65,
      },
      panel            : {
        width: 100,
      },
    },
    'background-color': 'rgba(72,72,72, 1)',
  },

  'NodeEditor.Node': {
    BoxHighlight      : 'rgba(203,203,203, 1)',
    'background-color': 'rgba(121,121,121, 1)',
    'border-color'    : 'rgba(203,202,202, 1)',
    'border-radius'   : 12,
    'border-style'    : 'solid',
    'border-width'    : 2,
    borderSelect      : 'rgba(255,140,63, 1)',
    margin            : 1,
    padding           : 5,
  },

  base: {
    AreaHeaderBG        : 'rgba(75,75,75, 1)',
    BasePackFlag        : 0,
    BoxDepressed        : 'rgba(52,52,52, 1)',
    BoxHighlight        : 'rgba(99,119,142, 1)',
    DefaultText         : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(255,255,255, 1)'
    }),
    Disabled            : {
      'background-color': 'rgb(72, 72, 72)',
      'background-size' : '5px 3px',
      'border-radius'   : '15px',
    },
    LabelText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(255,255,255, 1)'
    }),
    TitleText           : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(250,250,250, 1)'
    }),
    'background-color'  : 'rgba(122,122,122, 1)',
    'border-color'      : 'rgba(163,163,163, 1)',
    'border-radius'     : 12,
    'flex-grow'         : 'unset',
    'focus-border-color': 'rgba(55,155,255, 1)',
    'focus-border-width': 2,
    mobileSizeMultiplier: 1,
    oneAxisPadding      : 2,
    padding             : 1,
  },

  button: {
    DefaultText        : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgb(252,252,252)'
    }),
    'background-color' : 'rgba(93,93,93, 1)',
    'border-color'     : 'rgba(163,163,163, 1)',
    'border-radius'    : 4,
    'border-style'     : 'solid',
    'border-width'     : 1,
    disabled           : {
      DefaultText       : new CSSFont({
        font   : 'poppins',
        weight : 'bold',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgb(109,109,109)'
      }),
      'background-color': 'rgb(19,19,19)',
      'border-color'    : '#f58f8f',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    height             : 20,
    highlight          : {
      DefaultText       : new CSSFont({
        font   : undefined,
        weight : 'normal',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(99,99,99, 1)'
      }),
      'background-color': 'rgb(164,190,212)',
      'border-color'    : 'rgba(163,163,163, 1)',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    'highlight-pressed': {
      DefaultText       : new CSSFont({
        font   : 'sans-serif',
        weight : 'normal',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(255,255,255, 1)'
      }),
      'background-color': 'rgb(43,62,75)',
      'border-color'    : 'rgba(163,163,163, 1)',
      'border-radius'   : 7,
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    margin             : 2,
    'margin-bottom'    : 0,
    'margin-left'      : 1,
    'margin-right'     : 5,
    'margin-top'       : 0,
    padding            : 1,
    'padding-bottom'   : 0,
    'padding-left'     : 6,
    'padding-right'    : 6,
    'padding-top'      : 0,
    pressed            : {
      DefaultText       : new CSSFont({
        font   : 'sans-serif',
        weight : 'normal',
        variant: 'normal',
        style  : 'normal',
        size   : 12,
        color  : 'rgba(255,255,255, 1)'
      }),
      'background-color': 'rgb(31,31,31)',
      'border-color'    : 'rgba(163,163,163, 1)',
      'border-style'    : 'solid',
      'border-width'    : 1,
    },
    width              : 100,
  },

  checkbox: {
    CheckSide         : 'left',
    'background-color': 'grey',
    'border-color'    : 'black',
    'border-radius'   : 5,
    'border-style'    : 'solid',
    'border-width'    : 1,
    height            : 32,
    'margin-bottom'   : 1,
    'margin-left'     : 1,
    'margin-right'    : 1,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  colorfield: {
    'background-color': 'rgb(181,181,181)',
    circleSize        : 16,
    colorBoxHeight    : 24,
    fieldSize         : 400,
    height            : 256,
    hueHeight         : 32,
    width             : 256,
  },

  colorpickerbutton: {
    height: 24,
    width : 100,
  },

  curvewidget: {
    CanvasBG          : 'rgba(83,83,83, 1)',
    CanvasHeight      : 256,
    CanvasWidth       : 256,
    'background-color': 'rgb(181,181,181)',
  },

  dropbox: {
    'border-width'  : 1,
    dropTextBG      : 'rgba(62,62,62, 1)',
    height          : 20,
    margin          : 0,
    'margin-bottom' : 0,
    'margin-top'    : 0,
    padding         : 3,
    'padding-bottom': 0,
    'padding-top'   : 0,
    width           : 32,
  },

  iconbutton: {
    'background-color': 'rgba(73,73,73, 0.9603)',
    'border-color'    : 'rgba(171,171,171, 1)',
    'border-radius'   : 8,
    'border-width'    : 1,
    depressed         : {
      'background-color': 'rgba(48,48,48, 1)',
      'border-color'    : 'rgb(0,0,0)',
      'border-radius'   : 8,
      'border-style'    : 'solid',
      'border-width'    : 1,
      drawCheck         : true,
      height            : 32,
      'margin-bottom'   : 2,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    drawCheck         : true,
    height            : 32,
    highlight         : {
      'background-color': 'rgba(99,119,142, 1)',
      'border-color'    : 'rgba(171,171,171, 1)',
      'border-radius'   : 8,
      'border-width'    : 1,
      drawCheck         : true,
      height            : 32,
      'margin-bottom'   : 2,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    'margin-bottom'   : 1,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  iconcheck: {
    'background-color': 'rgba(73,73,73, 0.9602806590427863)',
    'border-color'    : 'rgba(171,171,171, 1)',
    'border-radius'   : 8,
    'border-width'    : 1,
    depressed         : {
      'background-color': 'rgba(48,48,48, 1)',
      'border-color'    : 'rgb(0,0,0)',
      'border-radius'   : 8,
      'border-style'    : 'solid',
      'border-width'    : 1,
      drawCheck         : true,
      height            : 32,
      'margin-bottom'   : 2,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    drawCheck         : true,
    height            : 32,
    highlight         : {
      'background-color': 'rgba(99,119,142, 1)',
      'border-color'    : 'rgba(171,171,171, 1)',
      'border-radius'   : 8,
      'border-width'    : 1,
      drawCheck         : true,
      height            : 32,
      'margin-bottom'   : 2,
      'margin-left'     : 2,
      'margin-right'    : 2,
      'margin-top'      : 1,
      padding           : 2,
      width             : 32,
    },
    'margin-bottom'   : 2,
    'margin-left'     : 2,
    'margin-right'    : 2,
    'margin-top'      : 1,
    padding           : 2,
    width             : 32,
  },

  label: {
    LabelText: new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(255,255,255, 1)'
    }),
  },

  listbox: {
    ListActive   : 'rgba(200, 205, 215, 1.0)',
    ListHighlight: 'rgba(155, 220, 255, 0.5)',
    height       : 200,
    margin       : 1,
    padding      : 1,
    width        : 175,
  },

  menu: {
    MenuBG          : 'rgba(60,60,60, 1)',
    MenuBorder      : '1px solid grey',
    MenuHighlight   : 'rgba(74,149,255, 0.367)',
    MenuSeparator   : `
      width : 100%;
      height : 2px;
      padding : 0px;
      margin : 0px;
      border : none;
      background-color : grey; 
    `,
    MenuSpacing     : 5,
    MenuText        : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(214,214,214, 1)'
    }),
    'border-color'  : 'grey',
    'border-radius' : 5,
    'border-style'  : 'solid',
    'border-width'  : 1,
    'box-shadow'    : '5px 5px 25px rgba(0,0,0,0.75)',
    'item-radius'   : 0,
    'padding-bottom': 0,
    'padding-left'  : 0,
    'padding-right' : 0,
    'padding-top'   : 0,
  },

  noteframe: {
    'background-color': 'rgba(220, 220, 220, 0.0)',
    'border-color'    : 'grey',
    'border-radius'   : 5,
    'border-style'    : 'solid',
    'border-width'    : 0,
    margin            : 1,
    padding           : 1,
    width             : 128,
  },

  notification: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(255,255,255, 1)'
    }),
    ProgressBar       : 'rgba(75, 175, 255, 1.0)',
    ProgressBarBG     : 'rgba(110, 110, 110, 1.0)',
    'background-color': 'rgba(72,72,72,0)',
    'border-color'    : 'grey',
    'border-radius'   : 5,
    'border-style'    : 'solid',
    'border-width'    : 1,
  },

  numslider: {
    'background-color': 'rgba(98,98,98, 1)',
    'border-color'    : 'rgba(227,227,227, 1)',
    'border-radius'   : 4,
    'border-style'    : 'solid',
    'border-width'    : 1,
    height            : 20,
    width             : 120,
  },

  numslider_simple: {
    SlideHeight       : 10,
    TextBoxWidth      : 45,
    'background-color': 'rgba(162,162,162, 1)',
    'border-color'    : 'black',
    'border-radius'   : 5,
    'border-style'    : 'solid',
    'border-width'    : 1,
    height            : 18,
    labelOnTop        : true,
    addLabel          : true,
    width             : 100,
  },

  numslider_textbox: {
    TextBoxHeight     : 25,
    TextBoxWidth      : 55,
    'background-color': 'rgba(219,219,219, 1)',
    height            : 25,
    addLabel          : false,
    labelOnTop        : false,
    width             : 120,
  },

  overdraw: {
    'background-color': 'rgba(0,0,0,0)',
    'border-width'    : 0,
    margin            : 0,
    padding           : 0,
  },

  panel: {
    HeaderBorderRadius    : 1,
    HeaderRadius          : 1,
    TitleBackground       : 'rgba(98,98,98, 1)',
    TitleBorder           : 'rgba(85,85,85, 1)',
    TitleText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(234,234,234, 1)'
    }),
    'background-color'    : 'rgba(52,52,52, 0.43137210023169426)',
    'border-color'        : 'rgba(0,0,0, 0.5598061397157866)',
    'border-radius'       : 1,
    'border-style'        : 'groove',
    'border-width'        : 1,
    'margin-bottom'       : 0,
    'margin-bottom-closed': 0,
    'margin-left'         : 5,
    'margin-right'        : 0,
    'margin-top'          : 0,
    'margin-top-closed'   : 0,
    'padding-bottom'      : 1,
    'padding-left'        : 0,
    'padding-right'       : 0,
    'padding-top'         : 1,
  },

  popup: {
    'background-color': 'rgba(70,70,70, 1)',
  },

  richtext: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 16,
      color  : 'rgb(0,0,0)'
    }),
    'background-color': 'rgb(245, 245, 245)',
  },

  screenborder: {
    'border-inner'   : 'rgba(127,127,127, 1)',
    'border-outer'   : 'rgba(8,8,8, 1)',
    'border-width'   : 3,
    'mouse-threshold': 9,
  },

  scrollbars: {
    border  : undefined,
    color   : undefined,
    color2  : undefined,
    contrast: undefined,
    width   : undefined,
  },

  sidebar: {
    'background-color': 'rgba(55, 55, 55, 0.5)',
  },

  strip: {
    'background-color': 'rgba(57,57,57, 0.6764705134373085)',
    'border-color'    : 'rgba(0,0,0, 0.31325409987877156)',
    'border-radius'   : 1,
    'border-style'    : 'solid',
    'border-width'    : 1,
    'flex-grow'       : 'unset',
    margin            : 0,
    oneAxisPadding    : 2,
    padding           : 0,
  },

  tabs: {
    TabActive           : 'rgba(79,79,79, 1)',
    TabBarRadius        : 3,
    TabHighlight        : 'rgba(50, 50, 50, 0.2)',
    TabInactive         : 'rgba(61,61,61, 1)',
    TabPadding          : 0,
    TabPadding_mobile   : 20,
    TabStrokeStyle1     : 'rgba(0,0,0, 1)',
    TabStrokeStyle2     : 'rgba(0,0,0, 1)',
    TabText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 18,
      color  : 'rgba(229,229,229, 1)'
    }),
    'background-color'  : 'rgba(123,123,123, 0.7426724664096175)',
    'focus-on-tab-click': 'false',
    'movable-tabs'      : 'true',
  },

  textbox: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(231,231,231, 1)'
    }),
    'background-color': 'rgba(61,61,61, 1)',
  },

  tooltip: {
    ToolTipText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(225, 225, 225, 1.0)'
    }),
    'background-color': 'rgba(55,55,55, 1)',
    'border-color'    : 'rgba(139,139,139, 1)',
    'border-radius'   : 3,
    'border-style'    : 'solid',
    'border-width'    : 1,
    padding           : 5,
  },

  treeview: {
    itemIndent: 10,
    rowHeight : 18,
  },

  vecPopupButton: {
    height : 18,
    margin : 1,
    padding: 3,
    width  : 100,
  },

};

setTheme(theme);
