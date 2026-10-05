import type { ReactNode } from 'react'
import {
  Star,
  AlertCircle,
  Sparkles,
  Shirt,
  Wind,
  Layers,
  Flame,
  Footprints,
  ShieldCheck,
  Smile
} from 'lucide-react'
import { STATUS_LABEL, type Shop, type Status } from '../lib/api'

export const Badge = ({ status }: { status: Status }) => (
  <span className={`badge badge-${status}`}>
    {STATUS_LABEL[status]}
  </span>
)

export const ErrorText = ({ msg }: { msg?: string | null }) => {
  if (!msg) return null
  return (
    <div className="error" role="alert">
      <AlertCircle size={16} />
      <span>{msg}</span>
    </div>
  )
}

export const Loading = ({ loading, children }: { loading: boolean; children: ReactNode }) => {
  if (loading) {
    return (
      <div className="grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    )
  }
  return <>{children}</>
}

export const Empty = ({
  children,
  icon: Icon = Smile,
  action
}: {
  children: ReactNode
  icon?: typeof Smile
  action?: ReactNode
}) => (
  <div className="empty">
    <div style={{
      width: 54,
      height: 54,
      borderRadius: '50%',
      background: 'var(--surface-subtle)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      marginBottom: '0.85rem'
    }}>
      <Icon size={26} />
    </div>
    <p style={{ maxWidth: 360, margin: '0 auto 1rem', color: 'var(--text-secondary)' }}>
      {children}
    </p>
    {action}
  </div>
)

export const Rating = ({ value }: { value: number | null | undefined }) => {
  if (value) {
    return (
      <span className={`rating-pill ${value < 4 ? 'low' : ''}`}>
        <Star size={12} fill="currentColor" /> {Number(value).toFixed(1)}
      </span>
    )
  }
  return <span className="rating-pill new">NEW</span>
}

type Look = Partial<Pick<Shop, 'emoji' | 'tint' | 'name'>>

const THEMES = [
  { bg: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)', icon: Sparkles, tag: 'Express Clean' },
  { bg: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)', icon: Shirt, tag: 'Eco Fresh' },
  { bg: 'linear-gradient(135deg, #4338ca 0%, #818cf8 100%)', icon: Layers, tag: 'Premium Care' },
  { bg: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)', icon: Flame, tag: 'Steam Press' },
  { bg: 'linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)', icon: ShieldCheck, tag: 'Royal Care' },
  { bg: 'linear-gradient(135deg, #0369a1 0%, #06b6d4 100%)', icon: Wind, tag: 'Fast Dry' },
]

export const shopLook = (shop: Look) => {
  const h = [...(shop.name ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
  return THEMES[h % THEMES.length]
}

export const Banner = ({ shop, tag }: { shop: Look; tag?: string }) => {
  const theme = shopLook(shop)
  const IconComponent = theme.icon

  return (
    <div className="shop-card-cover" style={{ background: theme.bg }}>
      <svg className="cover-pattern" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 0 C 30 50, 70 20, 100 80 L 100 100 L 0 100 Z" fill="rgba(255,255,255,0.12)" />
      </svg>
      <div className="cover-center-badge">
        <IconComponent size={28} color="#2563eb" />
      </div>
      <div className="tag-badge">
        <Sparkles size={12} />
        <span>{tag || theme.tag}</span>
      </div>
    </div>
  )
}

export const ShopTile = ({ shop }: { shop: Look }) => {
  const theme = shopLook(shop)
  const IconComponent = theme.icon

  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 'var(--radius-md)',
        background: theme.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        flexShrink: 0,
        boxShadow: '0 4px 10px rgba(0,0,0,0.12)'
      }}
    >
      <IconComponent size={22} />
    </div>
  )
}

export const getServiceIcon = (name: string) => {
  const n = name.toLowerCase()
  if (n.includes('shoe')) return Footprints
  if (n.includes('suit') || n.includes('saree') || n.includes('dress')) return ShieldCheck
  if (n.includes('curtain') || n.includes('bedding') || n.includes('blanket')) return Layers
  if (n.includes('dry')) return Wind
  if (n.includes('iron') || n.includes('press')) return Flame
  return Shirt
}

export const ServiceIconTag = ({ name }: { name: string }) => {
  const Icon = getServiceIcon(name)
  return <Icon size={18} style={{ color: 'var(--brand)', flexShrink: 0 }} />
}
