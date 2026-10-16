import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RequireStaff from './RequireStaff.jsx'
import Login from '../pages/Login.jsx'

const auth = vi.hoisted(() => ({ isStaff: false, staffRole: null, signIn: () => {}, signOut: () => {} }))
vi.mock('../store/auth.jsx', () => ({ useAuth: () => auth }))

function setAuth(role) {
  auth.isStaff = Boolean(role)
  auth.staffRole = role
}

// Same route shape as App.jsx, with page stubs.
function routes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/approvals" element={<RequireStaff><p>APPROVALS PAGE</p></RequireStaff>} />
      <Route path="/team" element={<RequireStaff roles={['admin']}><p>TEAM PAGE</p></RequireStaff>} />
    </Routes>
  )
}

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}>{routes()}</MemoryRouter>)
}

describe('RequireStaff route guard', () => {
  it('sends a guest on /approvals to /login', () => {
    setAuth(null)
    renderAt('/approvals')
    expect(screen.queryByText('APPROVALS PAGE')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Entrar|Iniciar/i })).toBeInTheDocument()
  })

  it('lets staff through to /approvals', () => {
    setAuth('therapist')
    renderAt('/approvals')
    expect(screen.getByText('APPROVALS PAGE')).toBeInTheDocument()
  })

  it('sends non-admin staff on /team back to /approvals; admins get in', () => {
    setAuth('therapist')
    renderAt('/team')
    expect(screen.getByText('APPROVALS PAGE')).toBeInTheDocument()
    expect(screen.queryByText('TEAM PAGE')).not.toBeInTheDocument()
    setAuth('admin')
    renderAt('/team')
    expect(screen.getByText('TEAM PAGE')).toBeInTheDocument()
  })

  it('after signing in, returns to the route the guest first asked for', () => {
    setAuth(null)
    const { rerender } = renderAt('/team')
    expect(screen.queryByText('TEAM PAGE')).not.toBeInTheDocument()
    setAuth('admin')
    rerender(<MemoryRouter initialEntries={['/team']}>{routes()}</MemoryRouter>)
    expect(screen.getByText('TEAM PAGE')).toBeInTheDocument()
    expect(screen.queryByText('APPROVALS PAGE')).not.toBeInTheDocument()
  })
})
