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

/** Lista predefiniowana (zadanie 18j): pasuje do zleceń o kategorii z `kategorie` i (jeśli podano) rodzaju z `rodzaje`. */
const names = z.array(txt.min(1).max(100)).max(30);
export const checklistTemplateSchema = z.object({
  opId: z.string().min(1).optional(),
  nazwa: txt.min(1, 'Podaj nazwę listy').max(100, 'Nazwa jest za długa'),
  kategorie: names,
  rodzaje: names,
  pozycje: z.array(txt.min(1, 'Pusta pozycja').max(300, 'Pozycja jest za długa')).max(200, 'Za dużo pozycji'),
  kolejnosc: z.number().int().min(0).max(10_000).optional(),
});
export type ChecklistTemplateInput = z.infer<typeof checklistTemplateSchema>;
export const checklistTemplateUpdateSchema = checklistTemplateSchema.partial();
