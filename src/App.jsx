import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Approvals from './pages/Approvals.jsx'
import Login from './pages/Login.jsx'
import RequirePhysio from './middleware/RequirePhysio.jsx'
import { useAppointments } from './store/appointments.jsx'
import { useAuth } from './store/auth.jsx'

export default function App() {
  const { appointments } = useAppointments()
  const { isPhysio, signOut } = useAuth()
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <NavLink to="/">
            <img className="brand-logo" src="/logo.png" alt="Rehabireb, centro fisioterapéutico integral" />
          </NavLink>
        </div>
        <nav className="nav">
          {
          /* 
          <NavLink to="/" end>
            Agendar consulta
          </NavLink> 
          */
          }
          {isPhysio ? (
            <>
              <NavLink to="/approvals">
                Aprobar consultas
                {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
              </NavLink>
              
              <button type="button" onClick={signOut}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <NavLink to="/about">Acerca de nosotros</NavLink>
          )}
        </nav>
      </header>

      <main className="app-main">
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
