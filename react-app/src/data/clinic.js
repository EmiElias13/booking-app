export const SERVICES = [
  { id: 'initial', label: 'Initial assessment (60 min)' },
  { id: 'followup', label: 'Follow-up session (45 min)' },
  { id: 'sports', label: 'Sports injury rehab (45 min)' },
  { id: 'massage', label: 'Deep tissue massage (30 min)' },
]

export const TIME_SLOTS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
]

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(iso) {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function serviceLabel(id) {
  return SERVICES.find((service) => service.id === id)?.label ?? id
}
