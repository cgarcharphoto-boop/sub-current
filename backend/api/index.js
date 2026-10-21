// Vercel serverless entry.
//
// With a Postgres DATABASE_URL (production), data is permanent and nothing
// happens here. With a SQLite file URL (the zero-config demo), a pre-built
// database (schema + seed) ships as a static asset and is copied into /tmp on
// cold start. /tmp is wiped between cold starts, so that mode is demo-only.
// No Prisma CLI at request time: the build only bundles imported files, so
// shelling out to the CLI doesn't work here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL || '';
if (url.startsWith('file:')) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Absolute file URLs are used as-is; anything else keeps the original /tmp path.
  const raw = url.slice('file:'.length);
  const dest = raw.startsWith('/') ? raw : '/tmp/dev.db';
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(here, '../prisma/template.db'), dest);
  }
}

const { app } = await import('../src/app.js');
export default app;
