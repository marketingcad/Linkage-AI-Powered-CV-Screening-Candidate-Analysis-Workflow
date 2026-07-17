import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  // Source uses explicit `.js` import specifiers (NodeNext style) — resolve them to `.ts`.
  resolve: {
    extensionAlias: { '.js': ['.ts', '.js'] },
  },
});
