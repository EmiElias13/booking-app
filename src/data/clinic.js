import { config } from '../config/clinic.config.js'

export const SERVICES = config.services
export const TIME_SLOTS = config.timeSlots

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
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
