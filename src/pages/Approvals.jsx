import { useMemo, useState } from 'react'
import { formatDate, serviceLabel } from '../data/clinic.js'
import { useAppointments } from '../store/appointments.jsx'

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
  { id: 'all', label: 'All' },
]

export default function Approvals() {
  const { appointments, loading, apiError, decide } = useAppointments()
  const [filter, setFilter] = useState('pending')
  const [notes, setNotes] = useState({})
  const [busyId, setBusyId] = useState(null)

  const counts = useMemo(
    () => ({
      pending: appointments.filter((appointment) => appointment.status === 'pending').length,
      approved: appointments.filter((appointment) => appointment.status === 'approved').length,
      declined: appointments.filter((appointment) => appointment.status === 'declined').length,
      all: appointments.length,
    }),
    [appointments],
  )

  const visible = useMemo(() => {
    return appointments
      .filter((appointment) => filter === 'all' || appointment.status === filter)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [appointments, filter])

  async function handleDecision(appointment, status, note = notes[appointment.id] ?? '') {
    setBusyId(appointment.id)
    try {
      await decide(appointment.id, status, note.trim())
      setNotes((current) => ({ ...current, [appointment.id]: '' }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <h1>Appointment approvals</h1>
        <p>Review incoming requests, confirm the ones that fit your schedule, and decline the rest.</p>
      </section>

      {apiError && (
        <div className="banner banner-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <span>{counts.pending}</span>
          <small>Pending</small>
        </div>
        <div className="stat">
          <span>{counts.approved}</span>
          <small>Approved</small>
        </div>
        <div className="stat">
          <span>{counts.declined}</span>
          <small>Declined</small>
        </div>
      </div>

      <div className="filter-row">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`chip${filter === option.id ? ' chip-active' : ''}`}
            onClick={() => setFilter(option.id)}
          >
            {option.label} ({counts[option.id]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="empty">Loading requests…</p>
      ) : visible.length === 0 ? (
        <p className="empty">Nothing here yet. Requests from the booking page show up in this list.</p>
      ) : (
        <ul className="approval-list">
          {visible.map((appointment) => (
            <li key={appointment.id} className="card approval">
              <div className="approval-head">
                <div>
                  <strong>
                    {formatDate(appointment.date)} · {appointment.time}
                  </strong>
                  <span className="muted">{serviceLabel(appointment.service)}</span>
                </div>
                <span className={`status status-${appointment.status}`}>{appointment.status}</span>
              </div>

              <dl className="approval-meta">
                <div>
                  <dt>Client</dt>
                  <dd>{appointment.clientName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{appointment.email}</dd>
                </div>
                {appointment.phone && (
                  <div>
                    <dt>Phone</dt>
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
                    placeholder="Message for the client (optional)"
                  />
                  <div className="approval-buttons">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busyId === appointment.id}
                      onClick={() => handleDecision(appointment, 'approved')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busyId === appointment.id}
                      onClick={() => handleDecision(appointment, 'declined')}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ) : (
                <div className="approval-actions">
                  {appointment.physioNote && (
                    <p className="muted">Your note: {appointment.physioNote}</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === appointment.id}
                    onClick={() => handleDecision(appointment, 'pending', appointment.physioNote)}
                  >
                    Move back to pending
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
