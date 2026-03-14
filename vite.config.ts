import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: {
    port: 3000
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
