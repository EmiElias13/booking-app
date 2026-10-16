import { vi } from 'vitest'

// Fixed "now" for every test: Thu Oct 15 2026, 10:00 PDT (America/Tijuana).
export const DEFAULT_NOW = new Date('2026-10-15T10:00:00-07:00')

// Fakes only Date, so React Testing Library's real timers (waitFor/findBy) keep working.
export function setClock(now = DEFAULT_NOW) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
}
