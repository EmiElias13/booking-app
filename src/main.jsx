import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { config } from './config/clinic.config.js'
import { strings, t } from './i18n/strings.js'
import { AuthProvider } from './store/auth.jsx'
import { AppointmentsProvider } from './store/appointments.jsx'
import './index.css'

const ACCENT_SOFT_HEX = '#f3eaf8'
const ACCENT_DEEP_HEX = '#4e2870'

function applyClinicChrome() {
  document.title = t(strings.meta.title, { name: config.name })

  const theme = document.querySelector('meta[name="theme-color"]')
  if (theme) theme.setAttribute('content', config.themeColor)

  const icon = document.querySelector('link[rel="icon"]')
  if (!icon) return

  const base = import.meta.env.BASE_URL
  if (config.logo) {
    icon.href = `${base}${config.logo.replace(/^\//, '')}`
    return
  }

  const initial = (config.name.trim().charAt(0) || '?').toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${ACCENT_SOFT_HEX}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="34" font-weight="600" fill="${ACCENT_DEEP_HEX}">${initial}</text></svg>`
  icon.type = 'image/svg+xml'
  icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
}

applyClinicChrome()

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
