import path from 'node:path';

import { migrate } from 'drizzle-sqlite/migrator';
import { drizzle, NodeSQLiteDatabase } from 'drizzle-sqlite';

import { biliNovels, biliVolumes, biliChapters, folos } from './schema';

export async function connectDatabase(file: string): Promise<
  NodeSQLiteDatabase<{
    biliNovels: typeof biliNovels;
    biliVolumes: typeof biliVolumes;
    biliChapters: typeof biliChapters;
    folos: typeof folos;
  }>
> {
  const database = drizzle({
    connection: file,
    schema: {
      biliNovels,
      biliVolumes,
      biliChapters,
      folos
    }
  });

  await migrateDatabase(database);

  return database;
}

export async function migrateDatabase(database: Awaited<ReturnType<typeof connectDatabase>>) {
  migrate(database, { migrationsFolder: path.resolve(import.meta.dirname, '../drizzle/') });
}

const databaseFile = process.env.DATABASE_FILE || 'lnovel.db';

export const database = await connectDatabase(databaseFile);
