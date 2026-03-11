

<!-- toc -->

- [Editor System Architecture](#editor-system-architecture)
  * [Overview](#overview)
  * [Class Hierarchy](#class-hierarchy)
  * [Screen Layout System](#screen-layout-system)
  * [Editor Lifecycle](#editor-lifecycle)
    + [Registration](#registration)
    + [`define()` static method](#define-static-method)
    + [`init()`](#init)
    + [Other lifecycle hooks](#other-lifecycle-hooks)
  * [Context System](#context-system)
    + [BaseOverlay provides](#baseoverlay-provides)
    + [ViewOverlay provides](#viewoverlay-provides)
    + [Context activation](#context-activation)
    + [EditorAccessor](#editoraccessor)
  * [UI Components](#ui-components)
    + [Header](#header)
    + [Sidebar](#sidebar)
    + [Editor switching](#editor-switching)
    + [Container](#container)
  * [Editor Types Reference](#editor-types-reference)
  * [Key Files](#key-files)
<!-- regenerate with pnpm markdown-toc -->

<!-- tocstop -->

# Editor System Architecture

## Overview

The editor system follows a Blender-inspired area/editor model built on the
[path.ux](../scripts/path.ux/) UI framework. The application window is divided
into resizable rectangular areas, each hosting one editor instance. Users
can split, resize, and switch the editor type of any area at runtime.

## Class Hierarchy

```
path.ux Area  (scripts/path.ux/scripts/screen/ScreenArea.js)
  └─ Editor   (scripts/editors/editor_base.ts)
       ├─ View3D           — 3D viewport
       ├─ MenuBarEditor    — top menu bar
       ├─ PropsEditor      — properties panel
       ├─ NodeEditor       — shader node graph
       ├─ MaterialEditor   — material shader editor (extends NodeEditor)
       ├─ NodeViewer       — scene graph viewer
       ├─ ImageEditor      — UV/image editor
       ├─ ConsoleEditor    — JS console
       ├─ SettingsEditor   — application preferences
       ├─ DebugEditor      — GPU debug viewer
       ├─ DataPathBrowser  — data API browser
       └─ ResourceBrowser  — asset browser (hidden)
```

`Editor` extends `Area` from path.ux, which itself is a web component
(`HTMLElement`). Each editor subclass is registered as a custom HTML element
via its `tagname`.

## Screen Layout System

| Concept | Element / Class | Description |
|---------|----------------|-------------|
| **Screen** | `App` (`webgl-app-x`) | Root container. Extends path.ux `Screen`. Manages all `ScreenArea` instances and global keybindings (undo/redo, save, open). |
| **ScreenArea** | `screenarea-x` | Rectangular region holding one active editor. Handles area borders, drag-to-resize, and editor switching. |

Areas are created and split programmatically:

```js
// screengen.js — default layout
let sarea = document.createElement('screenarea-x')
sarea.switchEditor(View3D)
screen.appendChild(sarea)

// Split: top 35px for menu bar
let sarea2 = screen.splitArea(sarea, 35 / sarea.size[1], true)
smenu.switchEditor(MenuBarEditor)

// Split: 75% viewport, 25% properties
let sarea3 = screen.splitArea(sarea2, 0.75, false)
sarea3.switchEditor(PropsEditor)
```

The default layout (generated in `scripts/editors/screengen.js`) is:

```
┌─────────────────────────────────────┐
│         MenuBarEditor (35px)        │
├──────────────────────┬──────────────┤
│                      │              │
│      View3D (75%)    │  PropsEditor │
│                      │    (25%)     │
│                      │              │
└──────────────────────┴──────────────┘
```

## Editor Lifecycle

### Registration

Every editor must be registered with both nstructjs (for serialization) and the
area system:

```ts
class MyEditor extends Editor {
  static STRUCT = nstructjs.inlineRegister(this, `
    MyEditor {
      // struct fields
    }`)
}
Editor.register(MyEditor)  // calls Area.register() internally
```

This registers the custom HTML element tag and adds the class to the global
`areaclasses` map.

### `define()` static method

Each editor declares its identity via a static `define()`:

```js
static define() {
  return {
    tagname  : 'view3d-editor-x',  // custom element tag (must end with -x)
    areaname : 'view3d',           // internal area type name
    apiname  : undefined,          // optional: overrides areaname for ctx.editors.*
    uiname   : 'Viewport',         // display name in UI
    icon     : Icons.EDITOR_VIEW3D, // icon for area switcher menu
    has3D    : true,               // whether editor uses a WebGL canvas
    flag     : 0,                  // AreaFlags (HIDDEN, NO_SWITCHER, etc.)
  }
}
```

### `init()`

Called when the editor is first attached to the DOM.
The base class method does the following:

1. Sets up the container element
2. Calls `defineKeyMap()` to build the editor's keymap
3. Calls `makeHeader(container, false)` to build the header toolbar
4. Applies CSS

### Other lifecycle hooks

| Method | When |
|--------|------|
| `onFileLoad(isActive)` | After a file is loaded; rebuild UI state |
| `on_area_active()` | When the area becomes the active/focused area |
| `on_resize(oldsize, newsize)` | When the area is resized |
| `defineKeyMap()` | Override to register keyboard shortcuts |
| `saveData()` / `loadData()` | Persist/restore editor state with the screen layout |

## Context System

Editors receive a `ctx: ViewContext` that provides access to the full
application state. `ViewContext` is built from layered **context overlays**:

```
Context (path.ux base)
  └─ ToolContext  +  BaseOverlay
       └─ ViewContext  +  ViewOverlay
```

### BaseOverlay provides

`scene`, `object`, `mesh`, `material`, `light`, `smesh`, `tetmesh`,
`strandset`, `datalib`, `graph`, `toolstack`, `api`, `toolmode`,
`selectedObjects`, `selectMask`, `settings`, `gl`

### ViewOverlay provides

`view3d`, `menubar`, `propsbar`, `nodeEditor`, `shaderEditor`, `nodeViewer`,
`debugEditor`, `editors`, `screen`, `editor`, `area`, `activeTexture`,
`modalFlag`

### Context activation

- `push_ctx_active()` / `pop_ctx_active()` manage which editor's context is
  active (driven by mouse hover/focus via `contextWrangler` from path.ux)
- `Editor.getActiveArea()` returns the currently active editor instance

### EditorAccessor

`ctx.editors` returns an `EditorAccessor` that provides typed access to any
active editor by its `apiname` or `areaname`:

```ts
ctx.editors.view3d        // → View3D instance (or undefined)
ctx.editors.nodeEditor    // → NodeEditor instance
ctx.editors.imageEditor   // → ImageEditor instance
ctx.editors.propsEditor   // → PropsEditor instance
```

The accessor is built dynamically from all registered `areaclasses`.

## UI Components

### Header

Built by `makeHeader()` (inherited from `Area`). Includes the area type
switcher dropdown. Editors override `makeHeader()` to add toolbars and
controls.

### Sidebar

`Editor.makeSideBar()` creates a collapsible `EditorSideBar` with tabbed
panels. The sidebar animates between collapsed (25px) and expanded (250px)
widths and persists its state via `saveData()`/`loadData()`.

### Editor switching

- **Permanent**: `ScreenArea.switchEditor(cls)` swaps the editor type in an area
- **Temporary**: `Editor.swap(cls)` switches and stores a reference to the
  previous editor; `Editor.swapBack()` restores it

### Container

Every editor has a `this.container` (a path.ux `Container` element) as its
main content area. UI widgets are added to this container.

## Editor Types Reference

| Editor | Tag | Area Name | File | Description |
|--------|-----|-----------|------|-------------|
| View3D | `view3d-editor-x` | `view3d` | `editors/view3d/view3d.js` | Main 3D viewport for modeling, sculpting, and scene manipulation |
| MenuBarEditor | `menu-editor-x` | `MenuBarEditor` | `editors/menu/MainMenu.js` | Top menu bar (File, Edit, Add, Session); hidden from area switcher |
| PropsEditor | `props-editor-x` | `props` | `editors/properties/PropsEditor.js` | Properties panel with workspace, scene, material, object, and texture tabs |
| NodeEditor | `node-editor-x` | `NodeEditor` | `editors/node/NodeEditor.js` | Shader node graph editor with pan/zoom and node connections |
| MaterialEditor | `material-editor-x` | `MaterialEditor` | `editors/node/MaterialEditor.js` | Material-specific node editor with material slot selection |
| NodeViewer | `nodegraph-viewer-x` | `nodegraph_viewer` | `editors/node/NodeEditor_debug.js` | Read-only scene graph visualization |
| ImageEditor | `uv-image-editor-x` | `ImageEditor` | `editors/image/ImageEditor.js` | UV editor with image display and UV transform tools |
| ConsoleEditor | `console-editor-x` | `console_editor` | `editors/console/console.js` | JavaScript console with history and autocomplete |
| SettingsEditor | `settings-editor-x` | `settings-editor` | `editors/settings/SettingsEditor.js` | Application preferences (general, theme, addons) |
| DebugEditor | `debug-editor-x` | `DebugEditor` | `editors/debug/DebugEditor.js` | GPU debug viewer for inspecting framebuffers and textures |
| DataPathBrowser | `data-path-browser-editor-x` | `dataPathBrowser` | `editors/datapath/DataPathBrowser.js` | Hierarchical browser of the data API structure |
| ResourceBrowser | `resource-browser-x` | `resbrowser` | `editors/resbrowser/resbrowser.js` | Asset browser (hidden from switcher) |

## Key Files

| File | Purpose |
|------|---------|
| `scripts/editors/editor_base.ts` | `Editor` base class, `App` (Screen), `EditorSideBar`, `EditorAccessor`, `DataBlockBrowser` |
| `scripts/editors/all.js` | Re-exports all editor classes |
| `scripts/editors/screengen.js` | Default screen layout generation |
| `scripts/editors/icon_enum.js` | `Icons` enum used by editor definitions |
| `scripts/path.ux/scripts/screen/ScreenArea.js` | `Area` base class, `ScreenArea` container |
| `scripts/path.ux/scripts/screen/FrameManager.js` | `Screen` class, area splitting/management |
| `scripts/core/context.ts` | `ToolContext`, `ViewContext`, `BaseOverlay`, `ViewOverlay` |
