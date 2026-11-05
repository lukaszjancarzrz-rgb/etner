import { rmSync } from 'node:fs';

/** Po testach: katalog danych serwera demo (baza, pliki) do usunięcia. */
export default function teardown(): void {
  const dir = process.env.E2E_DATA;
  if (dir && /etner-e2e-/.test(dir)) rmSync(dir, { recursive: true, force: true });
}
