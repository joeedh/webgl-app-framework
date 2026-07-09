# Icon sheet guide

How to add or modify the UI icons.

Icons are wired into the **data-path binding system**: enum/bitflag properties
attach a per-value icon via `prop.icons({KEY: Icons.NAME})` in
`scripts/data_api/api_define.ts`. To resolve which path/binding an icon feeds,
see [datapath-bindings.md](datapath-bindings.md).

## Where the icons live

- **`assets/iconsheet.svg`** — the single source of truth. A hand-authored
  Inkscape document, `512 × 512` user-units. The app loads this SVG directly
  (`setupIconsSvg()` in `scripts/setup_pathux.js`, gated on `config.svgIcons`).
- The `iconsheet*.png` files next to it are **generated and unused** by the
  running app — ignore them. (They came from `assets/render_icons.py`, which
  rasterizes the SVG via Inkscape for the old raster code path.)

## The grid

The sheet is a **16-column** grid. Each cell is `512 / 16 = 32 × 32` user-units.
Icons fill the grid **row-wise, top-left to bottom-right**, and only occupy the
**top half** of the canvas (rows 0–7, i.e. `y < 256`).

The cell of an icon is determined entirely by its **index** in the `Icons` map
in [`scripts/editors/icon_enum.js`](../scripts/editors/icon_enum.js):

```
row = floor(index / 16)
col = index % 16
x   = col * 32
y   = row * 32        # SVG top-left origin
```

So index `0` (`HFLIP`) is the top-left cell `(0,0)–(32,32)`; index `16`
(`TINY_X`) is the start of row 1 at `y = 32`; index `102` (`SCULPT_GRAB`) is
row 6, col 6 → box `x=192 y=192 w=32 h=32`.

`Icons` is consumed by path.ux's `setIconMap()` — the enum *is* the
index→cell mapping; there is no separate manifest.

## Tooling: `tools/iconsheet.mjs`

A zero-dependency Node helper that does the index↔cell arithmetic for you:

```sh
node tools/iconsheet.mjs locate <NAME|index>   # row/col + SVG pixel box for one icon
node tools/iconsheet.mjs list                   # every icon with its cell
node tools/iconsheet.mjs add <NAME>             # append NAME to the Icons map (next index)
node tools/iconsheet.mjs grid                   # write assets/iconsheet-grid.svg locator overlay
```

`grid` writes `assets/iconsheet-grid.svg` (a regenerable, throwaway artifact):
it embeds the real sheet and overlays each cell's border, index number, and
icon name. Open it in a browser to **visually find which cell an icon is in**
before editing the artwork.

## Modify an existing icon

1. Find its cell: `node tools/iconsheet.mjs locate <NAME>` (or use the `grid`
   overlay to find it visually).
2. Open `assets/iconsheet.svg` in Inkscape and edit the artwork **within that
   cell's box** — keep it inside `[x..x+32] × [y..y+32]` so it doesn't bleed
   into neighbours. Document units are pixels with a top-left origin (matching
   the math above).
3. Save. The app picks up the SVG on reload; no rebuild step is required for
   icon art.

## Add a new icon

1. Reserve the next index: `node tools/iconsheet.mjs add <NEW_NAME>`. This
   appends `NEW_NAME : <next-index>,` to the `Icons` map in `icon_enum.js`
   (alignment preserved). Names are `UPPER_SNAKE_CASE`.
2. The command prints the cell box to draw into. Open `assets/iconsheet.svg`
   in Inkscape and draw the new icon inside that `32 × 32` box.
3. Reference the icon in UI code via `Icons.NEW_NAME` (e.g. tool `icon()`
   getters, `Menu.addItemExtra`, button `icon=` props).

> Indices are positional and permanent — **only append** to `Icons`, never
> reorder or delete entries, or every icon after the change shifts cells and
> the artwork no longer lines up.

## Regenerating PNGs (optional / not needed by the app)

The running app uses the SVG. Only run `python assets/render_icons.py` (needs
Inkscape + Pillow) if you specifically need the raster sheets for the legacy
`setupIconsRastered()` path.
