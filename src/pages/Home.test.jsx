import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Home from './Home.jsx'
import { strings } from '../i18n/strings.js'

// Clinic "now" is midnight so no slot counts as already past.
vi.mock('../data/clinic.js', async (orig) => ({ ...(await orig()), clinicTimeHHMM: () => '00:00' }))

const store = vi.hoisted(() => ({ therapistId: '' }))

vi.mock('../store/appointments.jsx', () => ({
  useAppointments: () => ({
    myRequests: [],
    apiError: '',
    requestSlot: vi.fn(),
    clinicToday: '2099-01-05',
    loading: false,
    therapists: [{ id: 't1', displayName: 'Dra. Prueba' }],
    therapistId: store.therapistId,
    selectTherapist: vi.fn(),
    // 09:00 is taken: the server leaves it out of the free list.
    availableSlots: new Map([['2099-01-05', ['10:00', '11:00']]]),
    slotsLoading: false,
    therapistsError: false,
    slotsError: false,
    retrySlots: vi.fn(),
    refresh: vi.fn(),
  }),
}))

describe('Home booking form (store mocked)', () => {
  it('shows only free slots for the chosen therapist (taken ones are not offered)', () => {
    store.therapistId = 't1'
    render(<Home />)
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10:00' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '11:00' })).toBeEnabled()
  })

  it('shows Spanish required-field errors on empty submit, including the therapist', () => {
    store.therapistId = ''
    const { container } = render(<Home />)
    fireEvent.submit(container.querySelector('form'))
    expect(screen.getByText(strings.errors.name)).toBeInTheDocument()
    expect(screen.getByText(strings.errors.email)).toBeInTheDocument()
    expect(screen.getByText('Elige un fisioterapeuta')).toBeInTheDocument()
    expect(screen.getByText(strings.errors.time)).toBeInTheDocument()
  })
})
