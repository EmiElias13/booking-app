import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Approvals from './pages/Approvals.jsx'
import { useAppointments } from './store/appointments.jsx'

export default function App() {
  const { appointments } = useAppointments()
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◎</span>
          <div>
            <strong>Movewell Physio</strong>
            <span className="brand-sub">Booking</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Book a slot
          </NavLink>
          <NavLink to="/approvals">
            Physio approvals
            {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
          </NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/approvals" element={<Approvals />} />
        </Routes>
      </main>
    </div>
  )
}
