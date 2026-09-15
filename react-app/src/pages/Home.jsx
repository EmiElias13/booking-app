import { useMemo, useState } from 'react'
import { SERVICES, TIME_SLOTS, formatDate, serviceLabel, todayISO } from '../data/clinic.js'
import { useAppointments } from '../store/appointments.jsx'

const emptyForm = {
  clientName: '',
  email: '',
  phone: '',
  service: SERVICES[0].id,
  notes: '',
}

export default function Home() {
  const { appointments, apiError, requestSlot } = useAppointments()
  const [form, setForm] = useState(emptyForm)
  const [date, setDate] = useState(todayISO())
  const [time, setTime] = useState('')
  const [errors, setErrors] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const takenSlots = useMemo(() => {
    return new Set(
      appointments
        .filter((appointment) => appointment.date === date && appointment.status !== 'declined')
        .map((appointment) => appointment.time),
    )
  }, [appointments, date])

  const myRequests = useMemo(() => {
    const email = form.email.trim().toLowerCase()
    if (!email) return []
    return appointments
      .filter((appointment) => appointment.email.toLowerCase() === email)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [appointments, form.email])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function validate() {
    const nextErrors = {}
    if (!form.clientName.trim()) nextErrors.clientName = 'Tell us your name'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email'
    if (!date) nextErrors.date = 'Pick a date'
    if (!time) nextErrors.time = 'Pick a time slot'
    return nextErrors
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const appointment = await requestSlot({
        clientName: form.clientName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        service: form.service,
        notes: form.notes.trim(),
        date,
        time,
      })

      setConfirmation(appointment)
      setForm((current) => ({ ...emptyForm, email: current.email }))
      setTime('')
    } catch (error) {
      setConfirmation(null)
      setErrors(
        Object.keys(error.fieldErrors ?? {}).length > 0
          ? error.fieldErrors
          : { form: 'Could not send your request. Please try again.' },
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <h1>Request a physio slot</h1>
        <p>
          Choose a time that suits you. Your physio reviews every request and confirms it, usually
          within a few hours.
        </p>
      </section>

      {apiError && (
        <div className="banner banner-error" role="alert">
          {apiError}
        </div>
      )}

      {confirmation && (
        <div className="banner banner-success" role="status">
          <strong>Request sent.</strong> {formatDate(confirmation.date)} at {confirmation.time} for{' '}
          {serviceLabel(confirmation.service)}. We&apos;ll email {confirmation.email} once the
          physio approves it.
        </div>
      )}

      <form className="card booking-form" onSubmit={handleSubmit} noValidate>
        <div className="field-grid">
          <label className="field">
            <span>Full name</span>
            <input
              value={form.clientName}
              onChange={(event) => updateField('clientName', event.target.value)}
              placeholder="Alex Moreno"
              aria-invalid={Boolean(errors.clientName)}
            />
            {errors.clientName && <small className="error">{errors.clientName}</small>}
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder="alex@example.com"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <small className="error">{errors.email}</small>}
          </label>

          <label className="field">
            <span>
              Phone <em>(optional)</em>
            </span>
            <input
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder="+34 600 000 000"
            />
          </label>

          <label className="field">
            <span>Treatment</span>
            <select
              value={form.service}
              onChange={(event) => updateField('service', event.target.value)}
            >
              {SERVICES.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Preferred date</span>
            <input
              type="date"
              min={todayISO()}
              value={date}
              onChange={(event) => {
                setDate(event.target.value)
                setTime('')
              }}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date && <small className="error">{errors.date}</small>}
          </label>
        </div>

        <fieldset className="field slots">
          <legend>Available times {date && <em>· {formatDate(date)}</em>}</legend>
          <div className="slot-grid">
            {TIME_SLOTS.map((slot) => {
              const taken = takenSlots.has(slot)
              return (
                <button
                  key={slot}
                  type="button"
                  className={`slot${time === slot ? ' slot-selected' : ''}`}
                  disabled={taken}
                  onClick={() => {
                    setTime(slot)
                    setErrors((current) => ({ ...current, time: undefined }))
                  }}
                >
                  {slot}
                  {taken && <small>booked</small>}
                </button>
              )
            })}
          </div>
          {errors.time && <small className="error">{errors.time}</small>}
        </fieldset>

        <label className="field">
          <span>
            What should the physio know? <em>(optional)</em>
          </span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="Lower back pain after running, worse in the mornings."
          />
        </label>

        {errors.form && <small className="error">{errors.form}</small>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Request appointment'}
        </button>
      </form>

      {myRequests.length > 0 && (
        <section className="card">
          <h2>Your requests</h2>
          <ul className="request-list">
            {myRequests.map((appointment) => (
              <li key={appointment.id}>
                <div>
                  <strong>
                    {formatDate(appointment.date)} · {appointment.time}
                  </strong>
                  <span className="muted">{serviceLabel(appointment.service)}</span>
                  {appointment.physioNote && (
                    <span className="muted">Physio: {appointment.physioNote}</span>
                  )}
                </div>
                <span className={`status status-${appointment.status}`}>{appointment.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
