// Live API client (src/lib/supabase.js) with a fake fetch: role rules and network errors.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strings } from '../i18n/strings.js'

const CLINIC = '11111111-2222-4333-8444-555555555555'
const URL = 'https://test.supabase.example'
let api, fetchMock

function okJson(body) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(async () => {
  vi.stubEnv('VITE_DEMO', 'false')
  vi.stubEnv('VITE_SUPABASE_URL', URL)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('VITE_CLINIC_ID', CLINIC)
  localStorage.clear()
  fetchMock = vi.fn(() => okJson([]))
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  api = await import('./supabase.js')
})

const calls = () => fetchMock.mock.calls.map(([u, o]) => ({ path: u.replace(`${URL}/rest/v1`, ''), method: o.method, auth: o.headers.Authorization }))

describe('guest role rules', () => {
  it('guests only read slots/therapists and call request_appointment, always with the anon key', async () => {
    // A stored staff session must not leak into guest calls.
    localStorage.setItem(`booking_staff_session:${CLINIC}`, JSON.stringify({ access_token: 'staff-jwt', expires_at: 4102444800 }))
    await api.listTherapists()
    await api.listAvailableSlots('t1', '2026-10-15', '2026-10-30')
    await api.listTakenSlots('2026-10-15', '2026-10-30')
    fetchMock.mockImplementationOnce(() => okJson('new-id'))
    await api.createAppointment({ staffId: 't1', date: '2026-10-19', time: '09:00', clientName: 'QA', email: 'qa@example.com', service: 'initial' })
    expect(calls()).toEqual([
      { path: '/rpc/list_therapists', method: 'POST', auth: 'Bearer anon-key' },
      { path: '/rpc/get_available_slots', method: 'POST', auth: 'Bearer anon-key' },
      { path: '/rpc/get_taken_slots', method: 'POST', auth: 'Bearer anon-key' },
      { path: '/rpc/request_appointment', method: 'POST', auth: 'Bearer anon-key' },
    ])
  })
})

describe('staff role rules', () => {
  it.each([
    ['listAppointments', () => api.listAppointments()],
    ['updateAppointment', () => api.updateAppointment('a1', { status: 'approved' })],
    ['listStaff', () => api.listStaff()],
    ['listStaffHours', () => api.listStaffHours()],
    ['listTimeOff', () => api.listTimeOff()],
  ])("%s without a staff token fails with 'sign in required' and never hits the network", async (_, call) => {
    const err = await call().catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(401)
    expect(err.message).toBe(strings.errors.signInRequired)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('staff calls send the staff token', async () => {
    localStorage.setItem(`booking_staff_session:${CLINIC}`, JSON.stringify({ access_token: 'staff-jwt', expires_at: 4102444800 }))
    await api.listAppointments()
    expect(calls()[0]).toMatchObject({ method: 'GET', auth: 'Bearer staff-jwt' })
    expect(calls()[0].path).toMatch(/^\/appointments\?clinic_id=eq\./)
  })
})

describe('network errors (offline, DNS, CORS)', () => {
  it('guest and staff calls reject with Spanish text, never the raw "Failed to fetch"', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    localStorage.setItem(`booking_staff_session:${CLINIC}`, JSON.stringify({ access_token: 'staff-jwt', expires_at: 4102444800 }))
    for (const call of [() => api.listTherapists(), () => api.listAvailableSlots('t1', 'a', 'b'), () => api.listAppointments()]) {
      const err = await call().catch((e) => e)
      expect(err.message).toBe(strings.errors.reach)
      expect(err.message).not.toMatch(/failed to fetch/i)
      expect(err.network).toBe(true)
      expect(err.fieldErrors.form).toBe(strings.errors.reach)
    }
  })
})
