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
