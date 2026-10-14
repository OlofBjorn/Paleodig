import { pgTable, uuid, integer, text, timestamp } from 'drizzle-orm/pg-core';

export const gameSessions = pgTable('game_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  money: integer('money').notNull().default(100),
  status: text('status').notNull().default('active'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
});