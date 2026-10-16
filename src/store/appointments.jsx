import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createAppointment,
  getClinicToday,
  isAppConfigured,
  listAppointments,
  listAvailableSlots,
  listStaff,
  listStaffHours,
  listTimeOff,
  listTherapists,
  updateAppointment,
} from '../lib/api.js'
import { strings } from '../i18n/strings.js'
import { todayISO } from '../data/clinic.js'
import { useAuth } from './auth.jsx'
import { createLatestGate, keepTherapist } from './bookingLogic.js'

const AppointmentsContext = createContext(null)

const EMPTY_TEAM = { staff: [], hours: [], timeOff: [] }

// Staff list, hours and time off for the Approvals filter and "Revisar" flag.
// Optional extras: if they fail, Approvals still works, just without names/flags.
async function loadTeam() {
  try {
    const [staff, hours, timeOff] = await Promise.all([listStaff(), listStaffHours(), listTimeOff()])
    return { staff, hours, timeOff }
  } catch {
    return EMPTY_TEAM
  }
}

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
  const [team, setTeam] = useState(EMPTY_TEAM)
  const [therapists, setTherapists] = useState([])
  const [therapistId, setTherapistId] = useState('')
  const [available, setAvailable] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [clinicToday, setClinicToday] = useState(() => todayISO())
  const [apiError, setApiError] = useState(null)
  // Guest-side network failures, shown in place of the picker / slots with a retry.
  const [therapistsError, setTherapistsError] = useState(false)
  const [slotsError, setSlotsError] = useState(false)
  const staffIdRef = useRef('')
  const slotsGate = useRef(createLatestGate()).current

  const refresh = useCallback(async () => {
    if (!isAppConfigured) {
      setApiError(strings.errors.config)
      setLoading(false)
      return
    }

    try {
      if (isStaff) {
        const [list, nextTeam] = await Promise.all([listAppointments(), loadTeam()])
        setAppointments(list)
        setTeam(nextTeam)
        setClinicToday(await loadClinicToday())
      } else {
        const today = await loadClinicToday()
        setClinicToday(today)
        const list = await listTherapists()
        setTherapists(list)
        setTherapistsError(false)
        // Selected therapist was deactivated: drop the selection (Home resets date and time).
        if (staffIdRef.current && !keepTherapist(list, staffIdRef.current)) {
          staffIdRef.current = ''
          slotsGate.next()
          setTherapistId('')
          setAvailable([])
          setSlotsError(false)
          setSlotsLoading(false)
        }
      }
      setApiError(null)
    } catch (error) {
      if (isStaff) setApiError(error.status === 401 ? strings.errors.signInRequired : strings.errors.reach)
      else setTherapistsError(true)
    } finally {
      setLoading(false)
    }
  }, [isStaff, slotsGate])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Guests: free slots of the chosen therapist (none until one is chosen).
  // Only the latest request may update state, so a slow response for a previous therapist is ignored.
  const loadSlots = useCallback(async (staffId) => {
    const requestId = slotsGate.next()
    setSlotsError(false)
    if (!staffId) {
      setAvailable([])
      setSlotsLoading(false)
      return
    }
    setSlotsLoading(true)
    try {
      const today = await loadClinicToday()
      const slots = await listAvailableSlots(staffId, ...slotRange(today))
      if (!slotsGate.isCurrent(requestId)) return
      setAvailable(slots)
    } catch {
      if (slotsGate.isCurrent(requestId)) setSlotsError(true)
    } finally {
      if (slotsGate.isCurrent(requestId)) setSlotsLoading(false)
    }
  }, [slotsGate])

  const retrySlots = useCallback(() => loadSlots(staffIdRef.current), [loadSlots])

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
      appointments, team, myRequests, clinicToday, loading, apiError, refresh, requestSlot, decide,
      therapists, therapistId, selectTherapist, availableSlots, slotsLoading,
      therapistsError, slotsError, retrySlots,
    }),
    [appointments, team, myRequests, clinicToday, loading, apiError, refresh, requestSlot, decide,
      therapists, therapistId, selectTherapist, availableSlots, slotsLoading,
      therapistsError, slotsError, retrySlots],
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
