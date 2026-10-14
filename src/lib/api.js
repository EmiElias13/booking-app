import * as live from './supabase.js'

export const isSupabaseConfigured =
  import.meta.env.VITE_DEMO === 'true' ? true : live.isSupabaseConfigured
export const isAppConfigured = import.meta.env.VITE_DEMO === 'true' ? true : live.isAppConfigured

export function getSession() {
  if (import.meta.env.VITE_DEMO === 'true') {
    try {
      return JSON.parse(sessionStorage.getItem('clinic_demo_session') ?? 'null')
    } catch {
      return null
    }
  }
  return live.getSession()
}

export function setSession(session) {
  if (import.meta.env.VITE_DEMO === 'true') {
    if (session) sessionStorage.setItem('clinic_demo_session', JSON.stringify(session))
    else sessionStorage.removeItem('clinic_demo_session')
    return
  }
  live.setSession(session)
}

export async function signIn(email, password) {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).signIn(email, password)
  }
  return live.signIn(email, password)
}

export async function signOut() {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).signOut()
  }
  return live.signOut()
}

export async function getClinicToday() {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../data/clinic.js')).todayISO()
  }
  return live.getClinicToday()
}

export async function listTakenSlots(from, to) {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).listTakenSlots(from, to)
  }
  return live.listTakenSlots(from, to)
}

export async function getStaffMembership(userId) {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).getStaffMembership(userId)
  }
  return live.getStaffMembership(userId)
}

export async function listAppointments() {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).listAppointments()
  }
  return live.listAppointments()
}

export async function createAppointment(request) {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).createAppointment(request)
  }
  return live.createAppointment(request)
}

export async function updateAppointment(id, patch) {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).updateAppointment(id, patch)
  }
  return live.updateAppointment(id, patch)
}
