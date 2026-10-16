import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { setClock } from './clock.js'

// jsdom has no matchMedia (used by useCountUp for reduced motion).
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })
}

// Set at load too, so module-level code (e.g. demo seed dates) sees the fixed clock.
setClock()
beforeEach(() => setClock())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
