// QA low 3: demo seed bookings never land on a day the therapist has no hours (e.g. Sunday).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setClock } from '../test/clock.js'

afterEach(() => vi.useRealTimers())

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay()

describe('demo seed dates', () => {
  // Fri Oct 16 .. Sun Oct 18 2026: day offsets 0-3 cross a Sunday from each of these.
  it.each(['2026-10-16T09:00:00-07:00', '2026-10-17T09:00:00-07:00', '2026-10-18T09:00:00-07:00'])(
    'no seed booking on a day without hours (now %s)',
    async (now) => {
      setClock(new Date(now))
      vi.resetModules()
      const api = await import('./api.js')
      const [list, hours] = await Promise.all([api.listAppointments(), api.listStaffHours()])
      expect(list).toHaveLength(5)
      for (const a of list) {
        expect(weekday(a.date)).not.toBe(0)
        expect(hours.some((h) => h.staffId === a.staffId && h.weekday === weekday(a.date))).toBe(true)
      }
    },
  )

  it('shifts a Sunday to the next working day', async () => {
    setClock(new Date('2026-10-17T09:00:00-07:00')) // Saturday
    vi.resetModules()
    const { seedDate } = await import('./api.js')
    const hours = [{ staffId: 't', weekday: 1 }]
    expect(seedDate(1, 't', hours)).toBe('2026-10-19') // Sun -> Mon
    expect(seedDate(0, 't', [{ staffId: 't', weekday: 6 }])).toBe('2026-10-17')
  })
})
