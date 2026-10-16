import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Home from './Home.jsx'
import { strings } from '../i18n/strings.js'

// Clinic "now" is midnight so no slot counts as already past.
vi.mock('../data/clinic.js', async (orig) => ({ ...(await orig()), clinicTimeHHMM: () => '00:00' }))

vi.mock('../store/appointments.jsx', () => ({
  useAppointments: () => ({
    takenSlots: new Map([['2099-01-05', new Set(['09:00'])]]),
    myRequests: [],
    apiError: '',
    requestSlot: vi.fn(),
    clinicToday: '2099-01-05',
  }),
}))

describe('Home booking form', () => {
  it('shows taken slots as disabled and leaves open slots enabled', () => {
    render(<Home />)
    expect(screen.getByRole('button', { name: /09:00/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /10:00/ })).toBeEnabled()
  })

  it('shows Spanish required-field errors on empty submit', () => {
    const { container } = render(<Home />)
    fireEvent.submit(container.querySelector('form'))
    expect(screen.getByText(strings.errors.name)).toBeInTheDocument()
    expect(screen.getByText(strings.errors.email)).toBeInTheDocument()
    expect(screen.getByText(strings.errors.time)).toBeInTheDocument()
  })

  // The therapist picker ('Elige un fisioterapeuta') ships in PR #26 and is not on develop yet.
  it.todo("requires a therapist: shows 'Elige un fisioterapeuta' (enable after #26 merges)")
})
