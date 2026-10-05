import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Sparkles,
  Shirt,
  Wind,
  Flame,
  Footprints,
  Layers,
  Clock,
  MapPin,
  CheckCircle2,
  Bike,
  Scale,
  Zap,
  X,
  Store
} from 'lucide-react'
import { api, rupees, type Shop } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { Banner, Empty, ErrorText, Loading, Rating, ShopTile } from '../../components/ui'
import { orderSummary, ReorderButtons } from '../../components/Reorder'

const CATEGORIES = [
  { key: '', label: 'All Services', icon: Sparkles },
  { key: 'wash', label: 'Wash & Fold', icon: Shirt },
  { key: 'dry', label: 'Dry Cleaning', icon: Wind },
  { key: 'iron', label: 'Steam Press', icon: Flame },
  { key: 'shoe', label: 'Shoes & Bags', icon: Footprints },
  { key: 'bedding', label: 'Bedding Care', icon: Layers },
]

const minTurnaround = (s: Shop) => Math.min(...(s.services ?? []).map((v) => v.turnaround_hours), 999)

const startingPrice = (s: Shop) => {
  const kg = (s.services ?? []).filter((v) => v.unit === 'kg').map((v) => v.price)
  return kg.length
    ? `From ${rupees(Math.min(...kg))}/kg`
    : `From ${rupees(Math.min(...(s.services ?? []).map((v) => v.price)))}/pc`
}

export default function Shops() {
  const { data, error, loading } = useAsync(api.shops)
  const past = useAsync(api.orders)
  const again = (past.data ?? []).filter((o) => o.status !== 'cancelled').slice(0, 2)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [topRated, setTopRated] = useState(false)
  const [fast, setFast] = useState(false)

  const shops = useMemo(() => (data ?? []).filter((s) => {
    const hay = `${s.name} ${s.description ?? ''} ${(s.services ?? []).map((v) => v.name).join(' ')}`.toLowerCase()
    return (!q || hay.includes(q.toLowerCase()))
      && (!cat || (s.services ?? []).some((v) => v.name.toLowerCase().includes(cat)))
      && (!topRated || (s.rating ?? 0) >= 4.5)
      && (!fast || minTurnaround(s) <= 24)
  }), [data, q, cat, topRated, fast])

  return (
    <>
      {/* Hero Section */}
      <div className="hero-banner">
        <div className="hero-tag">
          <Zap size={13} />
          <span>Doorstep Pickup in 60 Minutes</span>
        </div>
        <h1>Fresh, crisp clothes without the hassle.</h1>
        <p>Curated neighborhood laundries with guaranteed fabric care</p>

        <label className="search-box">
          <Search size={18} />
          <input
            placeholder="Search laundries, dry cleaning, steam press or shoes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setQ('')}
              style={{ padding: '0.2rem' }}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </label>
      </div>

      {/* Service Categories Bar */}
      <div className="categories-bar">
        {CATEGORIES.map((c) => {
          const Icon = c.icon
          const isActive = cat === c.key
          return (
            <button
              key={c.key}
              className={`category-item ${isActive ? 'active' : ''}`}
              onClick={() => setCat(c.key)}
            >
              <div className="category-icon-box">
                <Icon size={24} />
              </div>
              <span>{c.label}</span>
            </button>
          )
        })}
      </div>

      {/* Value Proposition Highlights */}
      <div className="value-props">
        <div className="value-card">
          <div className="value-card-icon" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Bike size={20} />
          </div>
          <div>
            <h4>Free Pickup &amp; Drop</h4>
            <p>At your doorstep, zero delivery fees</p>
          </div>
        </div>

        <div className="value-card">
          <div className="value-card-icon" style={{ background: '#f0fdfa', color: '#0d9488' }}>
            <Scale size={20} />
          </div>
          <div>
            <h4>Pay by Actual Weight</h4>
            <p>Transparent billing per kg on pickup</p>
          </div>
        </div>

        <div className="value-card">
          <div className="value-card-icon" style={{ background: '#fffbeb', color: '#d97706' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h4>Fabric Safe Guarantee</h4>
            <p>Hygienic wash &amp; gentle steam iron</p>
          </div>
        </div>
      </div>

      {/* Order Again Section */}
      {again.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2>Order Again</h2>
          <div className="grid-2">
            {again.map((o) => (
              <div key={o.id} className="card" style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                  <ShopTile shop={o.shops ?? {}} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{o.shops?.name}</div>
                    <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
                      {orderSummary(o)}
                    </div>
                  </div>
                </div>
                <ReorderButtons order={o} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.75rem', marginBottom: '0.85rem' }}>
        <h2 style={{ margin: 0 }}>
          {loading ? 'Laundries near you' : `${shops.length} verified laundr${shops.length === 1 ? 'y' : 'ies'} near you`}
        </h2>
      </div>

      <div className="filter-toolbar">
        <button
          className={`filter-chip ${topRated ? 'active' : ''}`}
          onClick={() => setTopRated(!topRated)}
        >
          <Sparkles size={14} />
          <span>Top Rated (4.5★+)</span>
        </button>

        <button
          className={`filter-chip ${fast ? 'active' : ''}`}
          onClick={() => setFast(!fast)}
        >
          <Clock size={14} />
          <span>Express 24h</span>
        </button>

        {(q || cat || topRated || fast) && (
          <button
            className="filter-chip clear"
            onClick={() => {
              setQ('')
              setCat('')
              setTopRated(false)
              setFast(false)
            }}
          >
            <X size={14} />
            <span>Clear Filters</span>
          </button>
        )}
      </div>

      <ErrorText msg={error} />

      <Loading loading={loading}>
        {shops.length === 0 && (
          <Empty
            icon={Store}
            action={
              (q || cat || topRated || fast) ? (
                <button
                  className="primary"
                  onClick={() => {
                    setQ('')
                    setCat('')
                    setTopRated(false)
                    setFast(false)
                  }}
                >
                  Reset Filters
                </button>
              ) : null
            }
          >
            No laundries found matching your criteria. Try adjusting your search or filters.
          </Empty>
        )}

        <div className="grid">
          {shops.map((s) => {
            const turnaround = minTurnaround(s)
            return (
              <Link key={s.id} to={`/shop/${s.id}`} className="shop-card-v2">
                <Banner
                  shop={s}
                  tag={turnaround <= 24 ? '⚡ 24h Express' : 'Free Pickup & Drop'}
                />
                <div className="shop-card-body">
                  <div className="shop-card-header">
                    <h3>{s.name}</h3>
                    <Rating value={s.rating} />
                  </div>

                  <div className="shop-meta-row">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--brand-700)', fontWeight: 600 }}>
                      <Clock size={14} /> ~{turnaround}h
                    </span>
                    <span>·</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                      {startingPrice(s)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.65rem' }}>
                    <MapPin size={13} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.address ?? s.city}
                    </span>
                  </div>

                  <div className="shop-services-tags">
                    {[...new Set((s.services ?? []).map((v) => v.name))].slice(0, 3).map((name) => (
                      <span key={name} className="service-pill">
                        {name}
                      </span>
                    ))}
                    {(s.services?.length ?? 0) > 3 && (
                      <span className="service-pill" style={{ color: 'var(--brand)' }}>
                        +{(s.services?.length ?? 0) - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </Loading>
    </>
  )
}
