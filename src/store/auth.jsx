import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getSession,
  getStaffMembership,
  setSession,
  signIn as signInRequest,
  signOut as signOutRequest,
} from '../lib/api.js'
import { strings } from '../i18n/strings.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getSession())

  const signIn = useCallback(async (email, password) => {
    const signedIn = await signInRequest(email, password)
    let staffRole = null
    try {
      staffRole = await getStaffMembership(signedIn.user?.id)
    } finally {
      if (!staffRole) await signOutRequest().catch(() => {})
    }
    if (!staffRole) {
      setSessionState(null)
      const error = new Error(strings.errors.noClinicAccess)
      error.status = 403
      error.fieldErrors = { form: strings.errors.noClinicAccess }
      throw error
    }
    // The flag only drives routing; RLS is the real gate.
    const next = { ...signedIn, staffRole }
    setSession(next)
    setSessionState(next)
    return next
  }, [])

  const signOut = useCallback(async () => {
    await signOutRequest()
    setSessionState(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      isStaff: Boolean(session?.access_token && session?.staffRole),
      staffRole: session?.staffRole ?? null,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return context
}
