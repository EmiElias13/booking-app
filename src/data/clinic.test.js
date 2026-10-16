import { describe, expect, it } from 'vitest'
import { clinicTimeHHMM, serviceLabel, todayISO } from './clinic.js'

describe('todayISO (clinic date, not UTC)', () => {
  // 17:30 PDT on Oct 15 = 00:30 UTC on Oct 16. The old bug returned the UTC date after ~5 PM PT.
  const evening = new Date('2026-10-16T00:30:00Z')

  it('returns the America/Tijuana date after 5 PM PT', () => {
    expect(todayISO('America/Tijuana', evening)).toBe('2026-10-15')
  })

  it('defaults to the clinic timezone from config', () => {
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
