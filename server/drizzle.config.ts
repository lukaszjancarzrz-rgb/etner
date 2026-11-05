import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/core/schema-base.ts', './src/modules/*/schema.ts'],
  out: './drizzle',
});
