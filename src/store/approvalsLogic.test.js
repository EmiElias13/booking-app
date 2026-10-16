import { describe, expect, it } from 'vitest'
import { UNASSIGNED, matchesTherapist, missingTherapistIds, reviewReasons, therapistLabel, therapistOptions } from './approvalsLogic.js'

// 2099-01-05 is a Monday (weekday 1).
const staff = [
  { id: 't1', role: 'therapist', displayName: 'Ana', active: true, sortOrder: 2 },
  { id: 't2', role: 'therapist', displayName: 'Luis', active: false, sortOrder: 1 },
  { id: 'a1', role: 'admin', displayName: 'Admin', active: true, sortOrder: 0 },
]
const hours = [
  { staffId: 't1', weekday: 1, start: '08:00', end: '13:00' },
  { staffId: 't1', weekday: 1, start: '15:00', end: '20:00' },
  { staffId: 't2', weekday: 1, start: '08:00', end: '20:00' },
]
const timeOff = [{ staffId: 't1', startDate: '2099-01-12', endDate: '2099-01-14' }]
const ctx = { staff, hours, timeOff, today: '2099-01-05', nowHHMM: '10:00' }
const appt = (over) => ({ id: 'x', status: 'pending', staffId: 't1', date: '2099-01-05', time: '11:00', ...over })

describe('reviewReasons (Revisar flag)', () => {
  it('is empty for a future booking inside hours of an active therapist', () => {
    expect(reviewReasons(appt(), ctx)).toEqual([])
    expect(reviewReasons(appt({ time: '15:00' }), ctx)).toEqual([])
  })

  it('flags an inactive therapist', () => {
    expect(reviewReasons(appt({ staffId: 't2' }), ctx)).toEqual(['inactive'])
  })

  it('flags a therapist no longer in the staff list as inactive', () => {
    expect(reviewReasons(appt({ staffId: 'gone' }), ctx)).toEqual(['inactive'])
  })

  it('flags a date inside time off, inclusive of both ends', () => {
    for (const date of ['2099-01-12', '2099-01-14']) {
      expect(reviewReasons(appt({ date, time: '09:00' }), ctx)).toContain('timeOff')
    }
    expect(reviewReasons(appt({ date: '2099-01-15', time: '09:00' }), ctx)).not.toContain('timeOff')
  })

  it('flags a time outside hours: split-shift gap, end time, closed weekday', () => {
    expect(reviewReasons(appt({ time: '13:00' }), ctx)).toEqual(['outsideHours'])
    expect(reviewReasons(appt({ time: '20:00' }), ctx)).toEqual(['outsideHours'])
    expect(reviewReasons(appt({ date: '2099-01-11', time: '09:00' }), ctx)).toEqual(['outsideHours']) // Sunday
  })

  it('can list several reasons at once', () => {
    const c = { ...ctx, staff: staff.map((s) => (s.id === 't1' ? { ...s, active: false } : s)) }
    expect(reviewReasons(appt({ date: '2099-01-13', time: '14:00' }), c)).toEqual(['inactive', 'timeOff', 'outsideHours'])
  })

  it('ignores declined, past and already-started bookings', () => {
    const bad = { staffId: 't2' }
    expect(reviewReasons(appt({ ...bad, status: 'declined' }), ctx)).toEqual([])
    expect(reviewReasons(appt({ ...bad, date: '2099-01-04' }), ctx)).toEqual([])
    expect(reviewReasons(appt({ ...bad, time: '10:00' }), ctx)).toEqual([])
    expect(reviewReasons(appt({ ...bad, time: '09:00' }), ctx)).toEqual([])
    expect(reviewReasons(appt({ ...bad, status: 'approved' }), ctx)).toEqual(['inactive'])
  })

  it('does not flag legacy rows without a therapist, nor anything when team data is missing', () => {
    expect(reviewReasons(appt({ staffId: null }), ctx)).toEqual([])
    expect(reviewReasons(appt(), { today: ctx.today, nowHHMM: ctx.nowHHMM })).toEqual([])
  })
})

describe('therapist filter helpers', () => {
  it('lists therapists only (incl. inactive), in clinic order', () => {
    expect(therapistOptions(staff).map((s) => s.id)).toEqual(['t2', 't1'])
  })

  it('matches everyone, one therapist, or unassigned', () => {
    expect(matchesTherapist({ staffId: 't1' }, '')).toBe(true)
    expect(matchesTherapist({ staffId: 't1' }, 't1')).toBe(true)
    expect(matchesTherapist({ staffId: 't2' }, 't1')).toBe(false)
    expect(matchesTherapist({ staffId: null }, UNASSIGNED)).toBe(true)
    expect(matchesTherapist({ staffId: 't1' }, UNASSIGNED)).toBe(false)
  })
})

describe('outside hours uses the booking end when the slot length is known (QA low 1)', () => {
  const c60 = { ...ctx, slotMinutes: 60 }
  it('flags a booking that starts inside hours but runs past the end', () => {
    expect(reviewReasons(appt({ time: '12:30' }), c60)).toEqual(['outsideHours']) // ends 13:30, shift ends 13:00
    expect(reviewReasons(appt({ time: '19:30' }), c60)).toEqual(['outsideHours'])
  })
  it('accepts a booking that ends exactly at the end of hours', () => {
    expect(reviewReasons(appt({ time: '12:00' }), c60)).toEqual([])
    expect(reviewReasons(appt({ time: '19:00' }), c60)).toEqual([])
  })
  it('flags a booking that would run past midnight', () => {
    const late = { ...c60, hours: [{ staffId: 't1', weekday: 1, start: '08:00', end: '23:59' }] }
    expect(reviewReasons(appt({ time: '23:30' }), late)).toEqual(['outsideHours'])
  })
  it('falls back to the start time when the slot length is unknown', () => {
    expect(reviewReasons(appt({ time: '12:30' }), ctx)).toEqual([])
  })
})

describe('missing therapist placeholder (QA low 2)', () => {
  const labels = { unassigned: 'Sin asignar', missing: 'Fisioterapeuta no disponible' }
  it('shows the name, the unassigned label, or the placeholder (never blank)', () => {
    expect(therapistLabel('t1', staff, labels)).toBe('Ana')
    expect(therapistLabel(null, staff, labels)).toBe('Sin asignar')
    expect(therapistLabel('gone', staff, labels)).toBe('Fisioterapeuta no disponible')
    expect(therapistLabel('t1', [], labels)).toBe('Fisioterapeuta no disponible')
  })
  it('lists ids used by bookings but missing from staff, once each', () => {
    const list = [{ staffId: 't1' }, { staffId: 'gone' }, { staffId: 'gone' }, { staffId: null }]
    expect(missingTherapistIds(list, staff)).toEqual(['gone'])
  })
  it('keeps the inactive Revisar reason for a missing therapist', () => {
    expect(reviewReasons(appt({ staffId: 'gone' }), ctx)).toEqual(['inactive'])
  })
})
