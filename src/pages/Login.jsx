import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isAppConfigured } from '../lib/supabase.js'
import { strings } from '../i18n/strings.js'
import { useAuth } from '../store/auth.jsx'

export default function Login() {
  const { isPhysio, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = location.state?.from || '/approvals'

  if (isPhysio) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email.trim(), password)
    } catch (next) {
      setError(next.message || strings.errors.signIn)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <section className="hero enter">
        <h1>{strings.login.title}</h1>
        <p>{strings.login.intro}</p>
      </section>

      {!isAppConfigured && (
        <div className="banner banner-error" role="alert">
          {strings.errors.config}
        </div>
      )}

      <form className="card booking-form enter enter-delay-1" onSubmit={handleSubmit}>
        <label className={`field${error ? ' error-shake' : ''}`}>
          <span>{strings.login.email}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={strings.login.emailPh}
            autoComplete="username"
            required
          />
        </label>

        <label className={`field${error ? ' error-shake' : ''}`}>
          <span>{strings.login.password}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <small className="error error-shake">{error}</small>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting || !isAppConfigured}
          aria-busy={submitting ? true : undefined}
        >
          {submitting && <span className="btn-spinner" aria-hidden="true" />}
          {submitting ? strings.login.submitting : strings.login.submit}
        </button>
      </form>
    </div>
  )
}
