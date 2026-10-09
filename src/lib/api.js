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

export async function listSlots() {
  if (import.meta.env.VITE_DEMO === 'true') {
    return (await import('../demo/api.js')).listSlots()
  }
  return live.listSlots()
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
