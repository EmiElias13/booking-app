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
    { clientName: 'Ana López', email: 'ana@ejemplo.com', service: 'initial', day: 1, time: '09:00', staffId: 'demo-t1', status: 'pending', notes: 'Molestia en la rodilla al subir escaleras.' },
    { clientName: 'Carlos Ruiz', email: 'carlos@ejemplo.com', service: 'followup', day: 1, time: '11:00', staffId: 'demo-t2', status: 'pending', notes: '' },
    { clientName: 'Sofía Méndez', email: 'sofia@ejemplo.com', service: 'short', day: 2, time: '15:00', staffId: 'demo-t1', status: 'pending', notes: 'Prefiero por la tarde.' },
    { clientName: 'Jorge Castillo', email: 'jorge@ejemplo.com', service: 'followup', day: 0, time: '10:00', staffId: 'demo-t2', status: 'approved', staffNote: 'Te esperamos, llega 10 min antes.' },
    { clientName: 'Lucía Herrera', email: 'lucia@ejemplo.com', service: 'initial', day: 3, time: '08:00', staffId: 'demo-t1', status: 'declined', staffNote: 'Ese día no hay espacio, ¿te funciona el jueves?' },
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
    staffId: row.staffId ?? null,
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

// Guest booking mirrors request_appointment (0700): therapist, hours, time off, past, free.
function bookingError(code, field = 'time') {
  const message = strings.errors.booking[code] ?? strings.errors.send
  return Object.assign(new Error(message), { code, status: 409, fieldErrors: { [field]: message } })
}

export async function createAppointment(request) {
  const therapist = demoStaff.find((s) => s.id === request.staffId && s.role === 'therapist' && s.active)
  if (!therapist) throw bookingError('inactive_staff', 'therapist')
  const free = demoFreeSlots(request.staffId, request.date, request.date)
  if (!free.some((s) => s.time === request.time)) {
    const taken = appointments.some(
      (a) => a.date === request.date && a.time === request.time && a.status !== 'declined',
    )
    throw bookingError(taken ? 'slot_taken' : 'outside_hours')
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
    staffId: request.staffId,
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

// ---------- Guest picker (demo) ----------
const DEMO_SLOT_MINUTES = 60
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export async function listTherapists() {
  return demoStaff
    .filter((s) => s.role === 'therapist' && s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName))
    .map((s) => ({ id: s.id, displayName: s.displayName }))
}

// Same rules as get_available_slots: hours grid, minus time off, past-today and taken (clinic-wide until 0800).
function demoFreeSlots(staffId, from, to) {
  const s = demoStaff.find((x) => x.id === staffId)
  if (!s || s.role !== 'therapist' || !s.active) return []
  const today = localISODate(0)
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const start = from < today ? today : from
  const out = []
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10)
    if (demoTimeOff.some((o) => o.staffId === staffId && date >= o.startDate && date <= o.endDate)) continue
    for (const h of demoHours.filter((x) => x.staffId === staffId && x.weekday === d.getUTCDay())) {
      for (let m = toMin(h.start); m + DEMO_SLOT_MINUTES <= toMin(h.end); m += DEMO_SLOT_MINUTES) {
        if (date === today && m <= nowMin) continue
        const time = toHHMM(m)
        if (appointments.some((a) => a.date === date && a.time === time && a.status !== 'declined')) continue
        out.push({ date, time })
      }
    }
  }
  return out
}

export async function listAvailableSlots(staffId, from, to) {
  return demoFreeSlots(staffId, from, to)
}
