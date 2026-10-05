import { useNavigate } from 'react-router-dom'
import { Phone, LogOut, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { DEMO } from '../lib/demo'

export default function Account() {
  const { profile, signOut } = useAuth()
  const nav = useNavigate()

  const initials = (profile?.full_name ?? 'User')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="narrow" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.25rem' }}>My Account</h1>

      {/* User Profile Card */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.5rem 1.25rem' }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--brand-gradient)',
          color: '#fff',
          fontWeight: 800,
          fontSize: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(37, 99, 235, 0.25)',
          flexShrink: 0
        }}>
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{profile?.full_name ?? 'Poshak User'}</h3>
            <span className="badge badge-placed" style={{ textTransform: 'capitalize' }}>
              {profile?.role}
            </span>
          </div>
          <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', fontSize: '0.88rem' }}>
            <Phone size={13} />
            <span>{profile?.phone ?? 'No phone linked'}</span>
          </div>
        </div>
      </div>

      {DEMO && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-lg)', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--brand-700)', fontWeight: 700, fontSize: '0.85rem' }}>
            <Sparkles size={15} />
            <span>Demo Mode Active</span>
          </div>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0', color: 'var(--text-secondary)' }}>
            All changes and test orders are persisted locally in your browser's localStorage.
          </p>
        </div>
      )}

      {/* Sign Out Button */}
      <button
        type="button"
        className="danger wide"
        onClick={() => {
          signOut()
          nav('/', { replace: true })
        }}
        style={{ marginTop: '0.5rem' }}
      >
        <LogOut size={16} />
        <span>Sign Out</span>
      </button>
    </div>
  )
}
