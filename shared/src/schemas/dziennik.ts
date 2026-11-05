import { z } from 'zod';

export const diaryCreateSchema = z.object({
  opId: z.string().min(1).optional(),
  owner_type: z.enum(['job', 'lead']),
  owner_id: z.string().min(1),
  tekst: z.string().trim().max(5000, 'Wpis jest za długi'),
  uploads: z.array(z.string().min(1)).max(30).default([]),
}).refine((b) => b.tekst || b.uploads.length, { message: 'Wpisz tekst albo dodaj plik' });
export type DiaryCreate = z.infer<typeof diaryCreateSchema>;

export const klientFlagSchema = z.object({ dla_klienta: z.boolean() });
