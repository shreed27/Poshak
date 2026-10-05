import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  MapPin,
  ChevronDown,
  Bell,
  Home,
  Receipt,
  User,
  Bike,
  Store,
  LayoutDashboard,
  RotateCcw,
  PackageCheck
} from 'lucide-react'
import { api, type Notification, type Role } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { DEMO, resetDemo } from '../lib/demo'

const NAV: Record<Role, { to: string; label: string; icon: typeof Home }[]> = {
  customer: [
    { to: '/', label: 'Home', icon: Home },
    { to: '/orders', label: 'My Orders', icon: Receipt },
    { to: '/account', label: 'Account', icon: User }
  ],
  partner: [
    { to: '/partner', label: 'Deliveries', icon: Bike },
    { to: '/account', label: 'Account', icon: User }
  ],
  shop: [
    { to: '/shop', label: 'Shop Hub', icon: Store },
    { to: '/account', label: 'Account', icon: User }
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/', label: 'Customer View', icon: Home },
    { to: '/orders', label: 'All Orders', icon: Receipt },
    { to: '/account', label: 'Account', icon: User }
  ],
}

const ROLE_META: Record<Role, { label: string; icon: typeof User }> = {
  customer: { label: 'Customer', icon: User },
  partner: { label: 'Delivery Partner', icon: Bike },
  shop: { label: 'Laundry Shop', icon: Store },
  admin: { label: 'Admin', icon: LayoutDashboard }
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ unread: number; items: Notification[] }>({ unread: 0, items: [] })
  const nav = useNavigate()

  useEffect(() => {
    const load = () => api.notifications().then(setData).catch(() => {})
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && data.unread > 0) {
      api.readAllNotifications().then(() => setData((d) => ({ ...d, unread: 0 }))).catch(() => {})
    }
  }

  return (
    <div className="bell-container">
      <button className="icon-btn" onClick={toggle} aria-label="Notifications">
        <Bell size={20} />
        {data.unread > 0 && <span className="bell-dot">{data.unread}</span>}
      </button>

      {open && (
        <div className="notifications-popover">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.5rem 0.65rem', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Notifications</span>
            {data.items.length > 0 && (
              <span className="faint">{data.items.length} total</span>
            )}
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            {data.items.length === 0 ? (
              <p className="muted center" style={{ padding: '1.5rem 0.5rem' }}>
                No notifications yet.
              </p>
            ) : (
              data.items.map((n) => (
                <div
                  key={n.id}
                  className={`notification-item ${n.read_at ? '' : 'unread'}`}
                  onClick={() => {
                    setOpen(false)
                    if (n.order_id) nav(`/orders/${n.order_id}`)
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: n.read_at ? 'var(--surface-subtle)' : 'var(--brand-subtle)',
                      color: n.read_at ? 'var(--text-muted)' : 'var(--brand)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <PackageCheck size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
                          {n.body}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { profile, demoSignIn } = useAuth()
  const nav = useNavigate()
  const role = profile?.role ?? 'customer'
  const items = NAV[role]

  const switchRole = (r: Role) => {
    demoSignIn(r)
    nav(NAV[r][0].to, { replace: true })
  }

  return (
    <>
      <header className="topbar">
        {DEMO && (
          <div className="demo-bar">
            <div className="demo-in">
              <span className="demo-badge">
                <Sparkles size={12} /> Interactive Demo
              </span>
              <span className="muted">Switch View:</span>
              <div className="demo-roles">
                {(Object.keys(ROLE_META) as Role[]).map((r) => {
                  const Icon = ROLE_META[r].icon
                  return (
                    <button
                      key={r}
                      className={`chip-role ${r === role ? 'on' : ''}`}
                      onClick={() => switchRole(r)}
                    >
                      <Icon size={13} />
                      <span>{ROLE_META[r].label}</span>
                    </button>
                  )
                })}
              </div>
              <button
                className="chip-reset"
                onClick={() => {
                  resetDemo()
                  location.href = '/'
                }}
              >
                <RotateCcw size={12} style={{ display: 'inline', marginRight: 4 }} />
                Reset Data
              </button>
            </div>
          </div>
        )}

        <div className="topbar-in">
          <div className="brand-wrapper">
            <Link to="/" className="brand">
              <div className="brand-logo-icon">
                <Sparkles size={18} />
              </div>
              <span>Poshak</span>
            </Link>

            {role === 'customer' && (
              <div className="loc-pill" title="Current Service Location">
                <MapPin size={15} className="loc-icon" />
                <div className="loc-text">
                  <span className="loc-title">
                    Indiranagar <ChevronDown size={12} />
                  </span>
                  <span className="loc-subtitle">Bengaluru, Karnataka</span>
                </div>
              </div>
            )}
          </div>

          <nav className="topnav">
            {items.map((n) => {
              const Icon = n.icon
              return (
                <NavLink key={n.to} to={n.to} end>
                  <Icon size={16} />
                  <span>{n.label}</span>
                </NavLink>
              )
            })}
          </nav>

          <div className="top-right">
            <NotificationBell />
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar">
        {items.map((n) => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end>
              <Icon size={19} />
              <span>{n.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
