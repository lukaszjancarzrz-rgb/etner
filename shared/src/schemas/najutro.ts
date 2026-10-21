import { z } from 'zod';

const txt = z.string().trim();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie RRRR-MM-DD');

export const checklistCreateSchema = z.object({
  opId: z.string().min(1).optional(),
  ekipa: txt.min(1, 'Podaj ekipę'),
  dzien: day,
  tekst: txt.min(1, 'Wpisz, co zabrać').max(500, 'Tekst jest za długi'),
});
export type ChecklistCreate = z.infer<typeof checklistCreateSchema>;

// Bez wartości domyślnych, więc .partial() jest bezpieczne.
export const checklistUpdateSchema = checklistCreateSchema.partial();
export const checklistToggleSchema = z.object({ opId: z.string().min(1).optional(), zabrane: z.boolean() });
