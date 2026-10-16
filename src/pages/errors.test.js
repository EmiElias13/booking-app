import { describe, expect, it } from 'vitest'
import { teamError } from './Team.jsx'
import { strings } from '../i18n/strings.js'
import { createAppointment } from '../demo/api.js'

const E = strings.team.errors

describe('Spanish error text for booking/DB error codes', () => {
  it('teamError maps DB codes and messages to Spanish copy', () => {
    expect(teamError({ code: '23P01' })).toBe(E.overlap)
    expect(teamError({ dbMessage: 'staff limit (6) reached for clinic' })).toBe(E.staffLimit)
    expect(teamError({ dbMessage: 'last active admin of clinic cannot be removed' })).toBe(E.lastAdmin)
    expect(teamError({ code: '42501' })).toBe(E.permission)
    expect(teamError({ status: 401 })).toBe(E.permission)
    expect(teamError({ network: true })).toBe(E.network)
    expect(teamError({ code: 'XX000' })).toBe(E.save)
  })

  it('a double-booked slot is rejected with the Spanish slotTaken message on the time field', async () => {
    const req = { clientName: 'Prueba', email: 'qa@example.com', service: 'initial', date: '2099-01-05', time: '09:00' }
    await createAppointment(req)
    const err = await createAppointment(req).catch((e) => e)
    expect(err.status).toBe(409)
    expect(err.fieldErrors.time).toBe('Alguien acaba de apartar este horario. Elige otro.')
  })
})
