import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Run in the clinic's timezone (DST included), not UTC, so local-date bugs show up in tests.
process.env.TZ = 'America/Tijuana'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    unstubEnvs: true,
    unstubGlobals: true,
  },
}))
