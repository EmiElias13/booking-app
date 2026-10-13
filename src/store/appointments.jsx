import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  createAppointment,
  isAppConfigured,
  listAppointments,
  listTakenSlots,
  updateAppointment,
} from '../lib/api.js'
import { strings } from '../i18n/strings.js'
import { useAuth } from './auth.jsx'

const AppointmentsContext = createContext(null)

function isoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function takenRange() {
  const from = new Date()
  const to = new Date()
  to.setDate(to.getDate() + 90)
  return [isoDate(from), isoDate(to)]
}

function toTakenMap(slots) {
  const map = new Map()
  for (const { date, time } of slots) {
    if (!map.has(date)) map.set(date, new Set())
    map.get(date).add(time)
  }
  return map
}

export function AppointmentsProvider({ children }) {
  const { isStaff } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [guestTaken, setGuestTaken] = useState([])
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)

  const refresh = useCallback(async () => {
    if (!isAppConfigured) {
      setApiError(strings.errors.config)
      setLoading(false)
      return
    }

    try {
      if (isStaff) {
        setAppointments(await listAppointments())
      } else {
        setGuestTaken(await listTakenSlots(...takenRange()))
      }
      setApiError(null)
    } catch (error) {
      setApiError(isStaff && error.status === 401 ? strings.errors.signInRequired : strings.errors.reach)
    } finally {
      setLoading(false)
    }
  }, [isStaff])

  useEffect(() => {
    refresh()
  }, [refresh])

  const requestSlot = useCallback(async (request) => {
    try {
      const appointment = await createAppointment(request)
      setMyRequests((current) => [...current, appointment])
      setGuestTaken((current) => [...current, { date: appointment.date, time: appointment.time }])
      return appointment
    } catch (error) {
      // Slot taken: re-fetch so the grid shows the new state.
      if (error.status === 409) refresh()
      throw error
    }
  }, [refresh])

  const decide = useCallback(async (id, status, staffNote = '') => {
    const updated = await updateAppointment(id, { status, staffNote })
    setAppointments((current) =>
      current.map((appointment) => (appointment.id === id ? updated : appointment)),
    )
    return updated
  }, [])

  // date -> Set of taken times; staff derive it from their rows, guests from the RPC.
  const takenSlots = useMemo(
    () =>
      toTakenMap(
        isStaff
          ? appointments.filter((a) => a.status !== 'declined').map((a) => ({ date: a.date, time: a.time }))
          : guestTaken,
      ),
    [isStaff, appointments, guestTaken],
  )

  const value = useMemo(
    () => ({ appointments, takenSlots, myRequests, loading, apiError, refresh, requestSlot, decide }),
    [appointments, takenSlots, myRequests, loading, apiError, refresh, requestSlot, decide],
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
