import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const folos = sqliteTable('folos', {
  url: text('url').primaryKey().notNull(),
  feedId: text('feed_id').notNull()
});
