// Vercel serverless entry. SQLite lives in /tmp here — fine for a live demo,
// but /tmp is wiped on cold start, so this is NOT persistent storage. For
// real production data, swap DATABASE_URL to a hosted Postgres (see README).
//
// A pre-built SQLite file (schema + seed data, created locally via
// `prisma db push` + `npm run db:seed`) ships as a static asset and gets
// copied into /tmp on cold start. No CLI invocation at request time — the
// build only bundles what's actually imported, so shelling out to the
// Prisma CLI here doesn't work (it isn't traced into the deployment and
// npx tries, and fails, to download a fresh copy at runtime instead).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = '/tmp/dev.db';
if (!fs.existsSync(dest)) {
  fs.copyFileSync(path.join(here, '../prisma/template.db'), dest);
}

const { app } = await import('../src/app.js');
export default app;
