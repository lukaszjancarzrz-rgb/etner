import { z } from 'zod';

const txt = z.string().trim();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD');
const opId = z.string().min(1).optional();

/** Jedna wartość komórki (slot). Pola nieużywane przez rodzaj są odrzucane przy normalizacji na serwerze. */
export const scheduleSlotSchema = z.discriminatedUnion('rodzaj', [
  z.object({ rodzaj: z.literal('zlecenie'), jobId: z.string().min(1, 'Wybierz zlecenie'), polDnia: z.boolean() }),
  z.object({ rodzaj: z.literal('kod'), kod: txt.min(1, 'Wybierz kod'), polDnia: z.boolean() }),
  z.object({ rodzaj: z.literal('tekst'), tekst: txt.min(1, 'Wpisz tekst').max(200, 'Tekst jest za długi'), polDnia: z.boolean() }),
]);
export type ScheduleSlot = z.infer<typeof scheduleSlotSchema>;

/** Pełna komórka: 0–2 wartości; dwie tylko, gdy obie są na pół dnia. Pusta tablica = wyczyść. */
export const scheduleCellSchema = z.array(scheduleSlotSchema).max(2, 'Najwyżej dwie wartości w dniu')
  .refine((a) => a.length < 2 || a.every((s) => s.polDnia), 'Dwie wartości tylko po pół dnia');
export const scheduleNoteValueSchema = z.object({ tekst: txt.max(500, 'Uwaga jest za długa') });
export type ScheduleProposal = z.infer<typeof scheduleCellSchema> | z.infer<typeof scheduleNoteValueSchema>;

export const scheduleRangeQuerySchema = z.object({ from: day, to: day });

export const scheduleDraftSchema = z.object({
  opId,
  from: day,
  to: day,
  people: z.array(z.string().min(1)).min(1, 'Wybierz osoby'),
  value: z.union([scheduleCellSchema, scheduleNoteValueSchema]),
  workdaysOnly: z.boolean().default(false),
});
export type ScheduleDraftInput = z.infer<typeof scheduleDraftSchema>;

export const scheduleApproveSchema = z.object({
  opId,
  items: z.array(z.object({ key: z.string().min(1), proposalHash: z.string().min(1) })).optional(),
});
export const scheduleDiscardSchema = z.object({ opId, keys: z.array(z.string().min(1)).optional() });
