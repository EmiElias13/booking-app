// Login and Approvals against the live client with the network down.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { strings } from '../i18n/strings.js'

const CLINIC = '11111111-2222-4333-8444-555555555555'
let Login, Approvals, AuthProvider, AppointmentsProvider

beforeEach(async () => {
  vi.stubEnv('VITE_DEMO', 'false')
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.example')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.stubEnv('VITE_CLINIC_ID', CLINIC)
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  vi.resetModules()
  ;({ default: Login } = await import('./Login.jsx'))
  ;({ default: Approvals } = await import('./Approvals.jsx'))
  ;({ AuthProvider } = await import('../store/auth.jsx'))
  ;({ AppointmentsProvider } = await import('../store/appointments.jsx'))
})

function renderPage(Page) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppointmentsProvider>
          <Page />
        </AppointmentsProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('offline', () => {
  it('Approvals shows the Spanish "cannot reach" banner, not "Failed to fetch"', async () => {
    localStorage.setItem(`booking_staff_session:${CLINIC}`, JSON.stringify({ access_token: 'staff-jwt', expires_at: 4102444800, staffRole: 'admin' }))
    renderPage(Approvals)
    expect(await screen.findByText(strings.errors.reach)).toBeInTheDocument()
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument()
  })

  // KNOWN BUG: authFetch() in src/lib/supabase.js does not catch fetch() rejections, so the raw
  // "Failed to fetch" reaches the Login form. Marked it.fails until the app fix lands (not fixed here).
  it.fails('Login shows Spanish text, not "Failed to fetch" (known bug: authFetch lacks a network catch)', async () => {
    renderPage(Login)
    fireEvent.change(screen.getByLabelText(strings.login.email), { target: { value: 'qa@example.com' } })
    fireEvent.change(screen.getByLabelText(strings.login.password), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: strings.login.submit }))
    await screen.findByText(/./, { selector: 'small.error' })
    expect(screen.queryByText(/failed to fetch/i)).not.toBeInTheDocument()
    expect(document.querySelector('small.error').textContent).toMatch(/^(No pudimos|Sin conexión)/)
  })
})
