import { useEffect, useMemo, useRef, useState } from 'react'
import { SERVICES, clinicTimeHHMM, formatDate, serviceLabel } from '../data/clinic.js'
import { config } from '../config/clinic.config.js'
import { strings, t } from '../i18n/strings.js'
import { useAppointments } from '../store/appointments.jsx'
import { isSlotRejected } from '../store/bookingLogic.js'

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const contactValues = Object.values(config.contact ?? {}).filter(Boolean).map(String)

const emptyForm = {
  clientName: '',
  email: '',
  phone: '',
  service: SERVICES[0].id,
  notes: '',
}

export default function Home() {
  const {
    myRequests: sessionRequests, apiError, requestSlot, clinicToday, loading,
    therapists, therapistId, selectTherapist, availableSlots, slotsLoading,
    therapistsError, slotsError, retrySlots, refresh,
  } = useAppointments()
  const [form, setForm] = useState(emptyForm)
  const [date, setDate] = useState(clinicToday)
  const [time, setTime] = useState('')
  const [errors, setErrors] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const pickedByHand = useRef(false)

  // The server already drops started slots; this keeps an open tab from offering them later in the day.
  const [nowHHMM, setNowHHMM] = useState(clinicTimeHHMM)
  useEffect(() => {
    const id = setInterval(() => setNowHHMM(clinicTimeHHMM()), 60_000)
    return () => clearInterval(id)
  }, [])

  const freeOn = (day) =>
    (availableSlots.get(day) ?? []).filter((slot) => !(day === clinicToday && slot <= nowHHMM))

  // First day within 14 days (from the clinic's today) with a free slot for this therapist, or null.
  const firstOpenDay = useMemo(() => {
    for (let i = 0; i < 14; i++) {
      const day = addDaysISO(clinicToday, i)
      if ((availableSlots.get(day) ?? []).some((slot) => !(i === 0 && slot <= nowHHMM))) return day
    }
    return null
  }, [clinicToday, availableSlots, nowHHMM])

  // Auto-pick on load and when today runs out; never override a hand-picked date.
  useEffect(() => {
    if (pickedByHand.current) {
      if (date < clinicToday) setDate(clinicToday)
    } else {
      setDate(firstOpenDay ?? clinicToday)
    }
  }, [firstOpenDay, clinicToday, date])
  const jumpedPastToday = !pickedByHand.current && firstOpenDay && firstOpenDay !== clinicToday && date === firstOpenDay

  // Therapist dropped by the store (deactivated): clear the time and let the date auto-pick again.
  useEffect(() => {
    if (!therapistId) {
      pickedByHand.current = false
      setTime('')
    }
  }, [therapistId])

  const daySlots = freeOn(date)
  const therapist = therapists.find((x) => x.id === therapistId) ?? null
  useEffect(() => {
    if (time && date === clinicToday && time <= nowHHMM) setTime('')
  }, [time, date, clinicToday, nowHHMM])

  const myRequests = useMemo(() => {
    const email = form.email.trim().toLowerCase()
    if (!email) return []
    return sessionRequests
      .filter((appointment) => appointment.email?.toLowerCase() === email)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
  }, [sessionRequests, form.email])

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function validate() {
    const nextErrors = {}
    if (!form.clientName.trim()) nextErrors.clientName = strings.errors.name
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = strings.errors.email
    if (!therapistId) nextErrors.therapist = strings.errors.therapist
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
        staffId: therapistId,
        date,
        time,
      })

      setConfirmation({ ...appointment, therapistName: therapist?.displayName ?? '' })
      setForm((current) => ({ ...emptyForm, email: current.email }))
      setTime('')
    } catch (error) {
      setConfirmation(null)
      // The store refetches slots; drop the rejected time so it can't be resubmitted.
      if (isSlotRejected(error)) setTime('')
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
            therapist: confirmation.therapistName,
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

          <label className={`field${errors.therapist ? ' error-shake' : ''}`}>
            <span>{strings.home.therapist}</span>
            <select
              value={therapistId}
              onChange={(event) => {
                pickedByHand.current = false
                selectTherapist(event.target.value)
                setTime('')
                setErrors((current) => ({ ...current, therapist: undefined, time: undefined }))
              }}
              disabled={therapists.length === 0}
              aria-invalid={Boolean(errors.therapist)}
              required
            >
              <option value="" disabled>
                {strings.home.therapistPh}
              </option>
              {therapists.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.displayName}
                </option>
              ))}
            </select>
            {errors.therapist && <small className="error">{errors.therapist}</small>}
          </label>

          <label className={`field${errors.date ? ' error-shake' : ''}`}>
            <span>{strings.home.date}</span>
            <input
              type="date"
              min={clinicToday}
              value={date}
              onChange={(event) => {
                pickedByHand.current = true
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
          {therapistsError && therapists.length === 0 && (
            <div className="muted" role="alert">
              <p>{strings.home.loadError}</p>
              <button type="button" className="btn btn-ghost" onClick={refresh}>
                {strings.home.retry}
              </button>
            </div>
          )}
          {therapistId && slotsError && (
            <div className="muted" role="alert">
              <p>{strings.home.loadError}</p>
              <button type="button" className="btn btn-ghost" onClick={retrySlots}>
                {strings.home.retry}
              </button>
            </div>
          )}
          {!loading && !therapistsError && therapists.length === 0 && (
            <div className="muted">
              <p>{strings.home.noTherapists}</p>
              {contactValues.map((value) => (
                <p key={value}>{value}</p>
              ))}
            </div>
          )}
          {therapists.length > 0 && !therapistId && <p className="muted">{strings.home.pickTherapistFirst}</p>}
          {therapistId && jumpedPastToday && <p className="muted">{strings.home.todayFull}</p>}
          {therapistId && !slotsLoading && !slotsError && !firstOpenDay && (
            <div className="muted">
              {contactValues.length ? (
                <>
                  <p>{strings.home.noSlots}</p>
                  {contactValues.map((value) => (
                    <p key={value}>{value}</p>
                  ))}
                </>
              ) : (
                <p>{strings.home.noSlotsNoContact}</p>
              )}
            </div>
          )}
          <div className="slot-grid" key={date}>
            {daySlots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`slot${time === slot ? ' slot-selected' : ''}`}
                onClick={() => {
                  setTime(slot)
                  setErrors((current) => ({ ...current, time: undefined }))
                }}
              >
                <span className="slot-label">{slot}</span>
              </button>
            ))}
          </div>
          {therapistId && !slotsLoading && !slotsError && firstOpenDay && daySlots.length === 0 && (
            <p className="muted">{strings.home.dayClosed}</p>
          )}
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
                  {appointment.staffNote && (
                    <span className="muted">
                      {strings.home.clinicNote} {appointment.staffNote}
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
