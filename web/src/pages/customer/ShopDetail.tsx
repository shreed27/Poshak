import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  MapPin,
  Clock,
  ShieldCheck,
  Bike,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag
} from 'lucide-react'
import { api, rupees } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { Banner, Empty, ErrorText, Loading, Rating, ServiceIconTag } from '../../components/ui'

export default function ShopDetail() {
  const { shopId = '' } = useParams()
  const nav = useNavigate()
  const shops = useAsync(api.shops)
  const services = useAsync(() => api.shopServices(shopId), [shopId])
  const location = useLocation() as { state: { cart?: Record<string, number> } | null }
  const [cart, setCart] = useState<Record<string, number>>(() => location.state?.cart ?? {})

  const shop = shops.data?.find((s) => s.id === shopId)
  const lines = (services.data ?? []).filter((s) => cart[s.id] > 0)
  const total = lines.reduce((sum, s) => sum + s.price * cart[s.id], 0)
  const count = lines.reduce((sum, s) => sum + cart[s.id], 0)

  const setQty = (id: string, q: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, q) }))

  return (
    <div className="narrow" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Shop Header Card */}
      <div className="shop-hero-card">
        {shop && <Banner shop={shop} tag="Verified Laundry Partner" />}
        <div className="shop-hero-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
            <div>
              <h1 style={{ marginBottom: '0.25rem', fontSize: '1.65rem' }}>
                {shop?.name ?? 'Laundry Shop'}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                <MapPin size={15} />
                <span>{shop?.address ?? shop?.city}</span>
              </div>
            </div>
            <Rating value={shop?.rating} />
          </div>

          <div className="shop-info-badges">
            <span className="info-badge">
              <Bike size={14} color="var(--brand)" />
              <span>Free Pickup &amp; Drop</span>
            </span>
            <span className="info-badge">
              <ShieldCheck size={14} color="var(--accent-teal)" />
              <span>Sanitized &amp; Fabric-Safe</span>
            </span>
          </div>

          {shop?.description && (
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              {shop.description}
            </p>
          )}
        </div>
      </div>

      {/* Services Menu Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 1rem' }}>
        <h2 style={{ margin: 0 }}>Select Services</h2>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {(services.data?.length ?? 0)} available
        </span>
      </div>

      <ErrorText msg={services.error} />

      <Loading loading={services.loading}>
        {!services.error && services.data?.length === 0 && (
          <Empty icon={ShoppingBag}>
            This laundry has no active services listed right now.
          </Empty>
        )}

        {services.data?.map((s) => {
          const qty = cart[s.id] ?? 0
          return (
            <div key={s.id} className="service-item-card">
              <div className="service-details">
                <div className="service-name">
                  <ServiceIconTag name={s.name} />
                  <span>{s.name}</span>
                </div>

                <div className="service-price">
                  {rupees(s.price)}{' '}
                  <span className="muted" style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                    / {s.unit}
                  </span>
                </div>

                <div className="service-subtext">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={13} /> Ready in ~{s.turnaround_hours}h
                  </span>
                  {s.unit === 'kg' && (
                    <span> · Actual weight measured at pickup</span>
                  )}
                </div>
              </div>

              <div style={{ flexShrink: 0 }}>
                {qty === 0 ? (
                  <button
                    type="button"
                    className="btn-add"
                    onClick={() => setQty(s.id, 1)}
                  >
                    ADD
                  </button>
                ) : (
                  <div className="stepper-control">
                    <button
                      type="button"
                      onClick={() => setQty(s.id, qty - 1)}
                      aria-label={`Remove one ${s.name}`}
                    >
                      <Minus size={15} />
                    </button>
                    <span>
                      {qty} {s.unit === 'kg' ? 'kg' : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(s.id, qty + 1)}
                      aria-label={`Add one ${s.name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </Loading>

      {/* Floating Bottom Cart Bar */}
      {count > 0 && (
        <button
          type="button"
          className="cart-floating-bar"
          onClick={() =>
            nav('/checkout', {
              state: {
                shopId,
                shopName: shop?.name,
                items: lines.map((s) => ({
                  service_id: s.id,
                  quantity: cart[s.id],
                  name: s.name,
                  unit: s.unit,
                  price: s.price
                }))
              }
            })
          }
        >
          <div className="cart-bar-info">
            <b>{lines.length} service{lines.length > 1 ? 's' : ''} · est. {rupees(total)}</b>
            <small>Final bill generated after weighing at pickup</small>
          </div>

          <div className="cart-bar-action">
            <span>Review &amp; Pay</span>
            <ArrowRight size={18} />
          </div>
        </button>
      )}
    </div>
  )
}
