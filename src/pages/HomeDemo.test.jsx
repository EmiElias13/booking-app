// Home + real store + demo API (VITE_DEMO=true): taken slots are hidden and a double-booking is rejected.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let Home, AuthProvider, AppointmentsProvider, demo, strings
beforeAll(async () => {
  vi.stubEnv('VITE_DEMO', 'true')
  vi.resetModules()
  ;({ default: Home } = await import('./Home.jsx'))
  ;({ AuthProvider } = await import('../store/auth.jsx'))
  ;({ AppointmentsProvider } = await import('../store/appointments.jsx'))
  ;({ strings } = await import('../i18n/strings.js'))
  demo = await import('../demo/api.js')
})

// unstubEnvs resets env after each test; api.js reads VITE_DEMO on every call.
beforeEach(() => vi.stubEnv('VITE_DEMO', 'true'))

function renderHome() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppointmentsProvider>
          <Home />
        </AppointmentsProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function pick(therapistId, date) {
  const select = await screen.findByRole('combobox', { name: strings.home.therapist })
  await within(select).findByRole('option', { name: 'Ana Fisio' })
  fireEvent.change(select, { target: { value: therapistId } })
  fireEvent.change(screen.getByLabelText(strings.home.date), { target: { value: date } })
}

const guest = { clientName: 'Prueba QA', email: 'qa@example.com', service: 'initial' }

describe('Home with the demo backend', () => {
  // Fixed clock: Thu 2026-10-15. Mon 2026-10-19 is open 08:00-20:00 for demo-t1.
  it('hides a slot that is already booked and keeps the others', async () => {
    await demo.createAppointment({ ...guest, staffId: 'demo-t1', date: '2026-10-19', time: '09:00' })
    renderHome()
    await pick('demo-t1', '2026-10-19')
    expect(await screen.findByRole('button', { name: '10:00' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
  })

  it('a slot taken while the form is open is rejected in Spanish and the time is cleared', async () => {
    renderHome()
    await pick('demo-t1', '2026-10-20')
    fireEvent.click(await screen.findByRole('button', { name: '12:00' }))
    expect(screen.getByRole('button', { name: '12:00' })).toHaveClass('slot-selected')
    fireEvent.change(screen.getByLabelText(strings.home.name), { target: { value: guest.clientName } })
    fireEvent.change(screen.getByLabelText(strings.home.email), { target: { value: guest.email } })
    // Someone else books it first.
    await demo.createAppointment({ ...guest, email: 'otra@example.com', staffId: 'demo-t1', date: '2026-10-20', time: '12:00' })
    fireEvent.click(screen.getByRole('button', { name: strings.home.submit }))
    expect(await screen.findByText(strings.errors.booking.slot_taken)).toBeInTheDocument()
    // The store refetches: 12:00 disappears and nothing stays selected.
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: '12:00' })).not.toBeInTheDocument())
    expect(document.querySelector('.slot-selected')).toBeNull()
    // The rejected time was dropped, so a resubmit asks for a time instead of re-sending 12:00.
    fireEvent.click(screen.getByRole('button', { name: strings.home.submit }))
    expect(await screen.findByText(strings.errors.time)).toBeInTheDocument()
  })
})
