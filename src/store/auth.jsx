import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getSession, signIn as signInRequest, signOut as signOutRequest } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(() => getSession())

  const signIn = useCallback(async (email, password) => {
    const next = await signInRequest(email, password)
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
      isPhysio: Boolean(session?.access_token),
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
