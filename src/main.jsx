import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './store/auth.jsx'
import { AppointmentsProvider } from './store/appointments.jsx'
import './index.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppointmentsProvider>
          <App />
        </AppointmentsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
