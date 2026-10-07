import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  createAppointment,
  isSupabaseConfigured,
  listAppointments,
  listSlots,
  updateAppointment,
} from '../lib/supabase.js'
import { useAuth } from './auth.jsx'

const CONFIG_ERROR =
  'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.'
const REACH_ERROR = 'Cannot reach the booking service. Check your Supabase URL and anon key.'

const AppointmentsContext = createContext(null)

export function AppointmentsProvider({ children }) {
  const { isPhysio } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setApiError(CONFIG_ERROR)
      setLoading(false)
      return
    }

    try {
      setAppointments(isPhysio ? await listAppointments() : await listSlots())
      setApiError(null)
    } catch (error) {
      setApiError(isPhysio && error.status === 401 ? 'Physio sign-in required.' : REACH_ERROR)
    } finally {
      setLoading(false)
    }
  }, [isPhysio])

  useEffect(() => {
    refresh()
  }, [refresh])

  const requestSlot = useCallback(async (request) => {
    const appointment = await createAppointment(request)
    setAppointments((current) => [...current, appointment])
    return appointment
  }, [])

  const decide = useCallback(async (id, status, physioNote = '') => {
    const updated = await updateAppointment(id, { status, physioNote })
    setAppointments((current) =>
      current.map((appointment) => (appointment.id === id ? updated : appointment)),
    )
    return updated
  }, [])

  const value = useMemo(
    () => ({ appointments, loading, apiError, refresh, requestSlot, decide }),
    [appointments, loading, apiError, refresh, requestSlot, decide],
  )

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>
}

export function useAppointments() {
  const context = useContext(AppointmentsContext)
  if (!context) {
    throw new Error('useAppointments must be used inside an AppointmentsProvider')
  }
  return context
}
