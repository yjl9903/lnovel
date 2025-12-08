import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { biliNovels, biliVolumes, biliChapters, folos } from './schema';

export async function connectDatabase(file: string): Promise<
  BetterSQLite3Database<{
    biliNovels: typeof biliNovels;
    biliVolumes: typeof biliVolumes;
    biliChapters: typeof biliChapters;
    folos: typeof folos;
  }>
> {
  const client = new Database(file);

  const database = drizzle(client, {
    schema: {
      biliNovels,
      biliVolumes,
      biliChapters,
      folos
    }
  });

  migrateDatabase(database);

  return database;
}

export async function migrateDatabase(database: Awaited<ReturnType<typeof connectDatabase>>) {
  migrate(database, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle/') });
}

export const database = await connectDatabase(process.env.DATABASE_FILE || 'lnovel.db');
