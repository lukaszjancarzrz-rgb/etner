import { can } from '../../core/permissions.js';
import type { ModuleDef } from '../../core/registry.js';
import { routes } from './routes.js';
import { scheduleDrafts, scheduleEntries, scheduleNotes } from './schema.js';

/** Wpisy i uwagi widzi każdy; szkice tylko z uprawnieniem `szkice`. */
export const harmonogram: ModuleDef = {
  name: 'harmonogram',
  routes,
  tables: { schedule_entries: scheduleEntries, schedule_notes: scheduleNotes, schedule_drafts: scheduleDrafts },
  visibleTo: (user, ch) => ch.entity !== 'schedule_drafts' || can(user, 'szkice'),
};
