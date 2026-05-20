# vendor/

Third-party dependencies vendored locally so we can patch them.

## `vendor/nstructjs/`

Fork of <https://github.com/joeedh/STRUCT> pinned at the SHA referenced by the
parent repo's submodule pointer.

The local branch `webgl-app-framework-patches` adds two host hooks needed by
the addon system (see `/scripts/core/missing_addon.ts` and the refactor plan §4):

- `nstructjs.manager.onUnknownClass(clsname, schema)` — invoked when an
  `abstract(...)` field references a struct whose JS class isn't currently
  registered. Returns a placeholder class that `read_object` populates from the
  file's schema (so all original field values land on the placeholder as
  dynamic properties).
- `nstructjs.manager.onSerializeUnknown(obj)` — invoked when writing an
  abstract field. Returns the original struct name to use that struct's id +
  schema on disk, so placeholders re-emit under the original class.

The branch is intended to be pushed to a fork the upstream maintainer
controls and merged back into `joeedh/STRUCT` master eventually. Until then,
the parent repo's submodule pointer references the unpublished
`webgl-app-framework-patches` SHA. Two ways to get a working tree on a fresh
clone:

**(A) Apply the bundled patch.** A copy of every commit on the
`webgl-app-framework-patches` branch lives at
`vendor/patches/0001-nstructjs-*.patch`. From a clean nstructjs submodule:

```
git submodule update --init vendor/nstructjs
cd vendor/nstructjs
git checkout master
git am ../patches/0001-nstructjs-onUnknownClass-onSerializeUnknown-hooks.patch
./node_modules/.bin/rollup -c rollup_module.config.js   # if you changed src/
```

This is the recommended path when running in an environment that can't push
to the maintainer's fork.

**(B) Submodule fetches the branch.** If the maintainer has pushed
`webgl-app-framework-patches` to a fork you can reach:

```
git submodule update --init --recursive
# vendor/nstructjs will be at the patched SHA if it was fetched alongside the
# parent push; otherwise:
cd vendor/nstructjs
git remote add fork <fork-url>
git fetch fork webgl-app-framework-patches
git checkout webgl-app-framework-patches
```

To rebuild after editing the source:

```
cd vendor/nstructjs
pnpm install              # if node_modules missing
./node_modules/.bin/rollup -c rollup_module.config.js
```

The `build/nstructjs_es6.js` is the only artifact our app consumes; the other
build outputs (UMD, tinyeval, configurable) aren't used here.
