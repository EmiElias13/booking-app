import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Approvals from './pages/Approvals.jsx'
import Login from './pages/Login.jsx'
import RequirePhysio from './middleware/RequirePhysio.jsx'
import Monogram from './components/Monogram.jsx'
import { config } from './config/clinic.config.js'
import { strings } from './i18n/strings.js'
import { useAppointments } from './store/appointments.jsx'
import { useAuth } from './store/auth.jsx'

export default function App() {
  const { appointments } = useAppointments()
  const { isPhysio, signOut } = useAuth()
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length
  const logoSrc = config.logo
    ? `${import.meta.env.BASE_URL}${config.logo.replace(/^\//, '')}`
    : ''

  return (
    <div className="app">
      <div className="ambient" aria-hidden="true">
        <span className="ambient-blob ambient-blob-a" />
        <span className="ambient-blob ambient-blob-b" />
      </div>
      <header className="app-header">
        <div className="brand">
          <NavLink to="/">
            {logoSrc ? (
              <img className="brand-logo" src={logoSrc} alt={config.name} />
            ) : (
              <>
                <Monogram />
                <span className="brand-name">{config.name}</span>
              </>
            )}
          </NavLink>
        </div>
        <nav className="nav">
          {isPhysio ? (
            <>
              <NavLink to="/approvals">
                {strings.nav.approvals}
                {pendingCount > 0 && (
                  <span className="badge" key={pendingCount}>
                    {pendingCount}
                  </span>
                )}
              </NavLink>

              <button type="button" onClick={signOut}>
                {strings.nav.signOut}
              </button>
            </>
          ) : null}
        </nav>
      </header>

      <main className="app-main">
        {import.meta.env.VITE_DEMO === 'true' && (
          <div className="banner" role="status">
            {strings.demo.banner}
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/approvals"
            element={
              <RequirePhysio>
                <Approvals />
              </RequirePhysio>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
