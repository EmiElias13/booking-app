import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAppointment,
  getClinicToday,
  isAppConfigured,
  listAppointments,
  listAvailableSlots,
  listTherapists,
  updateAppointment,
} from '../lib/api.js'
import { strings } from '../i18n/strings.js'
import { todayISO } from '../data/clinic.js'
import { useAuth } from './auth.jsx'

const AppointmentsContext = createContext(null)

function slotRange(today) {
  const to = new Date(`${today}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 90)
  return [today, to.toISOString().slice(0, 10)]
}

// Clinic's date from the server, fetched once per page load; falls back to the
// clinic-timezone date computed locally (also used while loading / in demo).
let clinicTodayPromise = null
function loadClinicToday() {
  clinicTodayPromise ??= getClinicToday().catch(() => todayISO())
  return clinicTodayPromise
}

// date -> sorted array of free times
function toSlotMap(slots) {
  const map = new Map()
  for (const { date, time } of slots) {
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(time)
  }
  for (const times of map.values()) times.sort()
  return map
}

export function AppointmentsProvider({ children }) {
  const { isStaff } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [therapists, setTherapists] = useState([])
  const [therapistId, setTherapistId] = useState('')
  const [available, setAvailable] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [clinicToday, setClinicToday] = useState(() => todayISO())
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
        const today = await loadClinicToday()
        setClinicToday(today)
        setTherapists(await listTherapists())
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

  const staffIdRef = useRef('')
  // Guests: free slots of the chosen therapist (none until one is chosen).
  const loadSlots = useCallback(async (staffId) => {
    if (!staffId) {
      setAvailable([])
      return
    }
    setSlotsLoading(true)
    try {
      const today = await loadClinicToday()
      const slots = await listAvailableSlots(staffId, ...slotRange(today))
      setAvailable((current) => (staffIdRef.current === staffId ? slots : current))
      setApiError(null)
    } catch {
      setApiError(strings.errors.reach)
    } finally {
      setSlotsLoading(false)
    }
  }, [])

  const selectTherapist = useCallback(
    (staffId) => {
      staffIdRef.current = staffId
      setTherapistId(staffId)
      setAvailable([])
      loadSlots(staffId)
    },
    [loadSlots],
  )

  const requestSlot = useCallback(async (request) => {
    try {
      const appointment = await createAppointment(request)
      setMyRequests((current) => [...current, appointment])
      setAvailable((current) => current.filter((s) => !(s.date === appointment.date && s.time === appointment.time)))
      return appointment
    } catch (error) {
      // Slot no longer bookable / therapist gone: re-fetch so the picker shows the new state.
      if (error.status === 409) {
        if (error.code === 'inactive_staff') refresh()
        else loadSlots(request.staffId)
      }
      throw error
    }
  }, [refresh, loadSlots])

  const decide = useCallback(async (id, status, staffNote = '') => {
    const updated = await updateAppointment(id, { status, staffNote })
    setAppointments((current) =>
      current.map((appointment) => (appointment.id === id ? updated : appointment)),
    )
    return updated
  }, [])

  const availableSlots = useMemo(() => toSlotMap(available), [available])

  const value = useMemo(
    () => ({
      appointments, myRequests, clinicToday, loading, apiError, refresh, requestSlot, decide,
      therapists, therapistId, selectTherapist, availableSlots, slotsLoading,
    }),
    [appointments, myRequests, clinicToday, loading, apiError, refresh, requestSlot, decide,
      therapists, therapistId, selectTherapist, availableSlots, slotsLoading],
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
