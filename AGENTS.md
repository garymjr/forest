# AGENTS.md

## Versioning (IMPORTANT)

**Any code changes must update the version in BOTH places using semantic versioning:**
- Update `version` in `package.json`
- Update `VERSION` constant in `index.ts`

Example: `0.1.0` → `0.2.0` (minor), `0.1.1` (patch), `1.0.0` (major)

## Build, Lint & Test

- **Run**: `bun run dev` or `bun ./index.ts`
- **Build**: `bun run build` (outputs standalone binary)
- **Test**: `bun test` (all tests), or `bun test index.test.ts` (single file)
- **Type check**: `bunx tsc --noEmit` (strict TypeScript mode enabled)

## Code Style

- **Imports**: ES6 imports; organize with types first, then Bun APIs, then local imports
- **Formatting**: ESNext target, strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`)
- **Typing**: Always type functions and exports; use `unknown` before narrowing, not `any`
- **Naming**: camelCase for variables/functions, PascalCase for interfaces/types
- **Shell commands**: Use `Bun.$` for executing git/system commands; capture with `.text()` or `.quiet()`
- **Errors**: Never throw in command handlers; return typed `CommandResult` instead

## CLI Patterns

- All commands return `CommandResult`: `{ success: boolean; data?: any; error?: { code, message, suggestion? } }`
- Support `--json` flag for structured output; output JSON if present, human-readable text otherwise
- Exit codes: 0=success, 1=runtime error, 2=validation error
- Use `process.argv.slice(2)` for args; parse flags before positional arguments

## Reference

See [CLAUDE.md](./CLAUDE.md) for Bun best practices, APIs, and full examples.
