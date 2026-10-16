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
    staffNote: row.staffNote ?? '',
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
    user: { id: 'demo-user', email },
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function signOut() {
  sessionStorage.removeItem(SESSION_KEY)
}

export async function listTakenSlots(from, to) {
  return appointments
    .filter((a) => a.status !== 'declined' && a.date >= from && a.date <= to)
    .map((a) => ({ date: a.date, time: a.time }))
}

export async function getStaffMembership() {
  return 'admin'
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
    staffNote: '',
    requestedAt: new Date().toISOString(),
  }
  appointments.push(appointment)
  return appointment
}

export async function updateAppointment(id, { status, staffNote = '' }) {
  const index = appointments.findIndex((appointment) => appointment.id === id)
  if (index < 0) {
    const error = new Error(strings.errors.notFound)
    error.status = 404
    error.fieldErrors = { id: strings.errors.notFound }
    throw error
  }
  appointments[index] = { ...appointments[index], status, staffNote }
  return appointments[index]
}

// ---------- Team (demo, in memory) ----------
const demoStaff = [
  { id: 'demo-admin', role: 'admin', displayName: 'Administración', active: true, sortOrder: 0 },
  { id: 'demo-t1', role: 'therapist', displayName: 'Ana Fisio', active: true, sortOrder: 1 },
  { id: 'demo-t2', role: 'therapist', displayName: 'Luis Fisio', active: true, sortOrder: 2 },
  { id: 'demo-desk', role: 'front_desk', displayName: 'Recepción', active: true, sortOrder: 0 },
]
const demoHours = []
for (const t of ['demo-t1', 'demo-t2']) {
  for (let weekday = 1; weekday <= 6; weekday += 1) {
    demoHours.push({ id: crypto.randomUUID(), staffId: t, weekday, start: '08:00', end: '20:00' })
  }
}
const demoTimeOff = []

// Mirrors the database rules so the demo behaves like live (migrations 0700 + 0750).
function demoError(code, dbMessage) {
  return Object.assign(new Error(dbMessage), { code, dbMessage, status: code === '42501' ? 403 : 400, fieldErrors: {} })
}
const DEMO_STAFF_LIMIT = 6

export async function listStaff() {
  return demoStaff.map((s) => ({ ...s }))
}
export async function updateStaff(id, patch) {
  const s = demoStaff.find((x) => x.id === id)
  if (!s) throw demoError('42501', 'not allowed')
  const next = { ...s, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
  if (next.role !== s.role) throw demoError('42501', 'staff role cannot be changed from the app')
  if (next.displayName !== s.displayName) {
    next.displayName = String(next.displayName).trim()
    if (!next.displayName) throw demoError('23514', 'staff display_name cannot be blank')
  }
  if (s.role === 'admin' && s.active && !next.active && !demoStaff.some((x) => x !== s && x.role === 'admin' && x.active)) {
    throw demoError('23514', 'last active admin of clinic cannot be removed')
  }
  if (!s.active && next.active && demoStaff.filter((x) => x.active).length >= DEMO_STAFF_LIMIT) {
    throw demoError('23514', `staff limit (${DEMO_STAFF_LIMIT}) reached for clinic`)
  }
  Object.assign(s, next)
  return { ...s }
}
export async function listStaffHours() {
  return demoHours.map((h) => ({ ...h }))
}
// All rows or none, like the single array POST on live; overlap = staff_hours_no_overlap.
export async function addStaffHours(rows) {
  const all = [...demoHours]
  for (const row of rows) {
    if (row.end <= row.start) throw demoError('23514', 'staff_hours_check')
    if (all.some((h) => h.staffId === row.staffId && h.weekday === row.weekday && h.start < row.end && row.start < h.end)) {
      throw demoError('23P01', 'conflicting key value violates exclusion constraint "staff_hours_no_overlap"')
    }
    all.push(row)
  }
  const added = rows.map((row) => ({ id: crypto.randomUUID(), ...row }))
  demoHours.push(...added)
  return added.map((h) => ({ ...h }))
}
export async function deleteStaffHours(id) {
  const i = demoHours.findIndex((h) => h.id === id)
  if (i >= 0) demoHours.splice(i, 1)
}
export async function listTimeOff() {
  return demoTimeOff.map((o) => ({ ...o }))
}
export async function addTimeOff(row) {
  if (row.endDate < row.startDate) throw demoError('23514', 'staff_time_off_check')
  const o = { id: crypto.randomUUID(), reason: '', ...row }
  demoTimeOff.push(o)
  return { ...o }
}
export async function deleteTimeOff(id) {
  const i = demoTimeOff.findIndex((o) => o.id === id)
  if (i >= 0) demoTimeOff.splice(i, 1)
}
