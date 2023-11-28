export const theme: {
    NodeEditor: {
        NodeOverrides: {
            base: {
                width: number;
            };
            button: {
                width: number;
            };
            numslider: {
                width: number;
            };
            numslider_simple: {
                width: number;
            };
            numslider_textbox: {
                width: number;
            };
            panel: {
                width: number;
            };
        };
        'background-color': string;
    };
    'NodeEditor.Node': {
        BoxHighlight: string;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        borderSelect: string;
        margin: number;
        padding: number;
    };
    base: {
        AreaHeaderBG: string;
        BasePackFlag: number;
        BoxDepressed: string;
        BoxHighlight: string;
        DefaultText: CSSFont;
        Disabled: {
            'background-color': string;
            'background-size': string;
            'border-radius': string;
        };
        LabelText: CSSFont;
        TitleText: CSSFont;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'flex-grow': string;
        'focus-border-color': string;
        'focus-border-width': number;
        mobileSizeMultiplier: number;
        oneAxisPadding: number;
        padding: number;
    };
    button: {
        DefaultText: CSSFont;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        disabled: {
            DefaultText: CSSFont;
            'background-color': string;
            'border-color': string;
            'border-style': string;
            'border-width': number;
        };
        height: number;
        highlight: {
            DefaultText: CSSFont;
            'background-color': string;
            'border-color': string;
            'border-style': string;
            'border-width': number;
        };
        'highlight-pressed': {
            DefaultText: CSSFont;
            'background-color': string;
            'border-color': string;
            'border-radius': number;
            'border-style': string;
            'border-width': number;
        };
        margin: number;
        'margin-bottom': number;
        'margin-left': number;
        'margin-right': number;
        'margin-top': number;
        padding: number;
        'padding-bottom': number;
        'padding-left': number;
        'padding-right': number;
        'padding-top': number;
        pressed: {
            DefaultText: CSSFont;
            'background-color': string;
            'border-color': string;
            'border-style': string;
            'border-width': number;
        };
        width: number;
    };
    checkbox: {
        CheckSide: string;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        height: number;
        'margin-bottom': number;
        'margin-left': number;
        'margin-right': number;
        'margin-top': number;
        padding: number;
        width: number;
    };
    colorfield: {
        'background-color': string;
        circleSize: number;
        colorBoxHeight: number;
        fieldSize: number;
        height: number;
        hueHeight: number;
        width: number;
    };
    colorpickerbutton: {
        height: number;
        width: number;
    };
    curvewidget: {
        CanvasBG: string;
        CanvasHeight: number;
        CanvasWidth: number;
        'background-color': string;
    };
    dropbox: {
        'border-width': number;
        dropTextBG: string;
        height: number;
        margin: number;
        'margin-bottom': number;
        'margin-top': number;
        padding: number;
        'padding-bottom': number;
        'padding-top': number;
        width: number;
    };
    iconbutton: {
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-width': number;
        depressed: {
            'background-color': string;
            'border-color': string;
            'border-radius': number;
            'border-style': string;
            'border-width': number;
            drawCheck: boolean;
            height: number;
            'margin-bottom': number;
            'margin-left': number;
            'margin-right': number;
            'margin-top': number;
            padding: number;
            width: number;
        };
        drawCheck: boolean;
        height: number;
        highlight: {
            'background-color': string;
            'border-color': string;
            'border-radius': number;
            'border-width': number;
            drawCheck: boolean;
            height: number;
            'margin-bottom': number;
            'margin-left': number;
            'margin-right': number;
            'margin-top': number;
            padding: number;
            width: number;
        };
        'margin-bottom': number;
        'margin-left': number;
        'margin-right': number;
        'margin-top': number;
        padding: number;
        width: number;
    };
    iconcheck: {
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-width': number;
        depressed: {
            'background-color': string;
            'border-color': string;
            'border-radius': number;
            'border-style': string;
            'border-width': number;
            drawCheck: boolean;
            height: number;
            'margin-bottom': number;
            'margin-left': number;
            'margin-right': number;
            'margin-top': number;
            padding: number;
            width: number;
        };
        drawCheck: boolean;
        height: number;
        highlight: {
            'background-color': string;
            'border-color': string;
            'border-radius': number;
            'border-width': number;
            drawCheck: boolean;
            height: number;
            'margin-bottom': number;
            'margin-left': number;
            'margin-right': number;
            'margin-top': number;
            padding: number;
            width: number;
        };
        'margin-bottom': number;
        'margin-left': number;
        'margin-right': number;
        'margin-top': number;
        padding: number;
        width: number;
    };
    label: {
        LabelText: CSSFont;
    };
    listbox: {
        ListActive: string;
        ListHighlight: string;
        height: number;
        margin: number;
        padding: number;
        width: number;
    };
    menu: {
        MenuBG: string;
        MenuBorder: string;
        MenuHighlight: string;
        MenuSeparator: string;
        MenuSpacing: number;
        MenuText: CSSFont;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        'box-shadow': string;
        'item-radius': number;
        'padding-bottom': number;
        'padding-left': number;
        'padding-right': number;
        'padding-top': number;
    };
    noteframe: {
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        margin: number;
        padding: number;
        width: number;
    };
    notification: {
        DefaultText: CSSFont;
        ProgressBar: string;
        ProgressBarBG: string;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
    };
    numslider: {
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        height: number;
        width: number;
    };
    numslider_simple: {
        SlideHeight: number;
        TextBoxWidth: number;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        height: number;
        labelOnTop: boolean;
        addLabel: boolean;
        width: number;
    };
    numslider_textbox: {
        TextBoxHeight: number;
        TextBoxWidth: number;
        'background-color': string;
        height: number;
        addLabel: boolean;
        labelOnTop: boolean;
        width: number;
    };
    overdraw: {
        'background-color': string;
        'border-width': number;
        margin: number;
        padding: number;
    };
    panel: {
        HeaderBorderRadius: number;
        HeaderRadius: number;
        TitleBackground: string;
        TitleBorder: string;
        TitleText: CSSFont;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        'margin-bottom': number;
        'margin-bottom-closed': number;
        'margin-left': number;
        'margin-right': number;
        'margin-top': number;
        'margin-top-closed': number;
        'padding-bottom': number;
        'padding-left': number;
        'padding-right': number;
        'padding-top': number;
    };
    popup: {
        'background-color': string;
    };
    richtext: {
        DefaultText: CSSFont;
        'background-color': string;
    };
    screenborder: {
        'border-inner': string;
        'border-outer': string;
        'border-width': number;
        'mouse-threshold': number;
    };
    scrollbars: {
        border: any;
        color: any;
        color2: any;
        contrast: any;
        width: any;
    };
    sidebar: {
        'background-color': string;
    };
    strip: {
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        'flex-grow': string;
        margin: number;
        oneAxisPadding: number;
        padding: number;
    };
    tabs: {
        TabActive: string;
        TabBarRadius: number;
        TabHighlight: string;
        TabInactive: string;
        TabPadding: number;
        TabPadding_mobile: number;
        TabStrokeStyle1: string;
        TabStrokeStyle2: string;
        TabText: CSSFont;
        'background-color': string;
        'focus-on-tab-click': string;
        'movable-tabs': string;
    };
    textbox: {
        DefaultText: CSSFont;
        'background-color': string;
    };
    tooltip: {
        ToolTipText: CSSFont;
        'background-color': string;
        'border-color': string;
        'border-radius': number;
        'border-style': string;
        'border-width': number;
        padding: number;
    };
    treeview: {
        itemIndent: number;
        rowHeight: number;
    };
    vecPopupButton: {
        height: number;
        margin: number;
        padding: number;
        width: number;
    };
};
import { CSSFont } from "../path.ux/scripts/core/ui_base.js";
