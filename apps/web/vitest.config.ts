import { defineConfig } from 'vitest/config'

/** Tests for the web app's logic. */
export default defineConfig({
  // Components are rendered by tests too, and Next's own JSX runtime is the automatic one.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    // See test/setup.ts.
    setupFiles: ['./test/setup.ts'],
    include: ['lib/**/*.test.ts'],
    // Each file gets a clean localStorage.
    isolate: true,
    restoreMocks: true,
  },
})
