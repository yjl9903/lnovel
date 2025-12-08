import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const biliNovels = sqliteTable('bili_novels', {
  nid: integer('nid').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  cover: text('cover'),
  labels: text('label', { mode: 'json' }).$type<string[]>().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  done: integer('done', { mode: 'boolean' }).default(false),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
});

export const biliVolumes = sqliteTable('bili_volumes', {
  vid: integer('vid').primaryKey(),
  nid: integer('nid')
    .notNull()
    .references(() => biliNovels.nid),
  name: text('name').notNull(),
  volume: text('volume').notNull(),
  description: text('description').notNull(),
  cover: text('cover'),
  labels: text('label', { mode: 'json' }).$type<string[]>().notNull().default([]),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
});

export const biliChapters = sqliteTable('bili_chapters', {
  cid: integer('cid').primaryKey(),
  vid: integer('vid')
    .notNull()
    .references(() => biliVolumes.vid),
  nid: integer('nid')
    .notNull()
    .references(() => biliNovels.nid),
  title: text('title').notNull(),
  content: text('content').notNull(),
  images: text('images', { mode: 'json' })
    .$type<Array<{ src: string; alt: string | null | undefined }>>()
    .notNull()
    .default([]),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull()
});
