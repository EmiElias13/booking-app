import { config } from '../config/clinic.config.js'
import { strings } from '../i18n/strings.js'

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
    { method: 'POST', pathPrefix: '/rpc/get_taken_slots' },
    { method: 'POST', pathPrefix: '/rpc/clinic_today' },
    { method: 'POST', pathPrefix: '/appointments' },
  ],
  staff: [
    { method: 'GET', pathPrefix: '/appointments' },
    { method: 'PATCH', pathPrefix: '/appointments' },
    { method: 'GET', pathPrefix: '/staff' },
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

function applyMiddleware(role, method, path) {
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

function throwQueryError(body, status, role) {
  const code = body?.code
  const fallback = role === 'staff' ? strings.errors.update : strings.errors.send
  // PostgREST answers anon RLS/privilege failures (42501) with 401; for guests that is a send error.
  const message =
    code === '23505'
      ? strings.errors.slotTaken
      : status === 401 && role === 'staff'
        ? strings.errors.signInRequired
        : fallback
  const error = new Error(message)
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

  const response = await fetch(`${url}/rest/v1${path}`, {
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

// Guests: taken times only, one clinic, bounded range (the server clamps `from` to clinic-today).
export async function getClinicToday() {
  const today = await rest('guest', '/rpc/clinic_today', {
    method: 'POST',
    body: JSON.stringify({ p_clinic_id: clinicId }),
  })
  if (typeof today !== 'string') throw new Error(strings.errors.reach)
  return today
}

export async function listTakenSlots(from, to) {
  const rows = await rest('guest', '/rpc/get_taken_slots', {
    method: 'POST',
    body: JSON.stringify({ p_clinic_id: clinicId, p_from: from, p_to: to }),
  })
  return (rows ?? []).map((row) => ({ date: row.slot_date, time: row.slot_time }))
}

export async function createAppointment(request) {
  // Anon can't read the row back, so the client owns the id.
  const id = crypto.randomUUID()
  await rest('guest', '/appointments', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id,
      clinic_id: clinicId,
      client_name: request.clientName,
      email: request.email,
      phone: request.phone ?? '',
      service: request.service,
      notes: request.notes ?? '',
      slot_date: request.date,
      slot_time: request.time,
      // status / staff_note / staff_id are not in anon's column grant: DB defaults apply.
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
    staffId: null,
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
