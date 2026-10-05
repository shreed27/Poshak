import { useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Calendar,
  Clock,
  CreditCard,
  Banknote,
  Plus,
  Building2,
  Home,
  Info,
  ArrowRight,
  ShoppingBag
} from 'lucide-react'
import { api, rupees, type Address } from '../../lib/api'
import { useAction, useAsync } from '../../lib/useAsync'
import { ErrorText, Loading } from '../../components/ui'
import { PhotoPicker, type Pending } from '../../components/Photos'
import { uploadOrderPhotos } from '../../lib/photos'
import { useAuth } from '../../lib/AuthContext'

interface CartItem {
  service_id: string
  quantity: number
  name: string
  unit: string
  price: number
}

const WINDOWS: [number, number, string][] = [
  [8, 10, '08:00 – 10:00 AM'],
  [10, 12, '10:00 – 12:00 PM'],
  [16, 18, '04:00 – 06:00 PM'],
  [18, 20, '06:00 – 08:00 PM']
]

function slotOptions() {
  const out: { dayIndex: number; dayLabel: string; start: Date; end: Date; label: string }[] = []
  const now = Date.now()

  for (let d = 0; d < 3; d++) {
    const dayDate = new Date()
    dayDate.setDate(dayDate.getDate() + d)
    const dayLabel =
      d === 0
        ? 'Today'
        : d === 1
        ? 'Tomorrow'
        : dayDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

    for (const [h1, h2, label] of WINDOWS) {
      const start = new Date(dayDate)
      start.setHours(h1, 0, 0, 0)
      const end = new Date(start)
      end.setHours(h2)

      if (start.getTime() > now + 30 * 60 * 1000) {
        out.push({ dayIndex: d, dayLabel, start, end, label })
      }
    }
  }
  return out
}

const blank = { label: 'Home', line1: '', line2: '', city: 'Bengaluru', pincode: '560038' }

export default function Checkout() {
  const { state } = useLocation() as {
    state: {
      shopId: string
      shopName?: string
      items: CartItem[]
      addressId?: string
      method?: 'cod' | 'online'
    } | null
  }
  const { profile } = useAuth()
  const nav = useNavigate()
  const addrs = useAsync(api.addresses)
  const [addressId, setAddressId] = useState(state?.addressId ?? '')
  const [slotIdx, setSlotIdx] = useState(0)
  const [selectedDay, setSelectedDay] = useState(0)
  const [method, setMethod] = useState<'cod' | 'online'>(state?.method ?? 'cod')
  const [photos, setPhotos] = useState<Pending[]>([])
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [form, setForm] = useState(blank)
  const slots = useMemo(() => slotOptions(), [])
  const addAction = useAction(() => {
    setForm(blank)
    setShowAddressForm(false)
    addrs.reload()
  })
  const place = useAction()

  if (!state?.items?.length) return <Navigate to="/" replace />

  const total = state.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const selected = addrs.data?.some((a) => a.id === addressId)
    ? addressId
    : addrs.data?.[0]?.id || ''
  const slot = slots[slotIdx] || slots[0]

  // Available days for slot tabs
  const availableDays = Array.from(new Set(slots.map((s) => s.dayIndex)))
  const filteredSlots = slots.filter((s) => s.dayIndex === selectedDay)

  const submit = () =>
    place.run(async () => {
      const photo_paths = photos.length
        ? await uploadOrderPhotos(
            photos.map((p) => p.blob),
            profile!.id
          )
        : []
      const order = await api.placeOrder({
        shop_id: state.shopId,
        address_id: selected,
        payment_method: method,
        photo_paths,
        pickup_slot_start: slot.start.toISOString(),
        pickup_slot_end: slot.end.toISOString(),
        items: state.items.map((i) => ({ service_id: i.service_id, quantity: i.quantity }))
      })
      nav(`/orders/${order.id}`, { replace: true })
    })

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.25rem' }}>Checkout &amp; Schedule Pickup</h1>

      {/* Order Summary Card */}
      <section className="card bill-summary">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--brand-light)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0 }}>{state.shopName || 'Laundry Shop'}</h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Order items preview</span>
          </div>
        </div>

        {state.items.map((i) => (
          <div key={i.service_id} className="bill-row">
            <span>
              {i.name} × {i.quantity} {i.unit === 'kg' ? 'kg' : ''}
            </span>
            <span style={{ fontWeight: 600 }}>{rupees(i.price * i.quantity)}</span>
          </div>
        ))}

        <div className="bill-row" style={{ color: 'var(--green-dark)' }}>
          <span>Doorstep Pickup &amp; Delivery</span>
          <span style={{ fontWeight: 700 }}>FREE</span>
        </div>

        <div className="bill-row bill-total">
          <span>Estimated Total</span>
          <span style={{ color: 'var(--brand)' }}>{rupees(total)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', background: 'var(--surface-subtle)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginTop: '0.85rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <Info size={16} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Weight-based services are measured accurately on digital scale at pickup before washing.</span>
        </div>
      </section>

      {/* 1. Pickup Address */}
      <section className="card">
        <div className="checkout-step-header">
          <span className="step-num-pill">1</span>
          <div>
            <h3 style={{ margin: 0 }}>Pickup &amp; Delivery Address</h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Where should our partner collect your clothes?</span>
          </div>
        </div>

        <Loading loading={addrs.loading}>
          {addrs.data?.map((a: Address) => {
            const isSelected = selected === a.id
            const isHome = (a.label || '').toLowerCase().includes('home')
            const Icon = isHome ? Home : Building2

            return (
              <label
                key={a.id}
                className={`address-option-card ${isSelected ? 'selected' : ''}`}
                onClick={() => setAddressId(a.id)}
              >
                <input
                  type="radio"
                  name="address"
                  checked={isSelected}
                  onChange={() => setAddressId(a.id)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.92rem' }}>
                    <Icon size={14} color="var(--brand)" />
                    <span>{a.label || 'Saved Address'}</span>
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.pincode}
                  </div>
                </div>
              </label>
            )
          })}

          {!showAddressForm && (
            <button
              type="button"
              className="secondary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              onClick={() => setShowAddressForm(true)}
            >
              <Plus size={16} />
              <span>Add New Address</span>
            </button>
          )}

          {showAddressForm && (
            <div style={{ background: 'var(--surface-subtle)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', marginTop: '0.75rem', border: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '0.75rem' }}>New Address Details</h4>
              <input
                placeholder="Label (e.g. Home, Office, Studio)"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
              <input
                placeholder="Flat / Building, Street name"
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
              />
              <input
                placeholder="Landmark (e.g. Near Metro Station)"
                value={form.line2}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <input
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
                <input
                  placeholder="Pincode"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="primary"
                  style={{ flex: 1 }}
                  disabled={addAction.busy || !form.line1 || !form.city || form.pincode.length !== 6}
                  onClick={() =>
                    addAction.run(() =>
                      api.addAddress({ ...form, line2: form.line2 || null })
                    )
                  }
                >
                  {addAction.busy ? 'Saving…' : 'Save Address'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddressForm(false)}
                >
                  Cancel
                </button>
              </div>
              <ErrorText msg={addAction.error} />
            </div>
          )}
        </Loading>
      </section>

      {/* 2. Pickup Slot Picker */}
      <section className="card">
        <div className="checkout-step-header">
          <span className="step-num-pill">2</span>
          <div>
            <h3 style={{ margin: 0 }}>Select Pickup Slot</h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Choose your preferred pickup window</span>
          </div>
        </div>

        {/* Day Tabs */}
        <div className="slot-tabs">
          {availableDays.map((d) => {
            const label =
              d === 0
                ? 'Today'
                : d === 1
                ? 'Tomorrow'
                : slots.find((s) => s.dayIndex === d)?.dayLabel ?? `Day ${d + 1}`
            return (
              <button
                key={d}
                type="button"
                className={`slot-tab-btn ${selectedDay === d ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDay(d)
                  const firstInDay = slots.findIndex((s) => s.dayIndex === d)
                  if (firstInDay !== -1) setSlotIdx(firstInDay)
                }}
              >
                <Calendar size={13} style={{ display: 'inline', marginRight: 4 }} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* Time Chips */}
        <div className="slot-grid">
          {filteredSlots.map((s) => {
            const actualIndex = slots.indexOf(s)
            const isSelected = slotIdx === actualIndex
            return (
              <div
                key={actualIndex}
                className={`slot-time-chip ${isSelected ? 'active' : ''}`}
                onClick={() => setSlotIdx(actualIndex)}
              >
                <Clock size={13} style={{ display: 'inline', marginRight: 4 }} />
                <span>{s.label}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* 3. Photos Verification */}
      <section className="card">
        <div className="checkout-step-header">
          <span className="step-num-pill">3</span>
          <div>
            <h3 style={{ margin: 0 }}>Clothes Photos (Optional)</h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Take photos to ensure accurate verification</span>
          </div>
        </div>

        <PhotoPicker photos={photos} onChange={setPhotos} />
      </section>

      {/* 4. Payment Method */}
      <section className="card">
        <div className="checkout-step-header">
          <span className="step-num-pill">4</span>
          <div>
            <h3 style={{ margin: 0 }}>Payment Method</h3>
            <span className="muted" style={{ fontSize: '0.8rem' }}>Pay online or cash upon delivery</span>
          </div>
        </div>

        <label
          className={`address-option-card ${method === 'cod' ? 'selected' : ''}`}
          onClick={() => setMethod('cod')}
        >
          <input
            type="radio"
            name="payment"
            checked={method === 'cod'}
            onChange={() => setMethod('cod')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
              <Banknote size={16} color="var(--green)" />
              <span>Pay on Delivery (Cash / UPI at doorstep)</span>
            </div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
              Hand over cash or scan QR when your fresh clothes are delivered back.
            </div>
          </div>
        </label>

        <label
          className={`address-option-card ${method === 'online' ? 'selected' : ''}`}
          onClick={() => setMethod('online')}
        >
          <input
            type="radio"
            name="payment"
            checked={method === 'online'}
            onChange={() => setMethod('online')}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
              <CreditCard size={16} color="var(--brand)" />
              <span>Pay Online via Razorpay (UPI, Cards, NetBanking)</span>
            </div>
            <div className="muted" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
              Pay securely after clothes are weighed and final bill is ready.
            </div>
          </div>
        </label>
      </section>

      <ErrorText msg={place.error} />

      <button
        type="button"
        className="primary wide"
        disabled={place.busy || !selected || !slot}
        onClick={submit}
        style={{ marginTop: '0.5rem', marginBottom: '2rem' }}
      >
        {place.busy ? (
          <span>{photos.length ? 'Uploading photos & booking…' : 'Booking Pickup…'}</span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Confirm Order · est. {rupees(total)}</span>
            <ArrowRight size={18} />
          </span>
        )}
      </button>
    </div>
  )
}
