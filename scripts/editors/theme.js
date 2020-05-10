import {CSSFont, setTheme} from "../path.ux/scripts/ui_base.js";

export const theme = {
  base : {
    mobileTextSizeMultiplier : 1,
    mobileSizeMultiplier : 1, //does not include text

    //used for by icon strips and the like
    "oneAxisPadding" : 6,
    "oneAxisMargin" : 6,

    "ScreenBorderOuter" : "rgba(10, 10, 10, 0.1)",
    "ScreenBorderInner" : "rgba(10, 10, 10, 0.1)",
    "FocusOutline" : "rgba(100, 150, 255, 1.0)",

    "numslider_width" : 24,
    "numslider_height" : 24,

    "defaultWidth" : 32,
    "defaultHeight" : 32,

    "ProgressBarBG" : "rgba(110, 110, 110, 1.0)",
    "ProgressBar" : "rgba(75, 175, 255, 1.0)",

    "NoteBG" : "rgba(220, 220, 220, 0.0)",
    "NoteText" : new CSSFont({
      font  : "sans-serif",
      size  : 14,
      color :  "rgba(235, 235, 235, 1.0)",
      weight : "bold"
    }),

    "TabStrokeStyle1" : "rgba(200, 200, 200, 1.0)",
    "TabStrokeStyle2" : "rgba(225, 225, 225, 1.0)",
    "TabInactive" : "rgba(150, 150, 150, 1.0)",
    "TabHighlight" : "rgba(50, 50, 50, 0.2)",

    "DefaultPanelBG" : "rgba(100, 100, 155, 0.75)",
    "InnerPanelBG" : "rgba(95, 95, 75, 0.5)",

    "BoxRadius" : 24,
    "BoxMargin" : 10,
    "BoxHighlight" : "rgba(155, 220, 255, 0.75)",
    "BoxDepressed" : "rgba(55, 55, 55, 0.75)",
    "BoxBG" : "rgba(100, 100, 100, 0.75)",
    "DisabledBG" : "rgba(0, 0, 0, 1.0)",
    "BoxSubBG" : "rgba(55, 55, 55, 0.75)",
    "BoxSub2BG" : "rgba(25, 25, 25, 0.75)", //for panels
    "BoxBorder" : "rgba(25, 25, 25, 0.5)",
    "MenuBG" : "rgba(250, 250, 250, 1.0)",
    "MenuHighlight" : "rgba(155, 220, 255, 1.0)",
    "AreaHeaderBG" : "rgba(75, 75, 75, 0.5)",

    //fonts
    "DefaultText" : new CSSFont({
      font  : "sans-serif",
      size  : 18,
      color :  "rgba(235, 235, 235, 1.0)",
      weight : "bold"
    }),

    //fonts
    "ToolTipText" : new CSSFont({
      font  : "sans-serif",
      size  : 18,
      color :  "rgba(235, 235, 235, 1.0)",
      weight : "bold"
    }),

    "TabText" : new CSSFont({
      size     : 18,
      color    : "rgba(235, 235, 235, 1.0)",
      font     : "sans-serif",
      //weight   : "bold"
    }),

    "LabelText" : new CSSFont({
      size     : 13,
      color    : "rgba(245, 245, 245, 1.0)",
      font     : "sans-serif",
      weight   : "bold"
    }),

    //"LabelTextFont" : "sans-serif",
    //"LabelTextSize" : 13,
    //"LabelTextColor" : "rgba(75, 75, 75, 1.0)",

    "HotkeyText" : new CSSFont({
      size     : 12,
      color    : "rgba(130, 130, 130, 1.0)",
      font     : "courier"
      //weight   : "bold"
    }),

    TitleText : new CSSFont({
      size     : 16,
      color    : "rgba(255, 255, 255, 1.0)",
      font     : "sans-serif",
      weight   : "bold"
    }),
  },

  tooltip : {
    "BoxBG" : "rgb(245, 245, 245, 1.0)"
  },

  button : {
    "defaultWidth" : 100,
    "defaultHeight" : 35,
    "boxMargin" : 10
  },

  checkbox : {
    BoxBG : "rgba(170, 170, 170, 0.75)",
    BoxDepressed :  "rgba(170, 170, 170, 0.75)",
    BoxHighlight : "rgba(255, 255, 255, 0.5)",
    CheckSide : "right",

    "DefaultText" : new CSSFont({
      font  : "sans-serif",
      size  : 14,
      color :  "rgba(235, 235, 235, 1.0)"
      //weight : "bold"
    })
  },

  iconcheck : {
    BoxDepressed : "rgba(100, 100, 100, 0.5)"
  },

  menu : {
    MenuText : new CSSFont({
      size     : 12,
      color    : "rgba(25, 25, 25, 1.0)",
      font     : "sans-serif"
      //weight   : "bold"
    }),

    MenuSeparator : `
      width : 100%;
      height : 2px;
      padding : 0px;
      margin : 0px;
      border : none;
      background-color : grey; 
    `,

    MenuBorder : "1px solid grey",
  },

  numslider : {
    "defaultWidth" : 100,
    "defaultHeight" : 29
  },

  numslider_simple : {
    labelOnTop : true,
    TitleText : new CSSFont({
      size     : 14,
      color    : "rgba(255, 255, 255, 1.0)",
      font     : "sans-serif",
      weight   : "bold"
    }),
    SlideHeight : 10,
    DefaultWidth : 135,
    DefaultHeight : 24,
    BoxRadius : 5,
    TextBoxWidth : 45
  },

  colorfield : {
    fieldsize : 32,
    defaultWidth : 200,
    defaultHeight : 200,
    hueheight : 24,
    colorBoxHeight : 24,
    circleSize : 4,
    DefaultPanelBG : "rgba(170, 170, 170, 1.0)"
  },

  listbox : {
    DefaultPanelBG : "rgba(230, 230, 230, 1.0)",
    ListHighlight : "rgba(155, 220, 255, 0.5)",
    ListActive : "rgba(200, 205, 215, 1.0)",
    width : 110,
    height : 200
  },

  dopesheet : {
    treeWidth : 100,
    treeHeight : 600
  },

  colorpickerbutton : {
    defaultWidth  : 100,
    defaultHeight : 25,
    defaultFont   : "LabelText"
  },

  PopupEditorIcon : {
    BoxBG     : "rgba(0, 0, 0, 0.25)",
    Highlight : "rgba(200, 200, 200, 0.5)",
    //BoxHighlight :
    BoxRadius : 64,
    BoxMargin : 10,
    BoxDrawMargin : 0
  },

  dropbox : {
    dropTextBG : undefined //if undefined, will use BoxBG
  }

};

setTheme(theme);
