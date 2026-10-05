import { useState } from 'react'
import {
  Sparkles,
  User,
  Bike,
  Store,
  LayoutDashboard,
  ArrowRight
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DEMO } from '../lib/demo'
import type { Role } from '../lib/api'

const ROLES: { role: Role; icon: typeof User; title: string; sub: string }[] = [
  { role: 'customer', icon: User, title: 'Customer Experience', sub: 'Explore laundries, place orders & live track' },
  { role: 'partner', icon: Bike, title: 'Delivery Partner Portal', sub: 'Accept pickups, weigh clothes & complete drop-offs' },
  { role: 'shop', icon: Store, title: 'Laundry Shop Operations', sub: 'Manage washing pipeline, turnaround & prices' },
  { role: 'admin', icon: LayoutDashboard, title: 'Admin Platform Console', sub: 'Platform stats, orders dispatch & merchant governance' },
]

function Hero() {
  return (
    <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
      <div className="auth-logo-badge">
        <Sparkles size={30} />
      </div>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.35rem', letterSpacing: '-0.03em' }}>
        Poshak
      </h1>
      <p className="muted" style={{ fontSize: '0.98rem', maxWidth: 320, margin: '0 auto' }}>
        On-demand doorstep laundry &amp; dry cleaning in Bengaluru
      </p>
    </div>
  )
}

function DemoLogin() {
  const { demoSignIn } = useAuth()
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: 480 }}>
        <Hero />

        <div style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '0.85rem 1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--brand-700)', fontSize: '0.85rem' }}>
            <Sparkles size={15} />
            <span>Interactive Demo Environment</span>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
            Select any role below to test the complete live workflow with sample data.
          </p>
        </div>

        <div>
          {ROLES.map((r) => {
            const Icon = r.icon
            return (
              <button
                key={r.role}
                type="button"
                className="role-select-card"
                onClick={() => demoSignIn(r.role)}
              >
                <div className="role-icon-box">
                  <Icon size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                    {r.title}
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
                    {r.sub}
                  </div>
                </div>
                <ArrowRight size={16} color="var(--text-muted)" />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function OtpLogin() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const full = `+91${phone}`
  const run = async (fn: () => Promise<{ error: Error | null }>, after?: () => void) => {
    setBusy(true)
    setError('')
    const { error } = await fn()
    setBusy(false)
    if (error) setError(error.message)
    else after?.()
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <Hero />

        <h3 style={{ marginBottom: '0.25rem' }}>Welcome to Poshak</h3>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Enter your phone number to sign in or create an account
        </p>

        {!sent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(() => supabase.auth.signInWithOtp({ phone: full }), () => setSent(true))
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)', background: '#fff', overflow: 'hidden', marginBottom: '0.85rem' }}>
              <span style={{ padding: '0.75rem 0.85rem', background: 'var(--surface-subtle)', fontWeight: 700, color: 'var(--text-secondary)', borderRight: '1.5px solid var(--border)', fontSize: '0.92rem' }}>
                +91
              </span>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                style={{ border: 0, margin: 0, padding: '0.75rem 0.85rem' }}
              />
            </div>

            <button
              type="submit"
              className="primary wide"
              disabled={busy || phone.length !== 10}
            >
              {busy ? 'Sending OTP…' : 'Continue with OTP'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(() => supabase.auth.verifyOtp({ phone: full, token: otp, type: 'sms' }))
            }}
          >
            <p className="muted" style={{ fontSize: '0.88rem', marginBottom: '0.85rem' }}>
              6-digit verification code sent to <b>+91 {phone}</b>
            </p>
            <input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.25rem', fontWeight: 700 }}
            />
            <button
              type="submit"
              className="primary wide"
              disabled={busy || otp.length < 6}
            >
              {busy ? 'Verifying Code…' : 'Verify & Sign In'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setSent(false)
                setOtp('')
              }}
              style={{ marginTop: '0.5rem' }}
            >
              Edit phone number
            </button>
          </form>
        )}

        {error && <p className="error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</p>}
      </div>
    </div>
  )
}

export default function Login() {
  return DEMO ? <DemoLogin /> : <OtpLogin />
}
