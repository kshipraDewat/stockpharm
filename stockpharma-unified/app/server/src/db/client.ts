import { env } from '../env.js';

let _db: Awaited<ReturnType<typeof createDb>> | null = null;

async function openPgliteDataDir(resolvedPath: string) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdirSync, renameSync, existsSync } = await import('fs');
  const { dirname } = await import('path');

  mkdirSync(dirname(resolvedPath), { recursive: true });

  const tryOpen = async () => {
    const client = new PGlite(resolvedPath);
    await client.query('SELECT 1');
    return client;
  };

  try {
    return await tryOpen();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const recoverable = msg.includes('Aborted') || msg.includes('initdb');
    if (!recoverable || !existsSync(resolvedPath)) throw e;

    const backup = `${resolvedPath}.corrupt-${Date.now()}`;
    console.warn(`PGlite data at ${resolvedPath} is unreadable; moving to ${backup} and creating a fresh database.`);
    renameSync(resolvedPath, backup);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    return tryOpen();
  }
}

async function createDb() {
  if (env.DATABASE_URL.startsWith('pglite:')) {
    const rawPath = env.DATABASE_URL.replace('pglite:', '');
    const useMemory = rawPath === 'memory' || rawPath === './memory';
    const { drizzle } = await import('drizzle-orm/pglite');
    const { schema } = await import('./schema.js');

    let client;
    if (useMemory) {
      const { PGlite } = await import('@electric-sql/pglite');
      client = new PGlite();
    } else {
      const { resolve, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      // Resolve relative to STOCKIST-PHARMACY project root (server/src/db → ../../..).
      const resolvedPath = resolve(__dirname, '../../..', rawPath.replace(/^\.\//, ''));
      client = await openPgliteDataDir(resolvedPath);
    }
    return drizzle(client, { schema });
  } else {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { schema } = await import('./schema.js');
    const pool = new Pool({ connectionString: env.DATABASE_URL });
    return drizzle(pool, { schema });
  }
}

export async function getDb() {
  if (!_db) _db = await createDb();
  return _db;
}

export type Db = Awaited<ReturnType<typeof getDb>>;
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbClient = Db | DbTransaction;
