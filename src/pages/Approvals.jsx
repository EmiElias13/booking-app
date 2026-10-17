import { useEffect, useMemo, useRef, useState } from 'react'
import { clinicTimeHHMM, formatDate, serviceLabel } from '../data/clinic.js'
import { useCountUp } from '../hooks/useCountUp.js'
import { strings } from '../i18n/strings.js'
import { useAppointments } from '../store/appointments.jsx'
import { useAuth } from '../store/auth.jsx'
import { UNASSIGNED, matchesTherapist, missingTherapistIds, reviewReasons, therapistLabel, therapistOptions } from '../store/approvalsLogic.js'

const FILTERS = [
  { id: 'pending', label: strings.approvals.filters.pending },
  { id: 'approved', label: strings.approvals.filters.approved },
  { id: 'declined', label: strings.approvals.filters.declined },
  { id: 'all', label: strings.approvals.filters.all },
]

const EXIT_MS = 240

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function Approvals() {
  const { appointments: allAppointments, team, clinicToday, loading, apiError, decide } = useAppointments()
  const { staffRole } = useAuth()
  const [filter, setFilter] = useState('pending')
  const [therapistFilter, setTherapistFilter] = useState('')
  const [notes, setNotes] = useState({})
  const [busyIds, setBusyIds] = useState({})
  const [leaving, setLeaving] = useState({})
  const [decisionError, setDecisionError] = useState(null)
  const filterRowRef = useRef(null)
  const chipRefs = useRef({})
  const [indicator, setIndicator] = useState({ x: 0, y: 0, width: 0, height: 0 })

  // Admin/front desk pick a therapist; therapists only get their own bookings (RLS), so no filter for them.
  const canFilterTherapist = staffRole === 'admin' || staffRole === 'front_desk'
  const therapists = useMemo(() => therapistOptions(team.staff), [team.staff])
  const hasUnassigned = allAppointments.some((appointment) => !appointment.staffId)
  const activeTherapistFilter = canFilterTherapist ? therapistFilter : ''

  const appointments = useMemo(
    () => allAppointments.filter((appointment) => matchesTherapist(appointment, activeTherapistFilter)),
    [allAppointments, activeTherapistFilter],
  )

  const missingTherapists = useMemo(() => missingTherapistIds(allAppointments, team.staff), [allAppointments, team.staff])
  const staffName = (staffId) =>
    therapistLabel(staffId, team.staff, { unassigned: strings.approvals.unassigned, missing: strings.approvals.missingTherapist })

  const nowHHMM = clinicTimeHHMM()
  const reviewFor = (appointment) => reviewReasons(appointment, { ...team, today: clinicToday, nowHHMM })

  const counts = useMemo(
    () => ({
      pending: appointments.filter((appointment) => appointment.status === 'pending').length,
      approved: appointments.filter((appointment) => appointment.status === 'approved').length,
      declined: appointments.filter((appointment) => appointment.status === 'declined').length,
      all: appointments.length,
    }),
    [appointments],
  )

  const pendingCount = useCountUp(counts.pending)
  const approvedCount = useCountUp(counts.approved)
  const declinedCount = useCountUp(counts.declined)

  const visible = useMemo(() => {
    const matched = appointments.filter((appointment) => filter === 'all' || appointment.status === filter)
    const extras = Object.values(leaving).filter((snapshot) => !matched.some((item) => item.id === snapshot.id))
    return [...matched, ...extras].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [appointments, filter, leaving])

  useEffect(() => {
    const row = filterRowRef.current

    function measure() {
      const chip = chipRefs.current[filter]
      if (!chip) return
      setIndicator({
        x: chip.offsetLeft,
        y: chip.offsetTop,
        width: chip.offsetWidth,
        height: chip.offsetHeight,
      })
    }

    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (row && observer) observer.observe(row)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [filter, counts])

  async function handleDecision(appointment, status, note = notes[appointment.id] ?? '') {
    const nextNote = note.trim()
    setBusyIds((current) => ({ ...current, [appointment.id]: true }))
    setDecisionError(null)

    const willExit =
      (status === 'approved' || status === 'declined') &&
      filter !== 'all' &&
      filter !== status &&
      !prefersReducedMotion()

    if (!willExit) {
      try {
        await decide(appointment.id, status, nextNote)
        setNotes((current) => ({ ...current, [appointment.id]: '' }))
      } catch (error) {
        setDecisionError(error.message || strings.errors.update)
      } finally {
        setBusyIds((current) => {
          const next = { ...current }
          delete next[appointment.id]
          return next
        })
      }
      return
    }

    setLeaving((current) => ({ ...current, [appointment.id]: appointment }))

    const request = decide(appointment.id, status, nextNote).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, error }),
    )
    const animation = new Promise((resolve) => {
      window.setTimeout(resolve, EXIT_MS)
    })
    const [result] = await Promise.all([request, animation])

    setLeaving((current) => {
      const next = { ...current }
      delete next[appointment.id]
      return next
    })

    if (result.ok) {
      setNotes((current) => ({ ...current, [appointment.id]: '' }))
    } else {
      setDecisionError(result.error?.message || strings.errors.update)
    }
    setBusyIds((current) => {
      const next = { ...current }
      delete next[appointment.id]
      return next
    })
  }

  const bannerError = apiError || decisionError

  return (
    <div className="page">
      <section className="hero enter">
        <h1>{strings.approvals.title}</h1>
        <p>{strings.approvals.intro}</p>
      </section>

      {team.loadError && (
        <div className="banner banner-error" role="alert">
          {strings.approvals.teamLoadError}
        </div>
      )}

      {bannerError && (
        <div className="banner banner-error" role="alert">
          {bannerError}
        </div>
      )}

      <div className="stat-row enter enter-delay-1">
        <div className="stat">
          <span>{pendingCount}</span>
          <small>{strings.approvals.filters.pending}</small>
        </div>
        <div className="stat">
          <span>{approvedCount}</span>
          <small>{strings.approvals.filters.approved}</small>
        </div>
        <div className="stat">
          <span>{declinedCount}</span>
          <small>{strings.approvals.filters.declined}</small>
        </div>
      </div>

      <div className="filter-row enter enter-delay-2" ref={filterRowRef}>
        <span
          className="chip-indicator"
          aria-hidden="true"
          style={{
            width: indicator.width || undefined,
            height: indicator.height || undefined,
            opacity: indicator.width ? 1 : 0,
            transform: `translate(${indicator.x}px, ${indicator.y}px)`,
          }}
        />
        {FILTERS.map((option) => (
          <button
            key={option.id}
            ref={(node) => {
              chipRefs.current[option.id] = node
            }}
            type="button"
            className={`chip${filter === option.id ? ' chip-active' : ''}`}
            aria-pressed={filter === option.id}
            onClick={() => setFilter(option.id)}
          >
            {option.label} ({counts[option.id]})
          </button>
        ))}
      </div>

      {canFilterTherapist && therapists.length > 0 && (
        <label className="field approval-therapist enter enter-delay-2">
          <span>{strings.approvals.therapist}</span>
          <select value={therapistFilter} onChange={(event) => setTherapistFilter(event.target.value)}>
            <option value="">{strings.approvals.allTherapists}</option>
            {therapists.map((member) => (
              <option key={member.id} value={member.id}>
                {member.active ? member.displayName : `${member.displayName} ${strings.approvals.inactiveSuffix}`}
              </option>
            ))}
            {missingTherapists.map((id) => (
              <option key={id} value={id}>
                {strings.approvals.missingTherapist}
              </option>
            ))}
            {hasUnassigned && <option value={UNASSIGNED}>{strings.approvals.unassigned}</option>}
          </select>
        </label>
      )}

      {loading ? (
        <p className="empty enter enter-delay-2">{strings.approvals.loading}</p>
      ) : visible.length === 0 ? (
        <p className="empty enter enter-delay-2">
          {activeTherapistFilter && allAppointments.length > 0 ? strings.approvals.emptyFiltered : strings.approvals.empty}
        </p>
      ) : (
        <ul className="approval-list enter enter-delay-2">
          {visible.map((appointment) => {
            const reasons = reviewFor(appointment)
            const therapistName = staffName(appointment.staffId)
            return (
              <li
                key={appointment.id}
                className={`card approval card-lift${leaving[appointment.id] ? ' approval-exit' : ''}`}
              >
                <div className="approval-head">
                  <div>
                    <strong>
                      {formatDate(appointment.date)} · {appointment.time}
                    </strong>
                    <span className="muted">{serviceLabel(appointment.service)}</span>
                  </div>
                  <div className="approval-badges">
                    {reasons.length > 0 && <span className="status status-review">{strings.approvals.review}</span>}
                    <span key={appointment.status} className={`status status-${appointment.status}`}>
                      {strings.status[appointment.status] ?? appointment.status}
                    </span>
                  </div>
                </div>

                {reasons.length > 0 && (
                  <ul className="approval-review" aria-label={strings.approvals.review}>
                    {reasons.map((reason) => (
                      <li key={reason}>{strings.approvals.reviewReasons[reason]}</li>
                    ))}
                  </ul>
                )}

                <dl className="approval-meta">
                  {therapistName && (
                    <div>
                      <dt>{strings.approvals.therapist}</dt>
                      <dd>{therapistName}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{strings.approvals.client}</dt>
                    <dd>{appointment.clientName}</dd>
                  </div>
                  <div>
                    <dt>{strings.approvals.email}</dt>
                    <dd>{appointment.email}</dd>
                  </div>
                  {appointment.phone && (
                    <div>
                      <dt>{strings.approvals.phone}</dt>
                      <dd>{appointment.phone}</dd>
                    </div>
                  )}
                </dl>

                {appointment.notes && <p className="approval-notes">“{appointment.notes}”</p>}

                {appointment.status === 'pending' ? (
                  <div className="approval-actions">
                    <input
                      value={notes[appointment.id] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [appointment.id]: event.target.value }))
                      }
                      placeholder={strings.approvals.notePh}
                    />
                    <div className="approval-buttons">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={Boolean(busyIds[appointment.id])}
                        onClick={() => handleDecision(appointment, 'approved')}
                      >
                        {strings.approvals.approve}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={Boolean(busyIds[appointment.id])}
                        onClick={() => handleDecision(appointment, 'declined')}
                      >
                        {strings.approvals.decline}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="approval-actions">
                    {appointment.staffNote && (
                      <p className="muted">
                        {strings.approvals.yourNote} {appointment.staffNote}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={Boolean(busyIds[appointment.id])}
                      onClick={() => handleDecision(appointment, 'pending', appointment.staffNote)}
                    >
                      {strings.approvals.backToPending}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
