const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const SESSION_KEY = 'movewell_physio_session'

export const isSupabaseConfigured = Boolean(url && anonKey)

const ALLOWED = {
  guest: [
    { method: 'GET', pathPrefix: '/appointment_slots' },
    { method: 'POST', pathPrefix: '/appointments' },
  ],
  admin: [
    { method: 'GET', pathPrefix: '/appointments' },
    { method: 'PATCH', pathPrefix: '/appointments' },
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
    throw new Error(body?.error_description || body?.msg || body?.message || 'Auth request failed')
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

async function getAdminToken() {
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
  const error = new Error(body?.message ?? 'Request failed')
  error.status = code === '23505' ? 409 : status
  error.fieldErrors =
    role === 'admin' && error.status === 401
      ? { form: 'Physio sign-in required' }
      : code === '23505'
        ? { time: 'That slot was just taken' }
        : { form: error.message }
  throw error
}

async function rest(role, path, options = {}) {
  const method = options.method ?? 'GET'
  applyMiddleware(role, method, path)

  const token = role === 'admin' ? await getAdminToken() : anonKey
  if (role === 'admin' && !token) {
    const error = new Error('Physio sign-in required')
    error.status = 401
    error.fieldErrors = { form: 'Physio sign-in required' }
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
    physioNote: row.physio_note ?? '',
    requestedAt: row.requested_at ?? '',
  }
}

function firstRow(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row) {
    const error = new Error('Appointment not found')
    error.status = 404
    error.fieldErrors = { id: 'Appointment not found' }
    throw error
  }
  return fromRow(row)
}

export async function listSlots() {
  const rows = await rest('guest', '/appointment_slots?select=*&order=slot_date.asc,slot_time.asc')
  return (rows ?? []).map(fromRow)
}

export async function createAppointment(request) {
  await rest('guest', '/appointments', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_name: request.clientName,
      email: request.email,
      phone: request.phone ?? '',
      service: request.service,
      notes: request.notes ?? '',
      slot_date: request.date,
      slot_time: request.time,
      status: 'pending',
      physio_note: '',
    }),
  })

  const rows = await rest(
    'guest',
    `/appointment_slots?slot_date=eq.${encodeURIComponent(request.date)}&slot_time=eq.${encodeURIComponent(request.time)}&select=*`,
  )
  const slot = Array.isArray(rows) ? rows[0] : null

  return {
    id: slot?.id ?? crypto.randomUUID(),
    clientName: request.clientName,
    email: request.email,
    phone: request.phone ?? '',
    service: request.service,
    notes: request.notes ?? '',
    date: slot?.slot_date ?? request.date,
    time: slot?.slot_time ?? request.time,
    status: slot?.status ?? 'pending',
    physioNote: '',
    requestedAt: new Date().toISOString(),
  }
}

export async function listAppointments() {
  const rows = await rest('admin', '/appointments?select=*&order=slot_date.asc,slot_time.asc')
  return (rows ?? []).map(fromRow)
}

export async function updateAppointment(id, { status, physioNote = '' }) {
  return firstRow(
    await rest('admin', `/appointments?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, physio_note: physioNote }),
    }),
  )
}
