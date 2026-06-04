---
name: edit-iconsheet
description: Add a new UI icon or modify an existing one in assets/iconsheet.svg. Use when the user wants to "add an icon", "change/edit an icon", "draw a new toolbar/brush icon", references the iconsheet, Icons enum, or icon_enum.js, or asks where an icon lives in the sheet. Handles the index↔grid-cell arithmetic and the icon_enum.js registration.
---

# Edit the icon sheet

Icons live in a single hand-authored SVG, `assets/iconsheet.svg`: a **16-column**
grid of **32×32** user-unit cells. Icons fill it row-wise (top-left →
bottom-right) in the index order of the `Icons` map in
`scripts/editors/icon_enum.js`. The `iconsheet*.png` files are generated and
**unused** — never edit them.

An icon's cell from its index: `row = floor(index/16)`, `col = index % 16`,
SVG box `x = col*32, y = row*32`, size `32×32`, top-left origin.

Full reference: `documentation/iconsheet-guide.md`.

## Tool

`tools/iconsheet.mjs` (zero-dependency Node ESM) does the arithmetic:

```sh
node tools/iconsheet.mjs locate <NAME|index>   # row/col + SVG pixel box for one icon
node tools/iconsheet.mjs list                   # every icon with its cell
node tools/iconsheet.mjs add <NAME>             # append NAME to Icons (next index)
node tools/iconsheet.mjs grid                   # write assets/iconsheet-grid.svg locator overlay
```

## Workflow: modify an existing icon

1. `node tools/iconsheet.mjs locate <NAME>` to get the cell box. (If the user
   only knows the icon visually, run `node tools/iconsheet.mjs grid` and open
   `assets/iconsheet-grid.svg` in a browser to read off the name/index.)
2. Edit the artwork inside that `[x..x+32] × [y..y+32]` box in
   `assets/iconsheet.svg`. Keep it within the cell so it doesn't bleed into
   neighbours. You can edit the SVG XML directly (the file is a normal Inkscape
   SVG) or have the user open it in Inkscape.
3. No rebuild is needed — the app loads the SVG directly on reload.

## Workflow: add a new icon

1. `node tools/iconsheet.mjs add <NEW_NAME>` — appends `NEW_NAME : <next>,` to
   `Icons` (UPPER_SNAKE_CASE; alignment preserved) and prints the target cell.
2. Draw the new glyph into that cell in `assets/iconsheet.svg`.
3. Wire it up in UI code via `Icons.NEW_NAME` (tool `icon()` getters, menu
   items, button `icon=` props) as the user requested.

## How icons wire into the data-path binding system

An icon is more than a glyph — most are bound to model state through the
**data-path binding system**. The chain:

```
iconsheet.svg cell ──(row-major index)──▶ Icons.NAME (scripts/editors/icon_enum.js)
  ──▶ .icons({ENUM_KEY: Icons.NAME}) in scripts/data_api/api_define.ts
  ──▶ enum/flag property iconmap ──▶ checkenum/listenum bound via prop('<path>')
```

- Icons attach to **enum / bitflag** data-API properties via
  `prop.icons({ KEY: Icons.NAME })` in `scripts/data_api/api_define.ts` (e.g.
  `selectMask`, `symFlag`, brush `tool`/`flag`). `checkenum`/`listenum` widgets
  and enum menus read that map to draw the per-value icon; plain icon-buttons
  use `Icons.NAME` directly.
- After editing `api_define.ts`, run `pnpm gen:paths` to refresh the path
  catalog (`pnpm typecheck` does this automatically).
- **To find every binding that references an icon**, grep `api_define.ts` for
  `Icons.NAME`. To resolve which data path drives a given widget, consult the
  index below.

**Index of data-path bindings:** see
[`documentation/datapath-bindings.md`](../../../documentation/datapath-bindings.md),
which points to the generated catalog
`scripts/data_api/generated/API_PATHS.md` (every valid `prop(...)` path with its
type, UI name, enum items) — use it to resolve bindings when adding or wiring up
an icon.

## Rules

- **Append only.** Indices are positional; reordering or deleting entries
  shifts every later icon's cell and breaks its artwork.
- Stay within the **top half** of the canvas (rows 0–7); that's all the app and
  the PNG renderer export.
- Don't touch the generated `iconsheet*.png` files.

## Proposed tooling upgrades (build only if needed)

The current tool is intentionally dependency-free and does locating, listing,
registration, and a browser-viewable locator overlay. If a task needs more:

- **Per-cell PNG/SVG preview without a browser** — add an optional
  `extract <NAME>` command using a headless renderer (`sharp`, or shell out to
  Inkscape `--export-area`) to crop one cell to a thumbnail. Only worth adding
  if reviewing icons in-terminal becomes common.
- **Programmatic glyph insertion** — if generating icons from a font/icon-set
  (e.g. Lucide/Material), add an `insert <NAME> <path.svg>` command that
  translates+scales an external SVG path into the target cell's transform. Needs
  an SVG path parser; propose before building.
- Prefer extending `tools/iconsheet.mjs` over new files; keep it zero-dependency
  unless a renderer is genuinely required.
