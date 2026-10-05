import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Clock,
  Bike,
  Shirt,
  Scale,
  Sparkles,
  CheckCircle2,
  XCircle,
  MapPin,
  CreditCard,
  Banknote,
  Star,
  Receipt,
  Calendar,
  ShieldCheck,
  Zap,
  ArrowLeft
} from 'lucide-react'
import { api, fmtSlot, PAYMENT_LABEL, rupees, STATUS_FLOW, STATUS_LABEL, type Status } from '../../lib/api'
import { useAction, useAsync } from '../../lib/useAsync'
import { ErrorText, Loading, Badge } from '../../components/ui'
import { PhotoStrip } from '../../components/Photos'
import RepeatOrder from '../../components/RepeatOrder'
import { ReorderButtons } from '../../components/Reorder'

declare global {
  interface Window {
    Razorpay?: new (o: unknown) => { open: () => void }
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment window'))
    document.body.appendChild(s)
  })
}

const STATUS_ICONS: Record<Status, typeof Clock> = {
  placed: Clock,
  pickup_assigned: Bike,
  picked_up: Shirt,
  weighed: Scale,
  washing: Sparkles,
  ready: CheckCircle2,
  out_for_delivery: Bike,
  delivered: CheckCircle2,
  cancelled: XCircle
}

const STATUS_DESCRIPTIONS: Record<Status, { title: string; sub: string }> = {
  placed: { title: 'Order Confirmed', sub: 'Looking for a pickup partner near you' },
  pickup_assigned: { title: 'Partner Assigned', sub: 'Your delivery partner is on the way to pick up' },
  picked_up: { title: 'Clothes Collected', sub: 'In transit to the laundry shop' },
  weighed: { title: 'Weighed & Inspected', sub: 'Final accurate bill generated based on weight' },
  washing: { title: 'Washing & Care in Progress', sub: 'Gentle cleaning with premium fabric care' },
  ready: { title: 'Fresh, Ironed & Packed', sub: 'Your clothes are ready for delivery' },
  out_for_delivery: { title: 'Out for Delivery', sub: 'Partner is arriving at your doorstep' },
  delivered: { title: 'Delivered Successfully', sub: 'Enjoy your clean, fresh clothes!' },
  cancelled: { title: 'Order Cancelled', sub: 'This order has been cancelled' }
}

export default function OrderDetail() {
  const { orderId = '' } = useParams()
  const { data: o, error, loading, reload } = useAsync(() => api.order(orderId), [orderId])
  const [stars, setStars] = useState(5)
  const [review, setReview] = useState('')
  const cancel = useAction(reload)
  const rate = useAction(reload)
  const pay = useAction(reload)

  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  if (!o) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <ErrorText msg={error} />
        <Loading loading={loading}>
          <></>
        </Loading>
      </div>
    )
  }

  const reached = new Set(o.order_events?.map((e) => e.status))
  const cancelled = o.status === 'cancelled'
  const isDelivered = o.status === 'delivered'
  const canCancel = o.status === 'placed' || o.status === 'pickup_assigned'
  const mustPay = o.payment_method === 'online' && o.payment_status !== 'paid' && o.final_amount != null && !cancelled

  const HeroIcon = STATUS_ICONS[o.status] || Clock
  const heroMeta = STATUS_DESCRIPTIONS[o.status] || { title: STATUS_LABEL[o.status], sub: '' }

  const payOnline = () =>
    pay.run(async () => {
      await loadRazorpay()
      const p = await api.createPayment(o.id)
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: p.key_id,
          amount: p.amount,
          currency: p.currency,
          order_id: p.razorpay_order_id,
          name: 'Poshak Laundry',
          handler: (r: unknown) => api.verifyPayment(r).then(() => resolve(), reject),
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) }
        })
        rzp.open()
      })
    })

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/orders" className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: 0 }}>
          <ArrowLeft size={16} />
          <span>Back to all orders</span>
        </Link>
      </div>

      {/* Status Hero Card */}
      <div className={`status-hero-card ${isDelivered ? 'done' : cancelled ? 'bad' : ''}`}>
        <div className="status-hero-icon">
          <HeroIcon size={32} />
        </div>
        <h1 style={{ fontSize: '1.65rem', marginBottom: '0.3rem' }}>{heroMeta.title}</h1>
        <p className="muted" style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
          {heroMeta.sub}
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fff', padding: '0.35rem 0.85rem', borderRadius: varRadius('radius-full'), border: '1px solid var(--border)', fontSize: '0.82rem', fontWeight: 600 }}>
          <span>{o.shops?.name}</span>
          <span>·</span>
          <span>Order #{o.id.slice(-6).toUpperCase()}</span>
        </div>
      </div>

      <ErrorText msg={error} />

      {o.partner_tracking && (
        <section className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ fontSize: '1.8rem' }}>🛵</div>
          <div>
            <strong>{o.partner_tracking.name} is {o.partner_tracking.distance_km} km away</strong>
            <div className="muted">About {o.partner_tracking.eta_minutes} min to {o.partner_tracking.heading === 'pickup' ? 'reach you for pickup' : 'deliver to you'}</div>
          </div>
        </section>
      )}

      {/* Live Tracking Stepper */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Live Tracking</h3>
          <Badge status={o.status} />
        </div>

        {cancelled ? (
          <p className="muted">This order was cancelled.</p>
        ) : (
          <ol className="timeline-stepper">
            {STATUS_FLOW.map((s) => {
              const isReached = reached.has(s)
              const isCurrent = s === o.status && s !== 'delivered'
              return (
                <li
                  key={s}
                  className={`timeline-step ${isReached ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{STATUS_LABEL[s]}</span>
                    {isCurrent && (
                      <span className="badge badge-placed" style={{ fontSize: '0.7rem' }}>
                        In Progress
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        {canCancel && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="danger"
              disabled={cancel.busy}
              onClick={() => cancel.run(() => api.cancelOrder(o.id))}
            >
              {cancel.busy ? 'Cancelling…' : 'Cancel Order'}
            </button>
          </div>
        )}
        <ErrorText msg={cancel.error} />
      </section>

      {/* Photos verification */}
      {o.order_photos && o.order_photos.length > 0 && (
        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={18} color="var(--brand)" />
            <h3 style={{ margin: 0 }}>Clothes Photos &amp; Verification</h3>
          </div>
          <PhotoStrip photos={o.order_photos} />
        </section>
      )}

      {/* Itemized Bill & Payment Card */}
      <section className="card bill-summary">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
          <Receipt size={18} color="var(--brand)" />
          <h3 style={{ margin: 0 }}>Order Details &amp; Bill</h3>
        </div>

        <div style={{ background: 'var(--surface-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.85rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
            <Calendar size={14} color="var(--brand)" />
            <span>Pickup: {fmtSlot(o.pickup_slot_start, o.pickup_slot_end)}</span>
          </div>
          {o.addresses && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
              <MapPin size={14} color="var(--brand)" />
              <span>{o.addresses.line1}, {o.addresses.city} {o.addresses.pincode}</span>
            </div>
          )}
        </div>

        {o.order_items?.map((i) => (
          <div key={i.id} className="bill-row">
            <span>
              {i.services?.name} × {i.quantity}
            </span>
            <span style={{ fontWeight: 600 }}>{rupees(i.unit_price * i.quantity)}</span>
          </div>
        ))}

        {Number(o.discount_amount) > 0 && (
          <div className="bill-row" style={{ color: 'var(--green-dark)', fontWeight: 600 }}>
            <span>Promo {o.promo_code}</span>
            <span>− {rupees(o.discount_amount)}</span>
          </div>
        )}

        <div className="bill-row" style={{ color: 'var(--text-muted)' }}>
          <span>Estimated Initial Amount</span>
          <span>{rupees(o.estimated_amount)}</span>
        </div>

        {o.weight_kg != null && (
          <div className="bill-row" style={{ color: 'var(--brand-700)', fontWeight: 600 }}>
            <span>Measured Weight at Pickup</span>
            <span>{o.weight_kg} kg</span>
          </div>
        )}

        <div className="bill-row bill-total">
          <span>Final Bill Amount</span>
          <span style={{ color: 'var(--brand)' }}>
            {o.final_amount != null ? rupees(o.final_amount) : 'Calculated after weighing'}
          </span>
        </div>

        {Number(o.refunded_amount) > 0 && (
          <div className="bill-row" style={{ color: 'var(--green-dark)', fontWeight: 700 }}>
            <span>Refunded</span>
            <span>− {rupees(o.refunded_amount)}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {o.payment_method === 'cod' ? <Banknote size={16} /> : <CreditCard size={16} />}
            <span>{o.payment_method === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</span>
          </div>
          <span className={`badge ${o.payment_status === 'paid' ? 'badge-delivered' : 'badge-placed'}`}>
            {(PAYMENT_LABEL[o.payment_status] ?? o.payment_status).toUpperCase()}
          </span>
        </div>

        {mustPay && (
          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              className="primary wide"
              disabled={pay.busy}
              onClick={payOnline}
            >
              <CreditCard size={18} />
              <span>{pay.busy ? 'Opening Payment…' : `Pay ${rupees(o.final_amount)} Now via Razorpay`}</span>
            </button>
          </div>
        )}
        <ErrorText msg={pay.error} />
      </section>

      {!cancelled && (o.order_items?.length ?? 0) > 0 && <RepeatOrder order={o} />}

      {/* Need this again? */}
      {(isDelivered || cancelled) && (
        <section className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <Zap size={18} color="var(--brand)" />
            <h3 style={{ margin: 0 }}>Need This Again?</h3>
          </div>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Reorder the same services from {o.shops?.name} in 1 tap.
          </p>
          <ReorderButtons order={o} />
        </section>
      )}

      {/* Rate this order */}
      {isDelivered && (
        <section className="card">
          <h3 style={{ marginBottom: '0.4rem' }}>Rate &amp; Review Your Experience</h3>
          {o.rating ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green-dark)', fontWeight: 600 }}>
              <CheckCircle2 size={18} />
              <span>
                You rated this {'★'.repeat(o.rating)} {o.review ? `— "${o.review}"` : ''}
              </span>
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                How was the wash quality and delivery speed?
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    style={{
                      border: 0,
                      background: 'none',
                      padding: '0.2rem',
                      color: n <= stars ? 'var(--amber)' : 'var(--border)'
                    }}
                    onClick={() => setStars(n)}
                    aria-label={`${n} stars`}
                  >
                    <Star size={32} fill={n <= stars ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>

              <input
                placeholder="Write a quick review (optional)…"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                maxLength={500}
              />

              <button
                type="button"
                className="primary"
                disabled={rate.busy}
                onClick={() => rate.run(() => api.rateOrder(o.id, stars, review))}
              >
                {rate.busy ? 'Submitting…' : 'Submit Feedback'}
              </button>
              <ErrorText msg={rate.error} />
            </>
          )}
        </section>
      )}
    </div>
  )
}

function varRadius(key: string) {
  return 'var(--' + key + ')'
}