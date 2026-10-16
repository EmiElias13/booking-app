import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addStaffHours,
  addTimeOff,
  deleteStaffHours,
  deleteTimeOff,
  listStaff,
  listStaffHours,
  listTimeOff,
  updateStaff,
} from '../lib/api.js'
import { formatDate } from '../data/clinic.js'
import { strings } from '../i18n/strings.js'
import { useAppointments } from '../store/appointments.jsx'

const T = strings.team
const WORK_DAYS = [1, 2, 3, 4, 5, 6]

// Maps an API/DB error to an Equipo message. Codes/messages come from migrations 0700 and 0750.
export function teamError(e) {
  const code = e?.code ?? ''
  const db = e?.dbMessage ?? ''
  if (e?.network) return T.errors.network
  if (code === '23P01' || db.includes('staff_hours_no_overlap')) return T.errors.overlap
  if (db.includes('staff limit')) return T.errors.staffLimit
  if (db.includes('last active admin')) return T.errors.lastAdmin
  if (db.includes('role cannot be changed')) return T.errors.role
  if (db.includes('display_name cannot be blank')) return T.errors.name
  if (code === '42501' || e?.status === 401 || e?.status === 403) return T.errors.permission
  return T.errors.save
}

// Days (of `days`) where start–end overlaps an existing range of this therapist. Same rule as the
// DB exclusion constraint: touching ranges (12:00–13:00 next to 13:00–14:00) are fine.
function overlappingDays(hours, days, start, end) {
  return days.filter((d) => hours.some((h) => h.weekday === d && h.start < end && start < h.end))
}

// Admin-only screen (route guarded by role; RLS is the real gate). One card per therapist.
export default function Team() {
  const { clinicToday } = useAppointments()
  const [staff, setStaff] = useState([])
  const [hours, setHours] = useState([])
  const [timeOff, setTimeOff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [s, h, o] = await Promise.all([listStaff(), listStaffHours(), listTimeOff()])
      setStaff(s)
      setHours(h)
      setTimeOff(o)
      setError(null)
    } catch (e) {
      setError(e?.network ? T.errors.network : strings.errors.reach)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const therapists = useMemo(() => staff.filter((s) => s.role === 'therapist'), [staff])

  return (
    <div className="page">
      <section className="hero enter">
        <h1>{T.title}</h1>
        <p>{T.intro}</p>
      </section>
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <p className="empty">{T.loading}</p>
      ) : therapists.length === 0 ? (
        <p className="empty">{T.empty}</p>
      ) : (
        <ul className="approval-list">
          {therapists.map((member) => (
            <TherapistCard
              key={member.id}
              member={member}
              clinicToday={clinicToday}
              hours={hours.filter((h) => h.staffId === member.id)}
              timeOff={timeOff.filter((o) => o.staffId === member.id && o.endDate >= clinicToday)}
              reload={load}
              onSave={async (patch) => {
                const updated = await updateStaff(member.id, patch)
                setStaff((cur) => cur.map((s) => (s.id === member.id ? { ...s, ...updated } : s)))
              }}
              onAddHours={(rows) => addStaffHours(rows.map((row) => ({ staffId: member.id, ...row })))}
              onRemoveHours={async (id) => {
                await deleteStaffHours(id)
                setHours((cur) => cur.filter((h) => h.id !== id))
              }}
              onAddTimeOff={async (row) => {
                const added = await addTimeOff({ staffId: member.id, ...row })
                setTimeOff((cur) => [...cur, added])
              }}
              onRemoveTimeOff={async (id) => {
                await deleteTimeOff(id)
                setTimeOff((cur) => cur.filter((o) => o.id !== id))
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SectionError({ message }) {
  return message ? <p className="banner banner-error" role="alert">{message}</p> : null
}

function TherapistCard({ member, clinicToday, hours, timeOff, reload, onSave, onAddHours, onRemoveHours, onAddTimeOff, onRemoveTimeOff }) {
  const [name, setName] = useState(member.displayName)
  const [order, setOrder] = useState(member.sortOrder)
  const [range, setRange] = useState({ weekday: 1, start: '08:00', end: '20:00' })
  const [off, setOff] = useState({ startDate: '', endDate: '', reason: '' })
  const [errors, setErrors] = useState({ profile: null, hours: null, timeOff: null })
  const [busy, setBusy] = useState(false)

  const byDay = useMemo(() => {
    const map = new Map()
    for (const h of [...hours].sort((a, b) => a.start.localeCompare(b.start))) {
      if (!map.has(h.weekday)) map.set(h.weekday, [])
      map.get(h.weekday).push(h)
    }
    return map
  }, [hours])

  const setSectionError = (section, message) => setErrors((cur) => ({ ...cur, [section]: message }))

  // Runs one save; the error lands next to the section that failed. Returns true on success.
  async function attempt(section, action, { reloadAfter = false } = {}) {
    setSectionError(section, null)
    setBusy(true)
    try {
      await action()
      if (reloadAfter) await reload()
      return true
    } catch (e) {
      setSectionError(section, teamError(e))
      await reload() // the screen must show what the server actually has
      return false
    } finally {
      setBusy(false)
    }
  }

  function saveProfile() {
    const trimmed = name.trim()
    if (!trimmed) return setSectionError('profile', T.errors.name)
    attempt('profile', async () => {
      await onSave({ displayName: trimmed, sortOrder: order })
      setName(trimmed)
    })
  }

  function addRange(days) {
    if (range.end <= range.start) return setSectionError('hours', T.errors.range)
    const clash = overlappingDays(hours, days, range.start, range.end)
    if (clash.length) {
      return setSectionError(
        'hours',
        days.length === 1 ? T.errors.overlap : T.errors.overlapDays.replace('{days}', clash.map((d) => T.weekdays[d]).join(', ')),
      )
    }
    attempt('hours', () => onAddHours(days.map((weekday) => ({ weekday, start: range.start, end: range.end }))), { reloadAfter: true })
  }

  async function addOff(event) {
    event.preventDefault()
    if (!off.startDate || !off.endDate || off.endDate < off.startDate) return setSectionError('timeOff', T.errors.dates)
    if (clinicToday && off.endDate < clinicToday) return setSectionError('timeOff', T.errors.pastDates)
    const ok = await attempt('timeOff', () => onAddTimeOff({ ...off, reason: off.reason.trim() }))
    if (ok) setOff({ startDate: '', endDate: '', reason: '' }) // keep what was typed if it failed
  }

  return (
    <li className="card approval">
      <div className="approval-head">
        <strong>{member.displayName || '—'}</strong>
        <span className={`status status-${member.active ? 'approved' : 'declined'}`}>
          {member.active ? T.active : T.inactive}
        </span>
      </div>

      <div className="approval-actions">
        <label className="field">
          <span>{T.name}</span>
          <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{T.order}</span>
          <input type="number" min="0" max="99" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </label>
        <label className="tap-target">
          <input
            type="checkbox"
            checked={member.active}
            disabled={busy}
            onChange={(e) => attempt('profile', () => onSave({ active: e.target.checked }))}
          />{' '}
          {T.active}
        </label>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={saveProfile}>
          {T.save}
        </button>
      </div>
      <SectionError message={errors.profile} />

      <h3>{T.hours}</h3>
      {hours.length === 0 ? (
        <p className="muted">{T.noHours}</p>
      ) : (
        <dl className="approval-meta">
          {[0, 1, 2, 3, 4, 5, 6].filter((d) => byDay.has(d)).map((d) => (
            <div key={d}>
              <dt>{T.weekdays[d]}</dt>
              <dd>
                {byDay.get(d).map((h) => (
                  <span key={h.id}>
                    {h.start}–{h.end}{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      disabled={busy}
                      aria-label={`${T.remove} ${T.weekdays[d]} ${h.start}`}
                      onClick={() => attempt('hours', () => onRemoveHours(h.id))}
                    >
                      ×
                    </button>{' '}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="approval-actions">
        <select value={range.weekday} onChange={(e) => setRange({ ...range, weekday: Number(e.target.value) })} aria-label={T.addHours}>
          {T.weekdays.map((label, d) => (
            <option key={d} value={d}>{label}</option>
          ))}
        </select>
        <input type="time" step="300" value={range.start} aria-label={T.from} onChange={(e) => setRange({ ...range, start: e.target.value })} />
        <input type="time" step="300" value={range.end} aria-label={T.to} onChange={(e) => setRange({ ...range, end: e.target.value })} />
        <div className="approval-buttons">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => addRange([range.weekday])}>{T.addHours}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => addRange(WORK_DAYS)}>{T.copyAll}</button>
        </div>
      </div>
      <SectionError message={errors.hours} />

      <h3>{T.timeOff}</h3>
      {timeOff.length === 0 ? (
        <p className="muted">{T.noTimeOff}</p>
      ) : (
        <ul>
          {timeOff.map((o) => (
            <li key={o.id}>
              {formatDate(o.startDate)} – {formatDate(o.endDate)}
              {o.reason && <span className="muted"> · {o.reason}</span>}{' '}
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => attempt('timeOff', () => onRemoveTimeOff(o.id))}>{T.remove}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="approval-actions" onSubmit={addOff}>
        <label className="field"><span>{T.startDate}</span><input type="date" value={off.startDate} onChange={(e) => setOff({ ...off, startDate: e.target.value })} /></label>
        <label className="field"><span>{T.endDate}</span><input type="date" min={off.startDate || clinicToday || undefined} value={off.endDate} onChange={(e) => setOff({ ...off, endDate: e.target.value })} /></label>
        <label className="field"><span>{T.reason}</span><input value={off.reason} maxLength={200} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></label>
        <button type="submit" className="btn btn-primary" disabled={busy}>{T.addTimeOff}</button>
      </form>
      <SectionError message={errors.timeOff} />
    </li>
  )
}
