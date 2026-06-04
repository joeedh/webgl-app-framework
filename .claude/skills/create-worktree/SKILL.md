---
name: create-worktree
description: Create a new git worktree wired for fast cached builds. Use when the user wants to "create/spin up/add a worktree", a "new worktree", an "isolated build worktree", or a parallel checkout to build in without recompiling sculptcore from scratch. Populates submodules from their remotes (asking whether to require pinned commits be pushed, or to branch each submodule from its remote master) and registers the worktree with the cross-worktree sccache launcher so compiles hit the shared cache across worktrees.
---

# Create a build-ready worktree

A fresh worktree normally recompiles the heavy C++20 sculptcore tree (and the
node-addon) from scratch — minutes of clang. With sccache wired in (see
`sculptcore/build_files/native-clang.cmake`), a new worktree instead reconfigures
in seconds and every compile is a **cache hit**, as long as its
`SCCACHE_BASEDIRS` is set to its own root so paths normalize across worktrees.

This skill never touches the persistent `C:/dev/webgl-app-framework-agent`
worktree (it's reserved for secondary agent work and is often in use).

## Tool

`tools/new-worktree.mjs` (zero-dep Node ESM), run from any worktree of this repo:

```sh
node tools/new-worktree.mjs <name> [--base <ref>] [--branch <branch>] \
                                   [--submodules require-pushed|remote-master] [--no-emsdk]
```

- Creates the worktree at `<main-worktree>-<name>` (e.g.
  `C:/dev/webgl-app-framework-<name>`) on a new branch (`<name>` by default),
  branched from `--base` (default `master`).
- Populates submodules **from their own remotes** (it never fetches unpushed
  local-only commits from another worktree). `--submodules` selects the policy
  (default `require-pushed`):
  - `require-pushed` — `git submodule update --init --recursive` against the
    superproject's pinned commits, then verifies each is at its pin. If a pinned
    commit isn't reachable from its remote (e.g. local-only sculptcore work that
    was never pushed) the tool **fails** with a message naming the submodule and
    pointing at the two fixes (push it, or re-run with `remote-master`).
  - `remote-master` — ignores the pinned commits: runs
    `submodule update --init --recursive --remote` (checks out each submodule's
    remote master/default-branch tip) and puts each submodule on a new branch
    `<branch>` at that tip.
- Writes `worktree-env.ps1` and `worktree-env.sh` into the new worktree that
  export `SCCACHE_DIR` (shared cache at `%LOCALAPPDATA%\sccache`). It no longer
  sets `SCCACHE_BASEDIRS` — the cross-worktree launcher (below) computes that
  per-compile from the registry.
- Builds the cross-worktree sccache launcher (if stale) and registers the new
  worktree into the shared registry via `tools/sccache-wrapper/setup.mjs --root
  <new-worktree>`, so its first build is a cache hit and the shared server
  already knows about it.
- `worktree-env` surfaces `SCCACHE_SERVER_PIPE` (warns if unset). This global
  var selects sccache's Windows **named-pipe** server (set it once, e.g.
  `setx SCCACHE_SERVER_PIPE sccache-<user>`); the launcher inherits it and
  forwards it to every server it (re)starts. Without it sccache falls back to
  the TCP-port server, whose port can stay bound after the launcher kills the
  server on a new-worktree join — the stall the named-pipe mode exists to fix.
- Points WASM builds at the main worktree's emsdk via `SCULPTCORE_EMSDK_DIR`
  (set in `worktree-env`, honored by `configureEnv.mjs`), so they reuse the
  existing ~2.4 GB install instead of re-running `install-emsdk` (pass
  `--no-emsdk` to skip; auto-skips if the main worktree has no install).
  Nothing is placed inside the new worktree — no junction/symlink — so teardown
  can never reach the shared install. (An earlier junction approach was dropped
  precisely because `rm -rf` of a worktree would follow the junction and delete
  the real emsdk.)
- It does **not** build anything.

## Workflow

1. **Ask the user how submodules should be populated** (use `AskUserQuestion`)
   before running the tool — the choice maps directly to `--submodules`:
   - **Require pushed** (`require-pushed`, the default) — check out the pinned
     submodule commits; the run fails if any pin isn't on its remote. Pick this
     when the submodules are fully pushed and you want the new worktree to match
     the superproject's recorded state exactly.
   - **Branch from remote master** (`remote-master`) — ignore the pins and put
     each submodule on a fresh branch at its remote master tip. Pick this when
     submodule work is local-only/unpushed, or when you want to start new
     submodule work from the latest remote.

   Then run `node tools/new-worktree.mjs <name> [--submodules <mode>]`. (To base
   it on an in-progress feature branch instead of `master`, pass
   `--base <branch>`.)
2. `cd` into the new worktree and load the env **in the shell you'll build from**
   (env vars are per-shell):
   - PowerShell: `. .\worktree-env.ps1`
   - bash: `source worktree-env.sh`
3. Build via the usual dispatcher. A fresh worktree needs a few one-time setup
   steps first (node deps and the native-only prebuits, neither checked in):
   ```sh
   cd sculptcore
   pnpm i                                         # make.mjs deps (yargs, cmake-js, ...)
   node extern/wgpu_native/fetch.mjs              # wgpu-native headers/lib (sibling fetch script)
   node make.mjs fetch-wgpu-native                # native webgpu prebuilt (make.mjs alias)
   node make.mjs codegen                          # brush kernel headers (git-ignored; see below)
   node make.mjs configure native                 # look for: "sccache compiler launcher enabled"
   node make.mjs build native
   ```
   The `codegen` step is easy to miss: the compiled brush kernels
   (`source/brush/kernels/generated/*.brush.gen.h`) are **git-ignored generated
   files**, so they exist in the main worktree but are *not* carried into a fresh
   one. Without it the native build fails with
   `'../kernels/generated/draw.brush.gen.h' file not found`.

   The node-addon build (`node make.mjs node`) uses the same toolchain and is
   cached too. WASM builds are not cached (emcc runs through a python wrapper).

## Getting a feature branch's submodule commits into a new worktree

`--submodules require-pushed` populates submodules **only from their remotes**.
A worktree based on a feature branch therefore needs that branch's pinned
submodule commits to already exist on the submodule's remote. If you committed
sculptcore (or other submodule) work elsewhere, **push it to the remote first**,
e.g.:
```sh
git -C <other-worktree>/sculptcore push origin <branch>
```
If the commits are local-only and you don't want to push yet, use
`--submodules remote-master` instead: it skips the pins and branches each
submodule from its remote master tip. (There is no longer any cross-worktree
local-fetch recovery — that path was removed.)

## Why SCCACHE_BASEDIRS matters

sccache keys a compile on the preprocessed source, not on `-I` flags (those are
excluded from the hash). The only worktree-varying paths that reach the hash are
absolute paths baked into the preprocessed text (`# 1 "..."` line markers,
`__FILE__`). `SCCACHE_BASEDIRS` strips each worktree's own root from those before
hashing, so two worktrees at different absolute paths produce identical keys and
share one cache. Requires an sccache build new enough to support
`SCCACHE_BASEDIRS` (older sccache silently lacks it → per-worktree caching only).

`SCCACHE_BASEDIRS` is read by the sccache **server** at startup, and there is one
server per machine — so a single server can only normalize against the base
dirs it was born with.

## The cross-worktree launcher

`tools/sccache-wrapper/sccache_launcher.cc` (a tiny C++17 binary) removes the
"one basedir per server, bounce on switch" limitation by keeping the **union of
every live worktree's root** in `SCCACHE_BASEDIRS`, so one server caches for all
worktrees at once — including concurrent builds in different worktrees.

- It's wired as CMake's compiler launcher (`build_files/native-clang.cmake`
  prefers it over plain sccache; falls back if absent). On each compile it:
  scans the shared registry, **auto-deletes** any entry whose worktree no longer
  exists, unions the survivors into `SCCACHE_BASEDIRS`, and restarts the server
  **only** when the union gains a base dir it lacks (a brand-new worktree's first
  build) — never for a removal, so it won't disrupt a concurrent build. Then it
  execs the real sccache. Bookkeeping never fails the build.
- The binary and the registry (`<name>.<hash>.txt` files, plus `.applied` /
  `.lock` state) live in the shared sibling dir `C:/dev/sccache-worktrees`.
  `tools/sccache-wrapper/setup.mjs` builds the binary (with the project's
  clang++) and registers a worktree; it runs automatically from
  `make.mjs configure native` and `new-worktree.mjs`.
- **No manual `sccache --stop-server` when switching worktrees** — the launcher
  handles server lifecycle. The on-disk cache (`SCCACHE_DIR`) is shared
  regardless. Verified: a cold `sbrushc` build in one worktree makes the same
  build in a second worktree 100% cache hits.

## Teardown

```sh
git -C <main-worktree> worktree remove --force <new-worktree>
```
Commit, stash, or discard work in the worktree first. To also drop the branch:
`git -C <main-worktree> branch -D <branch>`.

`worktree remove` often fails with **`Directory not empty`** once you've built —
git deregisters the worktree but won't delete the leftover build artifacts
(`build/`, `node_modules/`, ...). Finish the teardown by deleting the directory
and pruning the registration:

```sh
# PowerShell
Remove-Item -Recurse -Force <new-worktree>
git -C <main-worktree> worktree prune
```

The shared sccache registry entry (`C:/dev/sccache-worktrees/<name>.<hash>.txt`)
is harmless to leave — the cross-worktree launcher auto-deletes any entry whose
worktree no longer exists on its next compile. Delete it by hand only if you want
the cleanup to be immediate.
