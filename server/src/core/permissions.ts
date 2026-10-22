import type { User } from '@etner/shared';

export type Perm = 'admin' | 'finanse' | 'leady' | 'zadania' | 'szkice';

/** Jedyne miejsce, w którym decydujemy o uprawnieniach. */
export function can(user: Pick<User, 'role' | 'perms'>, perm: Perm): boolean {
  if (user.role !== 'admin') return false;
  return perm === 'finanse' ? user.perms.includes('finanse') : true;
}
