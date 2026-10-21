import type { AppDeps } from './app.js';

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  return { version: 'test', ...over };
}
