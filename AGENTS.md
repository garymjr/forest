# AGENTS.md

## Build, Lint & Test

- **Run**: `bun run index.ts` or `bun index.ts`
- **Build**: `bun build ./index.ts` (or `.tsx`, `.html`, `.css`)
- **Test**: `bun test` (runs `*.test.ts` and `*.spec.ts` files)
- **Single test**: `bun test --testNamePattern="test name"` or filter by file
- **Type check**: TypeScript strict mode enabled; run `bunx tsc --noEmit` to validate
- **Hot reload dev**: `bun --hot ./index.ts` (enables HMR for frontend/backend changes)

## Code Style

- **Imports**: Use ES6 imports; Bun loads `.env` automatically
- **Formatting**: ESNext target, strict TypeScript mode enabled (`strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`)
- **Typing**: Always type functions and module exports; use `unknown` before narrowing, not `any`
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Errors**: Throw typed errors; avoid silent failures; prefer explicit error handling over try/catch wrapping
- **React**: Use React 18+ with JSX syntax; import from "react" explicitly
- **Server**: Use `Bun.serve()` with routes object, not Express; support WebSockets natively
- **Database**: Use `bun:sqlite` (not better-sqlite3), `Bun.sql` (not pg), `Bun.redis` (not ioredis)

## Cursor Rules

See [CLAUDE.md](./CLAUDE.md) for detailed Bun best practices and full API examples.
