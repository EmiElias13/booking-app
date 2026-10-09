import { useMemo, useState } from 'react'
import { SERVICES, TIME_SLOTS, formatDate, serviceLabel, todayISO } from '../data/clinic.js'
import { config } from '../config/clinic.config.js'
import { strings, t } from '../i18n/strings.js'
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
      .filter((appointment) => appointment.email?.toLowerCase() === email)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [appointments, form.email])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function validate() {
    const nextErrors = {}
    if (!form.clientName.trim()) nextErrors.clientName = strings.errors.name
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = strings.errors.email
    if (!date) nextErrors.date = strings.errors.date
    if (!time) nextErrors.time = strings.errors.time
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
          : { form: strings.errors.send },
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <section className="hero enter">
        <h1>{strings.home.title}</h1>
        <p>{strings.home.intro}</p>
      </section>

      {apiError && (
        <div className="banner banner-error" role="alert">
          {apiError}
        </div>
      )}

      {confirmation && (
        <div className="banner banner-success" role="status" key={confirmation.id}>
          <strong>{strings.home.successTitle}</strong>{' '}
          {t(strings.home.success, {
            date: formatDate(confirmation.date),
            time: confirmation.time,
            service: serviceLabel(confirmation.service),
            email: confirmation.email,
          })}
        </div>
      )}

      <form className="card booking-form enter enter-delay-1" onSubmit={handleSubmit} noValidate>
        <div className="field-grid">
          <label className={`field${errors.clientName ? ' error-shake' : ''}`}>
            <span>{strings.home.name}</span>
            <input
              value={form.clientName}
              onChange={(event) => updateField('clientName', event.target.value)}
              placeholder={strings.home.namePh}
              autoComplete="name"
              aria-invalid={Boolean(errors.clientName)}
            />
            {errors.clientName && <small className="error">{errors.clientName}</small>}
          </label>

          <label className={`field${errors.email ? ' error-shake' : ''}`}>
            <span>{strings.home.email}</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              placeholder={strings.home.emailPh}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email && <small className="error">{errors.email}</small>}
          </label>

          <label className="field">
            <span>
              {strings.home.phone} <em>{strings.home.optional}</em>
            </span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder={config.phonePlaceholder}
              autoComplete="tel"
            />
          </label>

          <label className="field">
            <span>{strings.home.service}</span>
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

          <label className={`field${errors.date ? ' error-shake' : ''}`}>
            <span>{strings.home.date}</span>
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

        <fieldset className={`field slots${errors.time ? ' error-shake' : ''}`}>
          <legend>
            {strings.home.slots} {date && <em>· {formatDate(date)}</em>}
          </legend>
          <div className="slot-grid" key={date}>
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
                  <span className="slot-label">{slot}</span>
                  {taken && <small>{strings.home.slotTaken}</small>}
                </button>
              )
            })}
          </div>
          {errors.time && <small className="error">{errors.time}</small>}
        </fieldset>

        <label className="field">
          <span>
            {strings.home.notes} <em>{strings.home.optional}</em>
          </span>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder={strings.home.notesPh}
          />
        </label>

        {errors.form && <small className="error error-shake">{errors.form}</small>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          aria-busy={submitting ? true : undefined}
        >
          {submitting && <span className="btn-spinner" aria-hidden="true" />}
          {submitting ? strings.home.submitting : strings.home.submit}
        </button>
      </form>

      {myRequests.length > 0 && (
        <section className="card enter enter-delay-2">
          <h2>{strings.home.myRequests}</h2>
          <ul className="request-list">
            {myRequests.map((appointment) => (
              <li key={appointment.id} className="card-lift">
                <div>
                  <strong>
                    {formatDate(appointment.date)} · {appointment.time}
                  </strong>
                  <span className="muted">{serviceLabel(appointment.service)}</span>
                  {appointment.physioNote && (
                    <span className="muted">
                      {strings.home.clinicNote} {appointment.physioNote}
                    </span>
                  )}
                </div>
                <span key={appointment.status} className={`status status-${appointment.status}`}>
                  {strings.status[appointment.status] ?? appointment.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
