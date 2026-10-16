import { describe, expect, it } from 'vitest'
import { clinicTimeHHMM, serviceLabel, todayISO } from './clinic.js'
import { setClock } from '../test/clock.js'

describe('test environment', () => {
  it('runs in America/Tijuana, not UTC', () => {
    expect(process.env.TZ).toBe('America/Tijuana')
    expect(new Date('2026-01-15T12:00:00Z').getTimezoneOffset()).toBe(480) // PST
    expect(new Date('2026-07-15T12:00:00Z').getTimezoneOffset()).toBe(420) // PDT
  })
})

describe('todayISO (clinic date, not UTC)', () => {
  // 17:30 PDT on Oct 15 = 00:30 UTC on Oct 16. The old bug returned the UTC date after ~5 PM PT.
  const evening = new Date('2026-10-16T00:30:00Z')

  it('returns the America/Tijuana date after 5 PM PT (summer, PDT)', () => {
    expect(todayISO('America/Tijuana', evening)).toBe('2026-10-15')
  })

  // 23:30 PST on Jan 15 = 07:30 UTC on Jan 16. A fixed UTC-7 offset would wrongly say Jan 16, 00:30.
  it('returns the America/Tijuana date late at night in winter (PST, UTC-8)', () => {
    const winter = new Date('2026-01-16T07:30:00Z')
    expect(todayISO('America/Tijuana', winter)).toBe('2026-01-15')
    expect(clinicTimeHHMM('America/Tijuana', winter)).toBe('23:30')
  })

  it('defaults to the clinic timezone and the current clock', () => {
    setClock(new Date('2026-01-16T07:30:00Z'))
    expect(todayISO()).toBe('2026-01-15')
    expect(todayISO(undefined, evening)).toBe('2026-10-15')
  })

  it('clinicTimeHHMM uses the clinic clock (24h)', () => {
    expect(clinicTimeHHMM('America/Tijuana', evening)).toBe('17:30')
  })
})

describe('serviceLabel', () => {
  it('maps a known id to its label and falls back to the id', () => {
    expect(serviceLabel('initial')).toBe('Primera cita (60 min)')
    expect(serviceLabel('unknown-id')).toBe('unknown-id')
  })
})
