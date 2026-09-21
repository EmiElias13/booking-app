import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const API_BASE = '/api'

const AppointmentsContext = createContext(null)

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error('Request failed')
    error.status = response.status
    error.fieldErrors = body?.errors ?? {}
    throw error
  }
  return body
}

export function AppointmentsProvider({ children }) {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setAppointments(await apiFetch('/appointments'))
      setApiError(null)
    } catch {
      setApiError('Cannot reach the booking service. Is the Flask API running?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const requestSlot = useCallback(async (request) => {
    const appointment = await apiFetch('/appointments', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    setAppointments((current) => [...current, appointment])
    return appointment
  }, [])

  const decide = useCallback(async (id, status, physioNote = '') => {
    const updated = await apiFetch(`/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, physioNote }),
    })
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
