# Agent instructions

## Setup commands

- Install deps: `pnpm i`
- Install language server: `pnpm install -g @vtsls/language-server typescript && pnpm install -g typescript-language-server && claude -p "/plugin install typescript-lsp@claude-plugins-official"`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Start web server: `pnpm serv`

## Code style

- Typescript strict mode
- Single quotes, no semicolons
- Use `git mv` when renaming files, such as
  JS files to TS ones.

## Testing instructions

- Run tests with `pnpm test`
- Run specific test with `pnpm test [test name]`
- Update snapshots with `pnpm test -u`

## PR instructions

- Title format: [<project_name>] <Title>
- Always run `pnpm test` before committing
