// Live booking error mapping (QA gap N1): every request_appointment P0001 code
// must map to its Spanish text, form field and HTTP status. Expected values are
// written out here on purpose so a change to the app table or strings fails.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CLINIC = '11111111-2222-4333-8444-555555555555'
const URL = 'https://test.supabase.example'
let api, fetchMock

const CASES = [
  ['slot_taken', 'time', 409, 'Alguien acaba de apartar este horario. Elige otro.'],
  ['past_slot', 'time', 409, 'Ese horario ya pasó. Elige otro.'],
  ['outside_hours', 'time', 409, 'Ese horario ya no está disponible. Elige otro.'],
  ['time_off', 'time', 409, 'Ese día no hay atención con este fisioterapeuta. Elige otra fecha.'],
  ['too_far', 'date', 422, 'Solo se puede agendar hasta 3 meses adelante.'],
  ['bad_time', 'time', 422, 'Elige un horario de la lista.'],
  ['inactive_staff', 'therapist', 409, 'Este fisioterapeuta ya no tiene agenda en línea. Elige otro.'],
  ['unknown_clinic', 'form', 422, 'No pudimos enviar tu solicitud. Inténtalo de nuevo.'],
]

const REQUEST = { staffId: 't1', date: '2026-10-19', time: '09:00', clientName: 'QA', email: 'qa@example.com', service: 'initial' }

function pgError(body, status = 400) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(async () => {
  vi.stubEnv('VITE_DEMO', 'false')
  vi.stubEnv('VITE_SUPABASE_URL', URL)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('VITE_CLINIC_ID', CLINIC)
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  api = await import('./supabase.js')
})

describe('request_appointment error mapping (live)', () => {
  it('covers exactly the 8 known codes', () => {
    expect(CASES).toHaveLength(8)
  })

  it.each(CASES)('%s → field %s, status %i, Spanish text', async (code, field, status, text) => {
    fetchMock.mockImplementation(() => pgError({ code: 'P0001', message: code }))
    const error = await api.createAppointment(REQUEST).catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(text)
    expect(error.code).toBe(code)
    expect(error.status).toBe(status)
    expect(error.fieldErrors).toEqual({ [field]: text })
  })

  it.each(CASES)('throwQueryError maps %s directly', (code, field, status, text) => {
    let error
    try { api.throwQueryError({ code: 'P0001', message: code }, 400, 'guest') } catch (e) { error = e }
    expect({ message: error.message, status: error.status, fieldErrors: error.fieldErrors }).toEqual({ message: text, status, fieldErrors: { [field]: text } })
  })

  it('an unknown P0001 message falls back to the generic send error on the form', async () => {
    fetchMock.mockImplementation(() => pgError({ code: 'P0001', message: 'something_new' }))
    const error = await api.createAppointment(REQUEST).catch((e) => e)
    expect(error.message).toBe('No pudimos enviar tu solicitud. Inténtalo de nuevo.')
    expect(error.status).toBe(400)
    expect(Object.keys(error.fieldErrors)).toEqual(['form'])
  })

  it('a booking code without P0001 is not treated as a booking error', () => {
    let error
    try { api.throwQueryError({ code: '42501', message: 'slot_taken' }, 401, 'guest') } catch (e) { error = e }
    expect(error.status).toBe(401)
    expect(Object.keys(error.fieldErrors)).toEqual(['form'])
  })
})

describe('prototype keys are not booking codes (L1)', () => {
  it.each(['constructor', 'toString', '__proto__'])('P0001 %s falls back to the generic send error', (code) => {
    let error
    try { api.throwQueryError({ code: 'P0001', message: code }, 400, 'guest') } catch (e) { error = e }
    expect(error.message).toBe('No pudimos enviar tu solicitud. Inténtalo de nuevo.')
    expect(error.code).not.toBe(code)
  })
})
