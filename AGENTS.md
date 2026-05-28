# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before making changes, and follow the **mandatory post-change checklist** at the bottom after every edit.

## What this project is

**Money Hater** — a full-stack expense tracker.

- **Frontend**: React 19 + TypeScript + Vite (`rolldown-vite`), TanStack Query, React Router, Tailwind CSS v4, Recharts, Lucide icons. Lives in `src/`.
- **Backend**: Cloudflare Workers + Hono. Lives in `worker/`.
- **Database**: Cloudflare D1 (SQLite) via Prisma with the D1 adapter. Schema in `prisma/schema.prisma`.
- **Storage**: Cloudflare R2 for receipt attachments.
- **Auth**: short-lived access JWT (1h) + opaque refresh token, both in HttpOnly cookies; API tokens (`mht_…`) as `Authorization: Bearer` for programmatic access. See `worker/middleware.ts`, `worker/cookies.ts`, `worker/sessions.ts`, `worker/tokens.ts`.

Deeper design notes live in `.agent/` (ARCHITECTURE.md, SECURITY.md, PRISMA_D1_SETUP.md, etc.). Consult them for subsystem details.

## Project layout

```
src/                 Frontend
  components/         React components
  context/            React context providers + hooks (Auth, Account, Notification)
  hooks/              TanStack Query hooks (useExpenses, useApiTokens, useSessions, …)
  pages/              Route-level page components
  services/           API client (api.ts holds apiFetch/apiJson), Gemini, analysis
  lib/                queryClient, formValidation (zod), toast
  types.ts            Shared types
worker/              Cloudflare Worker (Hono)
  index.ts            Main router + scheduled() cron handler
  middleware.ts       Unified auth (JWT cookie OR API token)
  auth.ts             JWT sign/verify, password hashing
  sessions.ts         Session create/rotate/revoke/gc
  cookies.ts          HttpOnly cookie helpers
  tokens.ts           API/refresh token generation + hashing
  accounts.ts budgets.ts api-tokens.ts   Sub-routers
  validation.ts       Zod schemas (the canonical request validation)
  __tests__/          Vitest worker tests
migrations/          D1 SQL migrations (runtime source of truth, numbered NNNN_*.sql)
prisma/              Prisma schema + (legacy) prisma migrations
```

## Coding style

- **Formatting is enforced by Prettier** (`.prettierrc.json`): single quotes, semicolons, trailing commas (`all`), 100-char print width, 2-space indent, always-parens arrows, LF line endings. Never hand-format — run the formatter (see checklist).
- **TypeScript**: prefer precise types; avoid `any`. Use `_`-prefixed names for intentionally-discarded variables (the lint rule ignores them).
- **Comments**: write them only when the *why* is non-obvious (a constraint, an invariant, a workaround). Don't narrate what the code does. Match the terse, purposeful comment style already in `worker/`.
- **No new dependencies** without a clear need; this ships to a Workers bundle, keep it lean.
- **Reuse existing utilities** rather than re-implementing: `getPrisma` (`worker/db.ts`), `getAuthUser`/`authMiddleware`/`jwtOnly` (`worker/middleware.ts`), zod schemas in `worker/validation.ts`, `apiFetch`/`apiJson` (`src/services/api.ts`), TanStack Query hook patterns in `src/hooks/`.

### Backend practices

- All request bodies are validated with zod via `@hono/zod-validator`; add or extend a schema in `worker/validation.ts` rather than parsing by hand.
- Protected routes use `authMiddleware`; token/session management routes use `jwtOnly`. `getAuthUser(c)` returns `{ userId, email, username, authKind, … }`.
- Never store secrets/tokens in plaintext — hash with `hashToken` (`worker/tokens.ts`).
- Scope every query by `userId`; users must only ever see their own data.

### Frontend practices

- All API calls go through `apiFetch`/`apiJson` in `src/services/api.ts` (handles cookies, 401→refresh→retry). Do **not** add `Authorization` headers for the logged-in user or read tokens from `localStorage` — auth is cookie-based.
- Server state goes through TanStack Query hooks in `src/hooks/`; follow the existing `useExpenses.ts` pattern.

### Database / migrations

- `migrations/*.sql` (numbered, e.g. `0012_add_api_tokens_and_sessions.sql`) is the **runtime source of truth**, applied via `wrangler d1 migrations apply`.
- When you change `prisma/schema.prisma`, also add a matching D1 SQL migration, then run `npx prisma generate` (needs `DATABASE_URL`, e.g. `DATABASE_URL="file:./dev.db"`).
- Apply locally with `npx wrangler d1 migrations apply money-hater-db --local`.

## Commands

| Task | Command |
| --- | --- |
| Install deps | `npm install` |
| Frontend dev server | `npm run dev` |
| Worker dev server | `npm run dev:worker` |
| **Compile / typecheck** | `npm run typecheck` (`tsc -b --noEmit`) |
| Production build | `npm run build` |
| **Run tests** | `npm test` (Vitest, runs once) |
| Watch tests | `npm run test:watch` |
| **Lint** | `npm run lint` (`eslint .`) |
| **Check formatting** | `npm run format:check` |
| **Fix formatting** | `npm run format` (`prettier --write .`) |
| Regenerate Prisma client | `DATABASE_URL="file:./dev.db" npx prisma generate` |

Tests are split into two Vitest projects: `frontend` (jsdom, `src/**`) and `worker` (node, `worker/**`).

## CI gate (must pass before merge)

`.github/workflows/deploy.yml` runs, in order, on every PR to `main`:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

`format:check` runs `prettier --check .` over the **whole repo**, so any formatting drift anywhere fails the build, not just in files you touched.

A Husky `pre-commit` hook runs `lint-staged` (eslint --fix + prettier --write on staged files), but it only covers staged files — it is **not** a substitute for the full checks below.

## MANDATORY post-change checklist

After **every** set of changes — before reporting work as done or committing — run these and make sure they all pass:

```bash
npm run format        # fix formatting (writes changes)
npm run lint          # 0 errors (pre-existing warnings are acceptable)
npm run typecheck     # must be clean
npm test              # all tests pass
```

Then, if you changed anything that runs in the browser or worker, build it:

```bash
npm run build
```

Rules:

- **Always run `npm run format` after editing**, then re-stage the formatted files. Do not leave formatting drift — CI's whole-repo `prettier --check .` will fail otherwise.
- If you add or change behavior, add or update tests under `src/**` or `worker/__tests__/**`.
- Fix the root cause of failures; never bypass hooks (`--no-verify`) or silence checks to make them pass.
- Keep changes scoped: don't reformat or refactor unrelated files in a feature commit (if you must touch pre-existing formatting drift to get CI green, do it in a separate `chore:` commit).
