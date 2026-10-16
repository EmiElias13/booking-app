import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import Approvals from './Approvals.jsx'
import { strings } from '../i18n/strings.js'

vi.mock('../data/clinic.js', async (orig) => ({ ...(await orig()), clinicTimeHHMM: () => '10:00' }))

const auth = vi.hoisted(() => ({ staffRole: 'admin' }))
vi.mock('../store/auth.jsx', () => ({ useAuth: () => ({ staffRole: auth.staffRole }) }))

const row = (id, staffId, time, clientName) => ({
  id, staffId, time, clientName, date: '2099-01-05', status: 'pending', service: 'initial', email: `${id}@ejemplo.com`, phone: '', notes: '', staffNote: '',
})

// One stable store value (a new object per render would loop the chip-indicator effect).
const store = vi.hoisted(() => ({ value: null }))
vi.mock('../store/appointments.jsx', () => ({
  useAppointments: () => (store.value ??= {
    appointments: [row('a', 't1', '11:00', 'Paciente Uno'), row('b', 't2', '12:00', 'Paciente Dos'), row('c', null, '09:00', 'Paciente Tres')],
    team: {
      staff: [
        { id: 't1', role: 'therapist', displayName: 'Ana Fisio', active: true, sortOrder: 1 },
        { id: 't2', role: 'therapist', displayName: 'Luis Fisio', active: false, sortOrder: 2 },
      ],
      hours: [
        { staffId: 't1', weekday: 1, start: '08:00', end: '20:00' },
        { staffId: 't2', weekday: 1, start: '08:00', end: '20:00' },
      ],
      timeOff: [],
    },
    clinicToday: '2099-01-04',
    loading: false,
    apiError: null,
    decide: () => Promise.resolve(),
  }),
}))

const cardOf = (name) => screen.getByText(name).closest('li')

describe('Approvals therapist scope and Revisar flag', () => {
  it('shows the therapist on each card and flags only the inactive one', () => {
    auth.staffRole = 'admin'
    render(<Approvals />)
    expect(within(cardOf('Paciente Uno')).getByText('Ana Fisio')).toBeInTheDocument()
    expect(within(cardOf('Paciente Uno')).queryByText(strings.approvals.review)).not.toBeInTheDocument()
    const two = cardOf('Paciente Dos')
    expect(within(two).getByText(strings.approvals.review)).toBeInTheDocument()
    expect(within(two).getByText(strings.approvals.reviewReasons.inactive)).toBeInTheDocument()
    expect(within(cardOf('Paciente Tres')).getByText(strings.approvals.unassigned)).toBeInTheDocument()
  })

  it('filters by therapist for admin/front desk and updates the counts', () => {
    auth.staffRole = 'front_desk'
    render(<Approvals />)
    const select = screen.getByLabelText(strings.approvals.therapist)
    expect(within(select).getByRole('option', { name: `Luis Fisio ${strings.approvals.inactiveSuffix}` })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 't1' } })
    expect(screen.getByText('Paciente Uno')).toBeInTheDocument()
    expect(screen.queryByText('Paciente Dos')).not.toBeInTheDocument()
    expect(screen.queryByText('Paciente Tres')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `${strings.approvals.filters.pending} (1)` })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'none' } })
    expect(screen.getByText('Paciente Tres')).toBeInTheDocument()
    expect(screen.queryByText('Paciente Uno')).not.toBeInTheDocument()
  })

  it('has no therapist filter for therapists', () => {
    auth.staffRole = 'therapist'
    render(<Approvals />)
    expect(screen.queryByLabelText(strings.approvals.therapist)).not.toBeInTheDocument()
    expect(screen.getByText('Paciente Dos')).toBeInTheDocument()
  })
})
