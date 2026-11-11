import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';

/** Ciało JSON zwalidowane zodem; błąd = 400 z pierwszym komunikatem. */
export async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) throw new HTTPException(400, { message: r.error.issues[0]?.message ?? 'Błędne dane' });
  return r.data;
}
