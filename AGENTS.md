# Agent instructions

## Setup commands

- Install deps: `pnpm i`
- Install language server: `pnpm install -g @vtsls/language-server typescript && pnpm install -g typescript-language-server && claude -p "/plugin install typescript-lsp@claude-plugins-official"`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Start web server: `pnpm serv`

## Generating type annotations

When generating type annotations:
- Do not add annotations if type can be inferred, e.g.
  + Assignment to known typed variables
  + Assignment to new operator
- Do not use the any type
- Do not use single-line control blocks, e.g. `if (test) action()` is bad,
  `if (test) { action() }` is good.

## Code style

- We have a polyfilter for `Set.filter` and `Set.map`.  These are okay to use.
- Do not transform the `Set.filter` to a spread-to-array-then-filter pattern,
  e.g. do not turn `set.filter(n => n.test(0))` into `[...set].filter(n => n.test(0))`
  Also do not transform into a `Array.from` pattern either.
- Typescript strict mode
- Single quotes, no semicolons
- Use `git mv` when renaming files, such as
  JS files to TS ones.
- Read contents of `documentation/codeStyle.md`

## Testing instructions

- Run tests with `pnpm test`
- Run specific test with `pnpm test [test name]`
- Update snapshots with `pnpm test -u`
- Run eslint with `pnpm eslint --fix [path]` it will
  lint code and fix some problems

## PR instructions

- Title format: [<project_name>] <Title>
- Always run `pnpm test` before committing
