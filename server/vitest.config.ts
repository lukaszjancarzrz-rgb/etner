import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testy biorą @etner/shared ze źródeł, więc nie wymagają wcześniejszego builda shared.
export default defineConfig({
  resolve: { alias: { '@etner/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
});
