import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Kolumny wspólne każdej tabeli: ULID, ślad autora i czasu, miękkie usuwanie (ISO UTC). */
export const baseCols = () => ({
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by'),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const firmy = sqliteTable('firmy', {
  ...baseCols(),
  nazwa: text('nazwa').notNull(),
  skrot: text('skrot').notNull(),
  prefiksZ: text('prefiks_z').notNull().default('Z'),
  prefiksL: text('prefiks_l').notNull().default('L'),
});

export const users = sqliteTable('users', {
  ...baseCols(),
  name: text('name').notNull(),
  role: text('role', { enum: ['pracownik', 'admin'] }).notNull(),
  perms: text('perms', { mode: 'json' }).$type<string[]>().notNull().default([]),
  login: text('login').unique(),
  passwordHash: text('password_hash'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ekipa: text('ekipa'),
  scheduleCol: text('schedule_col'),
  /** Małymi literami; po nim szukamy konta w Pumble. */
  email: text('email'),
  /** Zdjęcie 256 px WebP w magazynie plików; brak = inicjały. */
  avatarKey: text('avatar_key'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  device: text('device'),
  createdAt: text('created_at').notNull(),
  lastSeen: text('last_seen').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  ...baseCols(),
  userId: text('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  device: text('device'),
});

export const changes = sqliteTable('changes', {
  seq: integer('seq').primaryKey({ autoIncrement: true }),
  at: text('at').notNull(),
  userId: text('user_id'),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action', { enum: ['create', 'update', 'delete'] }).notNull(),
  before: text('before', { mode: 'json' }),
  after: text('after', { mode: 'json' }),
}, (t) => [index('changes_entity').on(t.entity, t.entityId)]); // zmiany jednego rekordu („nowe” przy polach karty zlecenia)

export const opIds = sqliteTable('op_ids', {
  opId: text('op_id').primaryKey(),
  userId: text('user_id').notNull(),
  at: text('at').notNull(),
  result: text('result', { mode: 'json' }),
});

export const errors = sqliteTable('errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: text('at').notNull(),
  where: text('where').notNull(),
  message: text('message').notNull(),
  userId: text('user_id'),
});

/** Ustawienia firmy (klucz-wartość), np. `rano_godzina`. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
