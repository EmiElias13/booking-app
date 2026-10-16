// Pure helpers for the staff Approvals screen (D3 PR 4): therapist filter and the "Revisar" flag.

export const UNASSIGNED = 'none'

// 'HH:MM' + minutes -> 'HH:MM' (24:00 or later stays > any end time, so it reads as outside hours).
function addMinutes(hhmm, minutes) {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Name shown on a card: '' id = unassigned label; id not in the staff list = missing placeholder (never blank).
export function therapistLabel(staffId, staff, { unassigned, missing }) {
  if (!staffId) return unassigned
  return staff.find((member) => member.id === staffId)?.displayName || missing
}

// Therapist ids used by bookings but absent from the staff list, so the filter can still reach them.
export function missingTherapistIds(appointments, staff) {
  const known = new Set(staff.map((member) => member.id))
  return [...new Set(appointments.map((a) => a.staffId).filter((id) => id && !known.has(id)))]
}

// Why a booking needs a human look (decision 12: flag only, never auto-act).
// Only pending/approved bookings that have not started yet are checked; legacy rows without a therapist are not flagged.
// Returns [] when fine, else any of 'inactive' | 'timeOff' | 'outsideHours'.
// slotMinutes: booking length (clinics.slot_minutes on live). Appointments store only a start time, so when it is
// not known the check falls back to the start alone.
export function reviewReasons(appointment, { staff = [], hours = [], timeOff = [], today, nowHHMM, slotMinutes }) {
  if (appointment.status !== 'pending' && appointment.status !== 'approved') return []
  if (!appointment.staffId) return []
  const { date, time } = appointment
  if (date < today || (date === today && time <= nowHHMM)) return []

  const member = staff.find((s) => s.id === appointment.staffId)
  // Not in the staff list: removed from the clinic or never loaded; treat like inactive only when the list loaded.
  if (!member) return staff.length ? ['inactive'] : []

  const reasons = []
  if (!member.active) reasons.push('inactive')
  if (timeOff.some((o) => o.staffId === member.id && date >= o.startDate && date <= o.endDate)) reasons.push('timeOff')
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const end = slotMinutes > 0 ? addMinutes(time, slotMinutes) : null
  const inHours = hours.some(
    (h) => h.staffId === member.id && h.weekday === weekday && time >= h.start && time < h.end && (end === null || (end > time && end <= h.end)),
  )
  if (!inHours) reasons.push('outsideHours')
  return reasons
}

// Therapists for the filter, in the clinic's order; inactive ones stay so their bookings can still be found.
export function therapistOptions(staff) {
  return staff
    .filter((s) => s.role === 'therapist')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.displayName.localeCompare(b.displayName))
}

// '' = everyone; UNASSIGNED = bookings without a therapist (legacy, before the data step).
export function matchesTherapist(appointment, therapistFilter) {
  if (!therapistFilter) return true
  if (therapistFilter === UNASSIGNED) return !appointment.staffId
  return appointment.staffId === therapistFilter
}
