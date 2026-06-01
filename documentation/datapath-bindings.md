# Data API path bindings — index

The app binds UI widgets to model state through **data paths**: string paths
like `mesh.symFlag` or `scene.tools.brush.tool` passed to `container.prop(...)`
(and `slider`, `check`, `checkenum`, `listenum`, `pathlabel`, `textbox`, plus
`<prop path="...">` xmlpage tags). This file is the entry point for resolving
those paths.

## The authoritative path catalog

The full, generated catalog of every valid path lives in
[`scripts/data_api/generated/`](../scripts/data_api/generated/):

- **`API_PATHS.md`** — human/LLM-readable table: every path, its kind
  (`struct` / `prop` / `list`), property type, UI name, range, unit, and enum
  items. **Read this first** to resolve a path or find the path for a property.
- **`api-paths.json`** — the same catalog, machine-readable.
- **`datapaths.ts`** — a `DataPathRegistry` augmentation exporting the
  `KnownDataPath` union that powers autocomplete (committed; in `tsconfig`'s
  `files`).

These are **auto-generated** by walking `getDataAPI()`. Don't hand-edit them —
edit [`scripts/data_api/api_define.js`](../scripts/data_api/api_define.js) (the
definitions) and run `pnpm gen:paths` to regenerate. `pnpm typecheck` runs
`gen:paths` first so the catalog never goes stale.

## How bindings are declared

Bindings are declared in `api_define.js` against a struct's `DataStruct`:

```js
let mstruct = api.mapStruct(Mesh, true)
mstruct.float('radius', 'radius', 'Radius').range(0.1, 350.0)   // float prop
mstruct.flags('symFlag', 'symFlag', MeshSymFlags, 'Symmetry')    // bitflag enum
       .icons({ X: Icons.SYM_X, Y: Icons.SYM_Y, Z: Icons.SYM_Z })
```

The chain `struct.float/int/enum/flags/string/vec3/...('apiname', 'propname',
'uiname')` registers a property; the `apiname` segment is what appears in the
path. Widgets then resolve `container.prop('mesh.symFlag')` against this tree.

## How icons attach to bindings

Icons are bound to **enum and bitflag properties**, one icon per enum key:

- `enumProp.icons({ KEY: Icons.NAME, ... })` / `flagsProp.icons({ ... })` in
  `api_define.js` (see the `.icons(...)` call sites — e.g. `selectMask`,
  `symFlag`, brush `tool`/`flag`, `lib_flag`).
- Under the hood this stores an `iconmap` (`{enumKey: numericIndex}`) on the
  property (`addIcons` in
  `scripts/path.ux/scripts/path-controller/toolsys/toolprop.ts`).
- The numeric index is `Icons.NAME` from
  [`scripts/editors/icon_enum.js`](../scripts/editors/icon_enum.js), i.e. the
  row-major cell index into `assets/iconsheet.svg`
  (see [iconsheet-guide.md](iconsheet-guide.md)).
- `checkenum` / `listenum` widgets and enum menus read the `iconmap` to draw the
  icon next to each enum value; a plain `prop`/icon-button uses
  `Icons.NAME` directly.

So the chain for an icon shown in the UI is:

```
assets/iconsheet.svg cell  ──(row-major index)──▶  Icons.NAME (icon_enum.js)
   ──▶  .icons({KEY: Icons.NAME}) in api_define.js  ──▶  enum/flag property iconmap
   ──▶  checkenum/listenum bound via prop('<path>')  ──▶  rendered glyph
```

To find which bindings reference an icon, grep `api_define.js` for
`Icons.NAME`; to find which path drives a widget, look it up in `API_PATHS.md`.

## See also

- [iconsheet-guide.md](iconsheet-guide.md) — authoring the icons themselves.
- path.ux controller docs:
  [`scripts/path.ux/documentation/controller.md`](../scripts/path.ux/documentation/controller.md).
