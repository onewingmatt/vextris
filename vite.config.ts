import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/phaser')) return 'phaser'
          if (id.includes('node_modules/tone')) return 'tone'
          if (id.includes('/src/game/audio') || id.includes('/src/game/soundControls')) return 'audio'
          if (id.includes('/src/game/effects/')) return 'effects'
        },
      },
    },
  },
  server: {
    port: 3000
  }
})
