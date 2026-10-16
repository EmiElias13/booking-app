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
    } catch {
      setError(strings.errors.reach)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const therapists = useMemo(() => staff.filter((s) => s.role === 'therapist'), [staff])

  async function run(action) {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e?.message || T.errors.save)
    }
  }

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
              hours={hours.filter((h) => h.staffId === member.id)}
              timeOff={timeOff.filter((o) => o.staffId === member.id && o.endDate >= clinicToday)}
              onSave={(patch) =>
                run(async () => {
                  const updated = await updateStaff(member.id, patch)
                  setStaff((cur) => cur.map((s) => (s.id === member.id ? { ...s, ...updated } : s)))
                })
              }
              onAddHours={(rows) =>
                run(async () => {
                  const added = []
                  for (const row of rows) added.push(await addStaffHours({ staffId: member.id, ...row }))
                  setHours((cur) => [...cur, ...added])
                })
              }
              onRemoveHours={(id) =>
                run(async () => {
                  await deleteStaffHours(id)
                  setHours((cur) => cur.filter((h) => h.id !== id))
                })
              }
              onAddTimeOff={(row) =>
                run(async () => {
                  const added = await addTimeOff({ staffId: member.id, ...row })
                  setTimeOff((cur) => [...cur, added])
                })
              }
              onRemoveTimeOff={(id) =>
                run(async () => {
                  await deleteTimeOff(id)
                  setTimeOff((cur) => cur.filter((o) => o.id !== id))
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TherapistCard({ member, hours, timeOff, onSave, onAddHours, onRemoveHours, onAddTimeOff, onRemoveTimeOff }) {
  const [name, setName] = useState(member.displayName)
  const [order, setOrder] = useState(member.sortOrder)
  const [range, setRange] = useState({ weekday: 1, start: '08:00', end: '20:00' })
  const [off, setOff] = useState({ startDate: '', endDate: '', reason: '' })
  const [localError, setLocalError] = useState(null)

  const byDay = useMemo(() => {
    const map = new Map()
    for (const h of [...hours].sort((a, b) => a.start.localeCompare(b.start))) {
      if (!map.has(h.weekday)) map.set(h.weekday, [])
      map.get(h.weekday).push(h)
    }
    return map
  }, [hours])

  function addRange(days) {
    if (range.end <= range.start) return setLocalError(T.errors.range)
    setLocalError(null)
    onAddHours(days.map((weekday) => ({ weekday, start: range.start, end: range.end })))
  }

  function addOff(event) {
    event.preventDefault()
    if (!off.startDate || !off.endDate || off.endDate < off.startDate) return setLocalError(T.errors.dates)
    setLocalError(null)
    onAddTimeOff({ ...off, reason: off.reason.trim() })
    setOff({ startDate: '', endDate: '', reason: '' })
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
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>{T.order}</span>
          <input type="number" min="0" max="99" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
        </label>
        <label>
          <input type="checkbox" checked={member.active} onChange={(e) => onSave({ active: e.target.checked })} /> {T.active}
        </label>
        <button type="button" className="btn btn-primary" onClick={() => onSave({ displayName: name.trim(), sortOrder: order })}>
          {T.save}
        </button>
      </div>

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
                    <button type="button" className="btn btn-ghost" aria-label={`${T.remove} ${T.weekdays[d]} ${h.start}`} onClick={() => onRemoveHours(h.id)}>
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
          <button type="button" className="btn btn-primary" onClick={() => addRange([range.weekday])}>{T.addHours}</button>
          <button type="button" className="btn btn-ghost" onClick={() => addRange(WORK_DAYS)}>{T.copyAll}</button>
        </div>
      </div>

      <h3>{T.timeOff}</h3>
      {timeOff.length === 0 ? (
        <p className="muted">{T.noTimeOff}</p>
      ) : (
        <ul>
          {timeOff.map((o) => (
            <li key={o.id}>
              {formatDate(o.startDate)} – {formatDate(o.endDate)}
              {o.reason && <span className="muted"> · {o.reason}</span>}{' '}
              <button type="button" className="btn btn-ghost" onClick={() => onRemoveTimeOff(o.id)}>{T.remove}</button>
            </li>
          ))}
        </ul>
      )}
      <form className="approval-actions" onSubmit={addOff}>
        <label className="field"><span>{T.startDate}</span><input type="date" value={off.startDate} onChange={(e) => setOff({ ...off, startDate: e.target.value })} /></label>
        <label className="field"><span>{T.endDate}</span><input type="date" value={off.endDate} onChange={(e) => setOff({ ...off, endDate: e.target.value })} /></label>
        <label className="field"><span>{T.reason}</span><input value={off.reason} maxLength={200} onChange={(e) => setOff({ ...off, reason: e.target.value })} /></label>
        <button type="submit" className="btn btn-primary">{T.addTimeOff}</button>
      </form>
      {localError && <p className="banner banner-error" role="alert">{localError}</p>}
    </li>
  )
}
