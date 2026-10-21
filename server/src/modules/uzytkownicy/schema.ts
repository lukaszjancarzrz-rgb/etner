import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { baseCols, users } from '../../core/schema-base.js';

// `users` leży w core (logowanie), a ten moduł jest jego właścicielem w sensie widoczności zmian.
export { users };

export const schedulePeople = sqliteTable('schedule_people', {
  ...baseCols(),
  kolejnosc: integer('kolejnosc').notNull().default(0),
  nazwa: text('nazwa').notNull(),
  userId: text('user_id').references(() => users.id),
});
