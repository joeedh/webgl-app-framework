/*
 * WARNING: AUTO-GENERATED FILE
 * 
 * Copy to scripts/editors/theme.js
 */

import {CSSFont, setTheme} from "../path.ux/scripts/core/ui_base.js";

export const theme = {
  base: {
    AreaHeaderBG            : 'rgba(81,81,81, 1)',
    BasePackFlag            : 0,
    BoxBG                   : 'rgba(84,84,84, 1)',
    BoxBorder               : 'rgba(177,177,177, 1)',
    BoxDepressed            : 'rgba(48,48,48, 1)',
    DisabledBG              : 'rgba(25,25,25,1.0)',
    BoxDrawMargin           : 2,
    BoxHighlight            : 'rgba(74,149,255, 0.367)',
    BoxMargin               : 4,
    BoxRadius               : 6.207598321508586,
    BoxSub2BG               : 'rgba(79,79,79, 1)',
    BoxSubBG                : 'rgba(155,155,155, 1)',
    DefaultPanelBG          : 'rgba(79,79,79, 1)',
    DefaultText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(242,242,242, 1)'
    }),
    Disabled                : {
      AreaHeaderBG      : 'rgb(72, 72, 72)',
      BoxBG             : 'rgb(50, 50, 50)',
      BoxSub2BG         : 'rgb(50, 50, 50)',
      BoxSubBG          : 'rgb(50, 50, 50)',
      DefaultPanelBG    : 'rgb(72, 72, 72)',
      InnerPanelBG      : 'rgb(72, 72, 72)',
      'background-color': 'rgb(72, 72, 72)',
      'background-size' : '5px 3px',
      'border-radius'   : '15px',
    },
    FocusOutline            : 'rgba(100, 150, 255, 1.0)',
    HotkeyText              : new CSSFont({
      font   : 'courier',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(130, 130, 130, 1.0)'
    }),
    InnerPanelBG            : 'rgba(79,79,79, 1)',
    LabelText               : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 13,
      color  : 'rgba(255,255,255, 1)'
    }),
    NoteBG                  : 'rgba(220, 220, 220, 0.0)',
    NoteText                : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(135, 135, 135, 1.0)'
    }),
    ProgressBar             : 'rgba(75, 175, 255, 1.0)',
    ProgressBarBG           : 'rgba(110, 110, 110, 1.0)',
    ScreenBorderInner       : 'rgba(130,130,130, 1)',
    ScreenBorderMousePadding: 5,
    ScreenBorderOuter       : 'rgba(178,178,178, 1)',
    ScreenBorderWidth       : 2,
    TitleText               : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 16,
      color  : 'rgba(0,0,0, 1)'
    }),
    ToolTipText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'bold',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    defaultHeight           : 32,
    defaultWidth            : 32,
    mobileSizeMultiplier    : 1,
    mobileTextSizeMultiplier: 1,
    numslider_height        : 24,
    numslider_width         : 24,
    oneAxisMargin           : 6,
    oneAxisPadding          : 6,
    themeVersion            : 0.1,
  },

  button: {
    BoxMargin    : 2.8251749218092415,
    defaultHeight: 22.965012641773395,
    defaultWidth : 100,
  },

  checkbox: {
    BoxMargin         : 6,
    CheckSide         : 'left',
    background        : 'blue',
    'background-color': 'orange',
  },

  colorfield: {
    circleSize    : 4,
    colorBoxHeight: 24,
    defaultHeight : 200,
    defaultWidth  : 200,
    fieldsize     : 32,
    hueheight     : 24,
  },

  colorpickerbutton: {
    defaultFont  : 'LabelText',
    defaultHeight: 25,
    defaultWidth : 100,
  },

  curvewidget: {
    CanvasBG    : 'rgba(50, 50, 50, 0.75)',
    CanvasHeight: 256,
    CanvasWidth : 256,
  },

  dropbox: {
    BoxHighlight : 'rgba(155, 220, 255, 0.4)',
    defaultHeight: 24,
    dropTextBG   : 'rgba(47,47,47, 0.7)',
  },

  iconbutton: {},

  iconcheck: {
    drawCheck: true,
  },

  listbox: {
    DefaultPanelBG: 'rgba(230, 230, 230, 1.0)',
    ListActive    : 'rgba(200, 205, 215, 1.0)',
    ListHighlight : 'rgba(155, 220, 255, 0.5)',
    height        : 200,
    width         : 110,
  },

  menu: {
    MenuBG       : 'rgba(60,60,60, 1)',
    MenuBorder   : '1px solid grey',
    MenuHighlight: 'rgba(74,149,255, 0.367)',
    MenuSeparator: `
      width : 100%;
      height : 2px;
      padding : 0px;
      margin : 0px;
      border : none;
      background-color : grey; 
    `,
    MenuSpacing  : 0,
    MenuText     : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 12,
      color  : 'rgba(214,214,214, 1)'
    }),
  },

  numslider: {
    DefaultText  : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14.204297767377387,
      color  : 'rgba(251,251,251, 1)'
    }),
    defaultHeight: 16,
    defaultWidth : 100,
    labelOnTop   : true,
  },

  numslider_simple: {
    BoxBG        : 'rgba(179,179,179, 1)',
    BoxBorder    : 'rgb(75, 75, 75)',
    BoxRadius    : 5,
    DefaultHeight: 18,
    DefaultWidth : 135,
    SlideHeight  : 10,
    TextBoxWidth : 45,
    TitleText    : new CSSFont({
      font   : undefined,
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : undefined
    }),
    labelOnTop   : true,
  },

  numslider_textbox: {
    TitleText : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(229,229,229, 1)'
    }),
    labelOnTop: true,
  },

  panel: {
    Background            : 'rgba(33,33,33, 0.23771520154229525)',
    BoxBorder             : 'rgba(0,0,0, 0.5598061397157866)',
    BoxLineWidth          : 1.141,
    BoxRadius             : 7.243125760182565,
    HeaderRadius          : 5.829650280441558,
    TitleBackground       : 'rgba(89,89,89, 0.7980600291285022)',
    TitleBorder           : 'rgba(93,93,93, 1)',
    TitleText             : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(225,225,225, 1)'
    }),
    'border-style'        : 'groove',
    'margin-bottom'       : 15.762442435166511,
    'margin-bottom-closed': 0,
    'margin-top'          : 0.2606556353343805,
    'margin-top-closed'   : 0,
    'padding-bottom'      : 0.8561244078997758,
    'padding-left'        : 0,
    'padding-right'       : 0,
    'padding-top'         : 0.9665377430621097,
  },

  richtext: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 16,
      color  : 'rgba(35, 35, 35, 1.0)'
    }),
    'background-color': 'rgb(245, 245, 245)',
  },

  scrollbars: {
    border  : undefined,
    color   : undefined,
    color2  : undefined,
    contrast: undefined,
    width   : undefined,
  },

  strip: {
    BoxBorder     : 'rgba(0,0,0, 0.31325409987877156)',
    BoxLineWidth  : 1,
    BoxMargin     : 1,
    BoxRadius     : 8.76503417507447,
    background    : 'rgba(0,0,0, 0.22704720332704742)',
    'border-style': 'solid',
    margin        : 2,
  },

  tabs: {
    TabHighlight   : 'rgba(50, 50, 50, 0.2)',
    TabInactive    : 'rgba(61,61,61, 1)',
    TabStrokeStyle1: 'rgba(0,0,0, 1)',
    TabStrokeStyle2: 'rgba(0,0,0, 1)',
    TabText        : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 18,
      color  : 'rgba(187,187,187, 1)'
    }),
  },

  textbox: {
    DefaultText       : new CSSFont({
      font   : 'sans-serif',
      weight : 'normal',
      variant: 'normal',
      style  : 'normal',
      size   : 14,
      color  : 'rgba(205,205,205, 1)'
    }),
    'background-color': 'rgba(60,60,60, 1)',
  },

  tooltip: {
    BoxBG    : 'rgba(78,78,78, 1)',
    BoxBorder: 'rgb(145, 145, 145, 1.0)',
  },

  treeview: {
    itemIndent: 10,
    rowHeight : 18,
  },

  vecPopupButton: {
    BoxMargin    : 3,
    defaultHeight: 18,
    defaultWidth : 100,
  },

  uveditor: {
    background: 'rgba(55, 55, 55, 1.0)',
    gridLines : 'rgba(230, 230, 230, 1.0)'
  },

  sidebar: {
    background: 'rgba(55, 55, 55, 0.5)',
  },

  NodeEditor: {
    boxRadius   : 10,
    borderSelect: 'rgba(225, 225, 225, 1.0)',
    borderColor : 'rgba(55, 55, 55, 0.75)',
    NodeBG      : 'rgba(95, 95, 95, 0.85)',
    editorBG    : 'rgba(45, 45, 45, 1.0)'
  }
};

setTheme(theme);
