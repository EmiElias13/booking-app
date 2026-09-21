import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase.js'
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
      setError(next.message || 'Could not sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <h1>Physio sign in</h1>
        <p>Approvals are limited to the clinic physio. Guests can request a slot without an account.</p>
      </section>

      {!isSupabaseConfigured && (
        <div className="banner banner-error" role="alert">
          Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.
        </div>
      )}

      <form className="card booking-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="physio@movewell.clinic"
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <small className="error">{error}</small>}

        <button type="submit" className="btn btn-primary" disabled={submitting || !isSupabaseConfigured}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
