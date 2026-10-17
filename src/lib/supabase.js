import { config } from '../config/clinic.config.js'
import { strings } from '../i18n/strings.js'
import { lookupCode } from '../store/bookingLogic.js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clinicId = config.clinicId ?? ''
// Scoped per clinic so two clinic builds on one origin don't share a login.
const SESSION_KEY = `booking_staff_session:${clinicId}`

export const isSupabaseConfigured = Boolean(url && anonKey)
export const isAppConfigured = Boolean(isSupabaseConfigured && UUID_RE.test(clinicId))

const ALLOWED = {
  guest: [
    { method: 'POST', pathPrefix: '/rpc/clinic_today' },
    { method: 'POST', pathPrefix: '/rpc/list_therapists' },
    { method: 'POST', pathPrefix: '/rpc/get_available_slots' },
    { method: 'POST', pathPrefix: '/rpc/request_appointment' },
  ],
  staff: [
    { method: 'GET', pathPrefix: '/appointments' },
    { method: 'PATCH', pathPrefix: '/appointments' },
    { method: 'GET', pathPrefix: '/staff' },
    { method: 'PATCH', pathPrefix: '/staff?' },
    { method: 'GET', pathPrefix: '/clinics?' },
    { method: 'GET', pathPrefix: '/staff_hours' },
    { method: 'POST', pathPrefix: '/staff_hours' },
    { method: 'DELETE', pathPrefix: '/staff_hours?' },
    { method: 'GET', pathPrefix: '/staff_time_off' },
    { method: 'POST', pathPrefix: '/staff_time_off' },
    { method: 'DELETE', pathPrefix: '/staff_time_off?' },
  ],
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function setSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY)
    return
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function persistAuth(body) {
  const session = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    user: body.user ?? null,
  }
  setSession(session)
  return session
}

async function authFetch(path, options = {}) {
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(strings.errors.signIn)
  }
  return body
}

export async function signIn(email, password) {
  return persistAuth(
    await authFetch('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  )
}

export async function signOut() {
  const session = getSession()
  try {
    if (session?.access_token) {
      await authFetch('/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    }
  } finally {
    setSession(null)
  }
}

async function refreshSession() {
  const session = getSession()
  if (!session?.refresh_token) return null
  try {
    return persistAuth(
      await authFetch('/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }),
    )
  } catch {
    setSession(null)
    return null
  }
}

async function getStaffToken() {
  let session = getSession()
  if (!session?.access_token) return null
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 30) {
    session = await refreshSession()
  }
  return session?.access_token ?? null
}

// Exported for tests only.
export function applyMiddleware(role, method, path) {
  const allowed = ALLOWED[role]?.some(
    (rule) => method === rule.method && path.startsWith(rule.pathPrefix),
  )
  if (!allowed) {
    const error = new Error(`${role} cannot ${method} ${path.split('?')[0]}`)
    error.status = 403
    error.fieldErrors = {}
    throw error
  }
}

// request_appointment raises P0001 with one of these codes as the message.
// throwQueryError is exported for tests only (src/lib/bookingErrors.test.js).
const BOOKING_ERRORS = {
  slot_taken: { field: 'time', status: 409 },
  past_slot: { field: 'time', status: 409 },
  outside_hours: { field: 'time', status: 409 },
  time_off: { field: 'time', status: 409 },
  too_far: { field: 'date', status: 422 },
  bad_time: { field: 'time', status: 422 },
  inactive_staff: { field: 'therapist', status: 409 },
  unknown_clinic: { field: 'form', status: 422 },
}

export function throwQueryError(body, status, role) {
  const code = body?.code
  const booking = code === 'P0001' ? lookupCode(BOOKING_ERRORS, body?.message) : null
  if (booking) {
    const message = lookupCode(strings.errors.booking, body.message) ?? strings.errors.send
    const error = new Error(message)
    error.status = booking.status
    error.code = body.message
    error.fieldErrors = { [booking.field]: message }
    throw error
  }
  const fallback = role === 'staff' ? strings.errors.update : strings.errors.send
  // PostgREST answers anon RLS/privilege failures (42501) with 401; for guests that is a send error.
  const message =
    code === '23505'
      ? strings.errors.slotTaken
      : status === 401 && role === 'staff'
        ? strings.errors.signInRequired
        : fallback
  const error = new Error(message)
  error.code = code
  error.dbMessage = body?.message ?? ''
  error.status = code === '23505' ? 409 : status
  error.fieldErrors = code === '23505' ? { time: message } : { form: message }
  throw error
}

async function rest(role, path, options = {}) {
  const method = options.method ?? 'GET'
  applyMiddleware(role, method, path)

  const token = role === 'staff' ? await getStaffToken() : anonKey
  if (role === 'staff' && !token) {
    const error = new Error(strings.errors.signInRequired)
    error.status = 401
    error.fieldErrors = { form: strings.errors.signInRequired }
    throw error
  }

  let response
  try {
    response = await fetch(`${url}/rest/v1${path}`, {
      ...options,
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...options.headers,
      },
    })
  } catch {
    // fetch only rejects on network failure (offline, DNS, CORS): never show the raw "Failed to fetch".
    const error = new Error(strings.errors.reach)
    error.network = true
    error.status = 0
    error.fieldErrors = { form: strings.errors.reach }
    throw error
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) throwQueryError(body, response.status, role)
  return body
}

function fromRow(row) {
  return {
    id: row.id,
    clientName: row.client_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    service: row.service ?? '',
    notes: row.notes ?? '',
    date: row.slot_date,
    time: row.slot_time,
    status: row.status,
    staffNote: row.staff_note ?? '',
    staffId: row.staff_id ?? null,
    requestedAt: row.requested_at ?? '',
  }
}

function firstRow(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row) {
    const error = new Error(strings.errors.notFound)
    error.status = 404
    error.fieldErrors = { id: strings.errors.notFound }
    throw error
  }
  return fromRow(row)
}

// Guests: the clinic's local date.
export async function getClinicToday() {
  const today = await rest('guest', '/rpc/clinic_today', {
    method: 'POST',
    body: JSON.stringify({ p_clinic_id: clinicId }),
  })
  if (typeof today !== 'string') throw new Error(strings.errors.reach)
  return today
}

// Active therapists of this clinic: id + display name only.
export async function listTherapists() {
  const rows = await rest('guest', '/rpc/list_therapists', {
    method: 'POST',
    body: JSON.stringify({ p_clinic_id: clinicId }),
  })
  return (rows ?? []).map((row) => ({ id: row.id, displayName: row.display_name ?? '' }))
}

// Free slots for one therapist, generated server-side from their hours (past/taken/time off removed).
export async function listAvailableSlots(staffId, from, to) {
  const rows = await rest('guest', '/rpc/get_available_slots', {
    method: 'POST',
    body: JSON.stringify({ p_clinic_id: clinicId, p_staff_id: staffId, p_from: from, p_to: to }),
  })
  return (rows ?? []).map((row) => ({ date: row.slot_date, time: row.slot_time }))
}

export async function createAppointment(request) {
  // All checks (therapist, hours, time off, past, free) happen in request_appointment.
  const id = await rest('guest', '/rpc/request_appointment', {
    method: 'POST',
    body: JSON.stringify({
      p_clinic_id: clinicId,
      p_staff_id: request.staffId,
      p_slot_date: request.date,
      p_slot_time: request.time,
      p_client_name: request.clientName,
      p_email: request.email,
      p_phone: request.phone ?? '',
      p_service: request.service,
      p_notes: request.notes ?? '',
    }),
  })

  return {
    id,
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
}

export async function listAppointments() {
  // RLS scopes rows by clinic and role; the filter keeps multi-clinic staff on this site's clinic.
  const rows = await rest(
    'staff',
    `/appointments?clinic_id=eq.${clinicId}&select=*&order=slot_date.asc,slot_time.asc`,
  )
  return (rows ?? []).map(fromRow)
}

export async function updateAppointment(id, { status, staffNote = '' }) {
  return firstRow(
    await rest('staff', `/appointments?id=eq.${encodeURIComponent(id)}&clinic_id=eq.${clinicId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, staff_note: staffNote }),
    }),
  )
}

// Returns 'admin' | 'therapist' | 'front_desk', or null when the user isn't staff of this clinic.
export async function getStaffMembership(userId) {
  const rows = await rest(
    'staff',
    `/staff?user_id=eq.${encodeURIComponent(userId)}&clinic_id=eq.${clinicId}&select=role`,
  )
  return rows?.[0]?.role ?? null
}

// ---------- Team (admin): names, active, order, weekly hours, time off. RLS: admin-only writes. ----------
function fromStaffRow(row) {
  return {
    id: row.user_id,
    role: row.role,
    displayName: row.display_name ?? '',
    active: row.active !== false,
    sortOrder: row.sort_order ?? 0,
  }
}

export async function listStaff() {
  const rows = await rest(
    'staff',
    `/staff?clinic_id=eq.${clinicId}&select=user_id,role,display_name,active,sort_order&order=sort_order.asc,display_name.asc`,
  )
  return (rows ?? []).map(fromStaffRow)
}

export async function updateStaff(id, { displayName, active, sortOrder }) {
  const patch = {}
  if (displayName !== undefined) patch.display_name = displayName
  if (active !== undefined) patch.active = active
  if (sortOrder !== undefined) patch.sort_order = sortOrder
  const rows = await rest('staff', `/staff?user_id=eq.${encodeURIComponent(id)}&clinic_id=eq.${clinicId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  if (!rows?.length) throw Object.assign(new Error(strings.errors.update), { status: 403, fieldErrors: {} })
  return fromStaffRow(rows[0])
}

export async function listStaffHours() {
  const rows = await rest('staff', `/staff_hours?clinic_id=eq.${clinicId}&select=id,staff_id,weekday,start_time,end_time&order=weekday.asc,start_time.asc`)
  return (rows ?? []).map((row) => ({
    id: row.id,
    staffId: row.staff_id,
    weekday: row.weekday,
    start: String(row.start_time).slice(0, 5),
    end: String(row.end_time).slice(0, 5),
  }))
}

// One POST with an array: PostgREST inserts it in a single statement, so all rows save or none do.
export async function addStaffHours(rows) {
  const saved = await rest('staff', '/staff_hours', {
    method: 'POST',
    body: JSON.stringify(
      rows.map(({ staffId, weekday, start, end }) => ({
        clinic_id: clinicId, staff_id: staffId, weekday, start_time: start, end_time: end,
      })),
    ),
  })
  return (saved ?? []).map((row) => ({
    id: row.id,
    staffId: row.staff_id,
    weekday: row.weekday,
    start: String(row.start_time).slice(0, 5),
    end: String(row.end_time).slice(0, 5),
  }))
}

export async function deleteStaffHours(id) {
  await rest('staff', `/staff_hours?id=eq.${encodeURIComponent(id)}&clinic_id=eq.${clinicId}`, { method: 'DELETE' })
}

// Session length (clinics.slot_minutes). Staff can read their own clinic row (RLS "Staff read their clinics").
export async function getSlotMinutes() {
  const rows = await rest('staff', `/clinics?id=eq.${clinicId}&select=slot_minutes`)
  const minutes = Number(rows?.[0]?.slot_minutes)
  return Number.isInteger(minutes) && minutes > 0 ? minutes : undefined
}

export async function listTimeOff() {
  const rows = await rest('staff', `/staff_time_off?clinic_id=eq.${clinicId}&select=id,staff_id,start_date,end_date,reason&order=start_date.asc`)
  return (rows ?? []).map((row) => ({
    id: row.id,
    staffId: row.staff_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason ?? '',
  }))
}

// Approvals only needs who is off and when; `reason` is admin-only (Team page) and never fetched here.
export async function listTimeOffDates() {
  const rows = await rest('staff', `/staff_time_off?clinic_id=eq.${clinicId}&select=staff_id,start_date,end_date&order=start_date.asc`)
  return (rows ?? []).map((row) => ({ staffId: row.staff_id, startDate: row.start_date, endDate: row.end_date }))
}

export async function addTimeOff({ staffId, startDate, endDate, reason = '' }) {
  const rows = await rest('staff', '/staff_time_off', {
    method: 'POST',
    body: JSON.stringify({ clinic_id: clinicId, staff_id: staffId, start_date: startDate, end_date: endDate, reason }),
  })
  return { id: rows?.[0]?.id, staffId, startDate, endDate, reason }
}

export async function deleteTimeOff(id) {
  await rest('staff', `/staff_time_off?id=eq.${encodeURIComponent(id)}&clinic_id=eq.${clinicId}`, { method: 'DELETE' })
}
