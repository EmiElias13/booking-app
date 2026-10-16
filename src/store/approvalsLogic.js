// Pure helpers for the staff Approvals screen (D3 PR 4): therapist filter and the "Revisar" flag.

export const UNASSIGNED = 'none'

// Why a booking needs a human look (decision 12: flag only, never auto-act).
// Only pending/approved bookings that have not started yet are checked; legacy rows without a therapist are not flagged.
// Returns [] when fine, else any of 'inactive' | 'timeOff' | 'outsideHours'.
export function reviewReasons(appointment, { staff = [], hours = [], timeOff = [], today, nowHHMM }) {
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
  const inHours = hours.some((h) => h.staffId === member.id && h.weekday === weekday && time >= h.start && time < h.end)
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
