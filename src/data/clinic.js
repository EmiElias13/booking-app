import { config } from '../config/clinic.config.js'

export const SERVICES = config.services

// Today's date (YYYY-MM-DD) in the clinic's timezone. Fallback only: the live
// app prefers the server's clinic_today (see store/appointments.jsx).
export function todayISO(timeZone = config.timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
}

// Current time (HH:MM, 24h) in the clinic's timezone.
export function clinicTimeHHMM(timeZone = config.timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString(config.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function serviceLabel(id) {
  return SERVICES.find((service) => service.id === id)?.label ?? id
}
