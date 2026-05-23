import { defineConfig } from 'vite'

// Separate Vitest config for integration tests.
// These tests hit a real backend and are excluded from the standard `npm test` run.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.{js,jsx,ts,tsx}'],
    setupFiles: [],
    reporters: ['verbose'],
    testTimeout: 30_000, // real network calls can be slow
    hookTimeout: 15_000,
  },
})
