// ============================================================
// db/client.ts — Drizzle ORM Client (Supabase PostgreSQL)
// ============================================================
// This file initialises the Drizzle client using the Supabase
// connection string.  Import `db` anywhere in server code.
//
// Required environment variables (set in .env or Railway):
//   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
//
// The URL above uses the Supabase Session Pooler (port 6543).
// For direct connections use port 5432 (not recommended in production
// because it bypasses connection pooling).
// ============================================================

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazy initialisation — we do NOT throw at module load time.
// This lets the server start and serve static files even if DATABASE_URL
// is not yet configured. API routes will return a 503 until the variable is set.
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to your Railway Variables tab:\n' +
      '  DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
    );
  }
  const client = postgres(url, {
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 10 : 1,
  });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy so existing `db.query.xxx` calls work without changes.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type DB = typeof db;
