import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: 'client',
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
})
