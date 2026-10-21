import { z } from 'zod';

export type Role = 'pracownik' | 'admin';

export type User = {
  id: string;
  name: string;
  role: Role;
  perms: string[];
  ekipa: string | null;
  scheduleCol: string | null;
  active: boolean;
};

export type Me = Pick<User, 'id' | 'name' | 'role' | 'perms' | 'ekipa' | 'scheduleCol'>;

const opId = z.string().min(1).optional();
const nazwa = z.string().trim().min(1, 'Podaj nazwę');
const opt = z.string().trim().min(1).nullish();

export const loginSchema = z.string().trim().toLowerCase().regex(/^[a-ząćęłńóśźż0-9._-]{2,32}$/, 'Login: 2–32 znaków (litery, cyfry, . _ -)');
export const hasloSchema = z.string().min(8, 'Hasło musi mieć co najmniej 8 znaków').max(200);

export const userCreateSchema = z.object({
  opId, login: loginSchema, haslo: hasloSchema, name: nazwa, role: z.enum(['pracownik', 'admin']).default('pracownik'),
  perms: z.array(z.string()).default([]), ekipa: opt, scheduleCol: opt,
});
export const userUpdateSchema = z.object({
  opId, login: loginSchema.optional(), name: nazwa.optional(), role: z.enum(['pracownik', 'admin']).optional(),
  perms: z.array(z.string()).optional(), ekipa: opt, scheduleCol: opt, active: z.boolean().optional(),
});
export const schedulePersonSchema = z.object({
  opId, nazwa, kolejnosc: z.number().int().optional(), userId: z.string().nullish(),
});
export const schedulePersonUpdateSchema = schedulePersonSchema.partial();
export const userPasswordSchema = z.object({ opId, haslo: hasloSchema });
export const ownPasswordSchema = z.object({ stare: z.string().min(1).max(200), nowe: hasloSchema });
