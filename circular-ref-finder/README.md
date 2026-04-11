# Circular Reference Finder

A command-line tool to detect circular import dependencies in TypeScript/JavaScript codebases using the TypeScript Compiler API.

## Features

- Detects circular import/module dependencies
- Supports TypeScript and JavaScript files (.ts, .tsx, .js, .jsx, .mts, .cts, .mjs, .cjs)
- Configurable include/exclude patterns
- Clear console output showing dependency chains
- Exit codes for CI/CD integration

## Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build
```

## Usage

```bash
# Analyze current directory
node dist/index.js

# Analyze specific directory
node dist/index.js ./src

# With options
node dist/index.js --dir ./src --exclude "test,*.spec.ts" --verbose

# Show help
node dist/index.js --help
```

## Command Line Options

- `-d, --dir <path>` - Directory to analyze (default: current directory)
- `-e, --exclude <patterns>` - Comma-separated patterns to exclude (default: node_modules,dist,build,.git)
- `-i, --include <patterns>` - Comma-separated patterns to include (optional)
- `-v, --verbose` - Enable verbose output
- `-h, --help` - Show help message

## Examples

```bash
# Basic usage
node dist/index.js

# Analyze src directory
node dist/index.js ./src

# Exclude test files
node dist/index.js -e "test,*.spec.ts,*.test.ts"

# Include only specific patterns
node dist/index.js -i "src/**/*.ts"

# Verbose mode
node dist/index.js -v
```

## Exit Codes

- `0` - No circular dependencies found
- `1` - Circular dependencies found or error occurred

## How It Works

1. **File Discovery**: Scans the target directory for TypeScript/JavaScript files
2. **Dependency Analysis**: Uses TypeScript Compiler API to parse import/export statements
3. **Graph Building**: Constructs a dependency graph from the imports
4. **Cycle Detection**: Uses depth-first search (DFS) to find circular dependencies
5. **Output**: Displays all detected cycles with file paths

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Type check
pnpm typecheck

# Test on a directory
pnpm test
```

## Project Structure

```
src/
  ├── index.ts          # Main entry point and CLI
  ├── cli.ts            # CLI argument parsing and output formatting
  ├── analyzer.ts       # Dependency graph builder using TypeScript API
  ├── cycle-detector.ts # Cycle detection algorithm (DFS)
  └── types.ts          # TypeScript type definitions
```

## License

MIT
