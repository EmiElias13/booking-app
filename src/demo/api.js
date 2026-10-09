import { strings } from '../i18n/strings.js'

const SESSION_KEY = 'clinic_demo_session'

export const isSupabaseConfigured = true
export const isAppConfigured = true

function localISODate(offsetDays) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function seedAppointments() {
  const rows = [
    { clientName: 'Ana López', email: 'ana@ejemplo.com', service: 'initial', day: 1, time: '09:00', status: 'pending', notes: 'Molestia en la rodilla al subir escaleras.' },
    { clientName: 'Carlos Ruiz', email: 'carlos@ejemplo.com', service: 'followup', day: 1, time: '11:00', status: 'pending', notes: '' },
    { clientName: 'Sofía Méndez', email: 'sofia@ejemplo.com', service: 'short', day: 2, time: '15:00', status: 'pending', notes: 'Prefiero por la tarde.' },
    { clientName: 'Jorge Castillo', email: 'jorge@ejemplo.com', service: 'followup', day: 0, time: '10:00', status: 'approved', staffNote: 'Te esperamos, llega 10 min antes.' },
    { clientName: 'Lucía Herrera', email: 'lucia@ejemplo.com', service: 'initial', day: 3, time: '08:00', status: 'declined', staffNote: 'Ese día no hay espacio, ¿te funciona el jueves?' },
  ]

  return rows.map((row) => ({
    id: crypto.randomUUID(),
    clientName: row.clientName,
    email: row.email,
    phone: '',
    service: row.service,
    notes: row.notes ?? '',
    date: localISODate(row.day),
    time: row.time,
    status: row.status,
    physioNote: row.staffNote ?? '',
    requestedAt: new Date().toISOString(),
  }))
}

const appointments = seedAppointments()

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

export async function signIn(email) {
  const session = {
    access_token: 'demo-token',
    refresh_token: 'demo-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { email },
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function signOut() {
  sessionStorage.removeItem(SESSION_KEY)
}

export async function listSlots() {
  return [...appointments]
}

export async function listAppointments() {
  return [...appointments]
}

export async function createAppointment(request) {
  const taken = appointments.some(
    (appointment) =>
      appointment.date === request.date &&
      appointment.time === request.time &&
      appointment.status !== 'declined',
  )
  if (taken) {
    const error = new Error(strings.errors.slotTaken)
    error.status = 409
    error.fieldErrors = { time: strings.errors.slotTaken }
    throw error
  }

  const appointment = {
    id: crypto.randomUUID(),
    clientName: request.clientName,
    email: request.email,
    phone: request.phone ?? '',
    service: request.service,
    notes: request.notes ?? '',
    date: request.date,
    time: request.time,
    status: 'pending',
    physioNote: '',
    requestedAt: new Date().toISOString(),
  }
  appointments.push(appointment)
  return appointment
}

export async function updateAppointment(id, { status, physioNote = '' }) {
  const index = appointments.findIndex((appointment) => appointment.id === id)
  if (index < 0) {
    const error = new Error(strings.errors.notFound)
    error.status = 404
    error.fieldErrors = { id: strings.errors.notFound }
    throw error
  }
  appointments[index] = { ...appointments[index], status, physioNote }
  return appointments[index]
}
