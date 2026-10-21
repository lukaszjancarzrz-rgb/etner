import { describe, expect, it } from 'vitest';
import { jobMessages } from './Pumble.js';

describe('Pumble', () => {
  it('jobMessages: tylko to zlecenie, od najstarszej', () => {
    const m = (id: string, jobId: string, sentAt: string) => ({ id, jobId, sentAt });
    expect(jobMessages([m('b', 'j1', '2026-10-21T10:00:00Z'), m('x', 'j2', '2026-10-21T09:00:00Z'), m('a', 'j1', '2026-10-21T09:00:00Z')], 'j1').map((x) => x.id)).toEqual(['a', 'b']);
  });
});
