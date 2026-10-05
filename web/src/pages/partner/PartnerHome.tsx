import { useEffect, useState } from 'react'
import {
  Bike,
  MapPin,
  Calendar,
  Scale,
  CheckCircle2,
  Banknote,
  Package
} from 'lucide-react'
import { api, fmtSlot, rupees, type Order, type Status } from '../../lib/api'
import { useAction, useAsync } from '../../lib/useAsync'
import { Badge, Empty, ErrorText, Loading } from '../../components/ui'
import { PhotoStrip } from '../../components/Photos'

const NEXT: Partial<Record<Status, { to: Status; label: string }>> = {
  pickup_assigned: { to: 'picked_up', label: 'Confirm Picked Up from Customer' },
  ready: { to: 'out_for_delivery', label: 'Start Doorstep Delivery' },
  out_for_delivery: { to: 'delivered', label: 'Mark Delivered to Customer' },
}

function MyOrder({ o, onDone }: { o: Order; onDone: () => void }) {
  const [kg, setKg] = useState('')
  const act = useAction(onDone)
  const next = NEXT[o.status]

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--brand)', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.65rem' }}>
        <div>
          <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 600 }}>ORDER #{o.id.slice(-6).toUpperCase()}</span>
          <h3 style={{ margin: '0.15rem 0 0' }}>{o.shops?.name}</h3>
        </div>
        <Badge status={o.status} />
      </div>

      <div style={{ background: 'var(--surface-subtle)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.85rem', fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
          <Calendar size={14} color="var(--brand)" />
          <span>Slot: {fmtSlot(o.pickup_slot_start, o.pickup_slot_end)}</span>
        </div>
        {o.addresses && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', color: 'var(--text-secondary)' }}>
            <MapPin size={14} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{o.addresses.line1}, {o.addresses.city} {o.addresses.pincode}</span>
          </div>
        )}
      </div>

      <PhotoStrip photos={o.order_photos} label="Customer Verification Photos" />

      {o.payment_method === 'cod' && o.final_amount != null && o.status === 'out_for_delivery' && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', margin: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#065f46' }}>
          <Banknote size={18} />
          <span style={{ fontWeight: 700 }}>Collect {rupees(o.final_amount)} Cash upon Delivery</span>
        </div>
      )}

      {o.status === 'picked_up' && (
        <div style={{ background: 'var(--brand-light)', border: '1px solid var(--brand-200)', padding: '1rem', borderRadius: 'var(--radius-lg)', margin: '0.75rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: 'var(--brand-700)', marginBottom: '0.4rem' }}>
            <Scale size={16} />
            <span>Enter Weighed Weight</span>
          </div>
          <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.65rem' }}>
            Place clothes on your portable digital scale to set final customer bill:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number"
              min="0.1"
              step="0.1"
              placeholder="e.g. 3.5 kg"
              value={kg}
              onChange={(e) => setKg(e.target.value)}
              style={{ margin: 0, flex: 1 }}
            />
            <button
              type="button"
              className="primary"
              disabled={act.busy || !(Number(kg) > 0)}
              onClick={() => act.run(() => api.partnerWeigh(o.id, Number(kg)))}
            >
              {act.busy ? 'Saving…' : 'Save & Calculate Bill'}
            </button>
          </div>
        </div>
      )}

      {next && (
        <button
          type="button"
          className="primary wide"
          disabled={act.busy}
          onClick={() => act.run(() => api.partnerStatus(o.id, next.to))}
          style={{ marginTop: '0.75rem' }}
        >
          {act.busy ? 'Updating…' : next.label}
        </button>
      )}

      {['weighed', 'washing'].includes(o.status) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          <CheckCircle2 size={15} color="var(--green)" />
          <span>Handed over to shop. You will be notified once washing is completed.</span>
        </div>
      )}

      <ErrorText msg={act.error} />
    </div>
  )
}

export default function PartnerHome() {
  const avail = useAsync(api.partnerAvailable)
  const mine = useAsync(api.partnerMine)
  const refresh = () => {
    avail.reload()
    mine.reload()
  }
  const accept = useAction(refresh)

  useEffect(() => {
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  })

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bike size={22} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Delivery Partner Hub</h1>
          <span className="muted" style={{ fontSize: '0.85rem' }}>Active pickups and delivery tasks</span>
        </div>
      </div>

      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>
        Active Assignments ({mine.data?.length ?? 0})
      </h2>
      <ErrorText msg={mine.error} />
      <Loading loading={mine.loading}>
        {mine.data?.length === 0 && (
          <Empty icon={Bike}>No active assignments. Accept available pickups below to start earning.</Empty>
        )}
        {mine.data?.map((o) => (
          <MyOrder key={o.id} o={o} onDone={refresh} />
        ))}
      </Loading>

      <h2 style={{ fontSize: '1.2rem', marginTop: '2rem', marginBottom: '0.75rem' }}>
        Available Pickups ({avail.data?.length ?? 0})
      </h2>
      <ErrorText msg={avail.error || accept.error} />
      <Loading loading={avail.loading}>
        {avail.data?.length === 0 && (
          <Empty icon={Package}>No unassigned pickups waiting in your zone right now.</Empty>
        )}
        {avail.data?.map((o) => (
          <div key={o.id} className="card" style={{ marginBottom: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{o.shops?.name}</strong>
                <div className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                  {fmtSlot(o.pickup_slot_start, o.pickup_slot_end)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                  <MapPin size={13} color="var(--brand)" />
                  <span>{o.addresses?.city} {o.addresses?.pincode}</span>
                </div>
              </div>

              <button
                type="button"
                className="primary"
                disabled={accept.busy}
                onClick={() => accept.run(() => api.partnerAccept(o.id))}
              >
                {accept.busy ? 'Accepting…' : 'Accept Pickup'}
              </button>
            </div>
          </div>
        ))}
      </Loading>
    </div>
  )
}
