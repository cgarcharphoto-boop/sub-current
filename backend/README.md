# Subcurrent Backend

Real API for the Subcurrent app — replaces the front-end prototype's simulated flows with actual server-backed logic. SQLite + Prisma by default (zero-config, real persistence), Express, JWT auth. Same architecture as its sibling (`cbh-backend` for ColoradoBassHeads) — these are separate companies, not shared infrastructure, just built the same proven way.

## What's actually real right now (no credentials needed)

- **Auth** — fan + owner accounts, bcrypt password hashing, JWT tokens.
- **Events, tiers, lineups** — real DB-backed CRUD, oversell protection enforced in a transaction.
- **Rotating ticket codes** — HMAC-based code that changes every 10s and is verified server-side (`src/services/tickets.js`), replacing a cosmetic-only canvas animation with something a door scanner can actually trust.
- **Door check-in** — scan endpoint returns `valid` / `already_used` / `wrong_event` / `invalid_code`, logged for a real audit trail.
- **Location-drop privacy** — venue address withheld by the API itself until checkout or the configured drop time.
- **Web push** — real notifications via VAPID, no third-party account required. Run `npm run vapid:generate` once.
- **15 passing tests** (`npm test`).

## What needs a credential before it's live (mock mode until then)

| Feature | Env var | Mock behavior today |
|---|---|---|
| Payments | `STRIPE_SECRET_KEY` | Orders succeed instantly, no real charge |
| SMS | `TWILIO_ACCOUNT_SID` / `_AUTH_TOKEN` / `_FROM_NUMBER` | Logs to console instead of sending |
| AI flyer reading | `ANTHROPIC_API_KEY` | Returns a fixed sample set of fields |

Check `/health` any time to see which integrations are live vs. mocked.

## Run it

```bash
npm install
cp .env.example .env            # fill in JWT_SECRET: openssl rand -hex 32
npm run vapid:generate          # paste the output into .env
npm run db:push                 # creates prisma/dev.db
npm run db:seed                 # seeds Re:Turnal Nights + the real lineup
npm run dev                     # http://localhost:4000
npm test                        # 15 tests, isolated test DB
```

Owner login: `owner@subcurrent.app`. The password is never committed. The seed uses `OWNER_PASSWORD` if set, otherwise it generates a strong one and saves it to `.owner-credentials` at the repo root (git-ignored). Change it any time from the Live panel's Owner tab, which also signs out every other owner session.

## Deploying

Vercel builds this folder on every push to `main`. The database mode follows `DATABASE_URL`:

- **SQLite file URL (demo mode).** A pre-built database (`prisma/template.db`) is copied into `/tmp` on cold start. Zero setup, but data resets whenever the server sleeps.
- **Postgres URL (permanent).** `scripts/prisma.js` switches Prisma to Postgres at build time. Same code, same tests (`npm run test:pg` runs the full suite against a local Postgres).

To move production to Postgres in one step:

```bash
backend/scripts/go-postgres.sh 'postgresql://USER:PASS@HOST:PORT/DB'
```

It creates the tables, seeds the shows and owner account (password saved to `.owner-credentials`, git-ignored), sets `DATABASE_URL` on the Vercel project, and pushes an empty commit to rebuild.

## Connecting the front-end

`docs/index.html` is generated — per this repo's `CLAUDE.md`, it shouldn't be hand-edited for big changes. So this backend isn't wired into the generated bundle's internals. Instead, `docs/connect.js` is a small, fully isolated script (own DOM, own state, no dependency on the generated app's internals) that health-checks this API and offers a real "Enable push notifications" control. It's additive — safe to keep across regenerations of `index.html`, and safe to delete if the next regen supersedes it.
