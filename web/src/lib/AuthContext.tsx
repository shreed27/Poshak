import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { api, type Profile, type Role } from './api'
import { DEMO, getDemoRole, setDemoRole } from './demo'

interface Ctx {
  session: Session | { demo: true } | null
  profile: Profile | null
  ready: boolean
  error: string
  signOut: () => void
  demoSignIn: (role: Role) => void
}
const AuthCtx = createContext<Ctx>({ session: null, profile: null, ready: false, error: '', signOut: () => {}, demoSignIn: () => {} })
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Ctx['session']>(DEMO ? (getDemoRole() ? { demo: true } : null) : null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [demoRole, setRole] = useState<Role | null>(DEMO ? getDemoRole() : null)

  useEffect(() => {
    if (DEMO) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setProfile(null); setReady(true) } })
    return () => data.subscription.unsubscribe()
  }, [])

  const token = DEMO ? demoRole : (session && 'access_token' in session ? session.access_token : null)
  useEffect(() => {
    if (!token) { if (DEMO) { setProfile(null); setReady(true) } return }
    api.me().then((p) => { setProfile(p); setError('') }).catch((e) => setError(e.message)).finally(() => setReady(true))
  }, [token])

  const demoSignIn = (role: Role) => { setDemoRole(role); setProfile(null); setReady(false); setRole(role); setSession({ demo: true }) }
  const signOut = () => {
    if (DEMO) { setDemoRole(null); setRole(null); setSession(null); setProfile(null) } else supabase.auth.signOut()
  }

  return <AuthCtx.Provider value={{ session, profile, ready, error, signOut, demoSignIn }}>{children}</AuthCtx.Provider>
}
