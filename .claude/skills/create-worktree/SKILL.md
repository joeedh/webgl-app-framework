---
name: create-worktree
description: Create a new git worktree wired for fast cached builds. Use when the user wants to "create/spin up/add a worktree", a "new worktree", an "isolated build worktree", or a parallel checkout to build in without recompiling sculptcore from scratch. Runs the submodule-sync recovery and sets the sccache env (SCCACHE_BASEDIRS, SCCACHE_DIR) so compiles hit the shared cache across worktrees.
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
node tools/new-worktree.mjs <name> [--base <ref>] [--branch <branch>] [--no-emsdk]
```

- Creates the worktree at `<main-worktree>-<name>` (e.g.
  `C:/dev/webgl-app-framework-<name>`) on a new branch (`<name>` by default),
  branched from `--base` (default `master`).
- Runs `git submodule update --init --recursive`, and on the expected
  `not our ref` failures (sculptcore and sculptcore/source/litestl are pinned to
  local-only commits) fetches that exact commit from the **main** worktree's
  matching submodule and resumes — the recovery dance from CLAUDE.md, automated.
- Writes `worktree-env.ps1` and `worktree-env.sh` into the new worktree that
  export `SCCACHE_DIR` (shared cache at `%LOCALAPPDATA%\sccache`) and
  `SCCACHE_BASEDIRS` (this worktree's own root, forward slashes, no trailing
  slash — covers both the sources and the nested `sculptcore/build/native`).
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

1. From the repo, run `node tools/new-worktree.mjs <name>`. (To base it on an
   in-progress feature branch instead of `master`, pass `--base <branch>`.)
2. `cd` into the new worktree and load the env **in the shell you'll build from**
   (env vars are per-shell):
   - PowerShell: `. .\worktree-env.ps1`
   - bash: `source worktree-env.sh`
3. Build via the usual dispatcher. A fresh worktree needs two one-time setup
   steps first (node deps and the native-only prebuilt, neither checked in):
   ```sh
   cd sculptcore
   pnpm i                           # make.mjs deps (yargs, cmake-js, ...)
   node make.mjs fetch-wgpu-native  # native webgpu prebuilt
   node make.mjs configure native   # look for: "sccache compiler launcher enabled"
   node make.mjs build native
   ```
   The node-addon build (`node make.mjs node`) uses the same toolchain and is
   cached too. WASM builds are not cached (emcc runs through a python wrapper).

## Sharing a submodule commit into a new worktree

The tool recovers each worktree's pinned submodule commits by fetching them from
the **main** worktree's matching submodule. A new worktree based on a feature
branch therefore needs that branch's submodule commit to already exist in the
main worktree's submodule. If you committed sculptcore work in another worktree,
push it into main first, e.g.:
```sh
git -C <other-worktree>/sculptcore push <main>/sculptcore <branch>:refs/heads/<branch>
```

## Why SCCACHE_BASEDIRS matters

sccache keys a compile on the preprocessed source, not on `-I` flags (those are
excluded from the hash). The only worktree-varying paths that reach the hash are
absolute paths baked into the preprocessed text (`# 1 "..."` line markers,
`__FILE__`). `SCCACHE_BASEDIRS` strips each worktree's own root from those before
hashing, so two worktrees at different absolute paths produce identical keys and
share one cache. Requires an sccache build new enough to support
`SCCACHE_BASEDIRS` (older sccache silently lacks it → per-worktree caching only).

`SCCACHE_BASEDIRS` is read by the sccache **server** at startup, and there is one
server per machine. After loading a different worktree's env, run
`sccache --stop-server` once so the next compile starts a server with that
worktree's basedir (the on-disk cache in `SCCACHE_DIR` is shared regardless, so
nothing is lost). Verified end-to-end: a cold `sbrushc` build in one worktree
makes the same build in a second worktree 100% cache hits.

## Teardown

```sh
git -C <main-worktree> worktree remove <new-worktree>
```
Commit, stash, or discard work in the worktree first. To also drop the branch:
`git -C <main-worktree> branch -D <branch>`.
