import { useEffect, useState } from 'react'
import {
  Store,
  Plus,
  Edit2
} from 'lucide-react'
import { api, fmtSlot, rupees, type Order, type Service, type Shop, type Status } from '../../lib/api'
import { useAction, useAsync } from '../../lib/useAsync'
import { Badge, ErrorText, Loading } from '../../components/ui'
import { PhotoStrip } from '../../components/Photos'

const NEXT: Partial<Record<Status, { to: Status; label: string }>> = {
  weighed: { to: 'washing', label: 'Start Washing & Care' },
  washing: { to: 'ready', label: 'Mark Ironed & Ready for Delivery' },
}

const INCOMING: Status[] = ['placed', 'pickup_assigned', 'picked_up']

function OrderCard({ o, onDone }: { o: Order; onDone: () => void }) {
  const act = useAction(onDone)
  const next = NEXT[o.status]

  return (
    <div className="card" style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div>
          <strong style={{ fontSize: '0.95rem' }}>Order #{o.id.slice(-6).toUpperCase()}</strong>
          <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
            Pickup: {fmtSlot(o.pickup_slot_start, o.pickup_slot_end)}
          </div>
        </div>
        <Badge status={o.status} />
      </div>

      <div style={{ background: 'var(--surface-subtle)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', margin: '0.5rem 0', fontSize: '0.85rem' }}>
        {o.order_items?.map((i) => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500 }}>
            <span>{i.services?.name}</span>
            <span>× {i.quantity}</span>
          </div>
        ))}
      </div>

      <PhotoStrip photos={o.order_photos} label="Customer Clothes Photos" />

      {o.weight_kg != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', fontSize: '0.88rem', fontWeight: 600 }}>
          <span>Measured Weight: {o.weight_kg} kg</span>
          <span style={{ color: 'var(--brand)' }}>{rupees(o.final_amount)}</span>
        </div>
      )}

      {next && (
        <button
          type="button"
          className="primary wide"
          disabled={act.busy}
          onClick={() => act.run(() => api.shopStatus(o.id, next.to))}
          style={{ marginTop: '0.65rem' }}
        >
          {act.busy ? 'Updating…' : next.label}
        </button>
      )}
      <ErrorText msg={act.error} />
    </div>
  )
}

function ServiceEditor({ shop, onChange }: { shop: Shop; onChange: () => void }) {
  const [f, setF] = useState({ name: '', unit: 'kg' as 'kg' | 'piece', price: '', turnaround_hours: '48' })
  const [showAdd, setShowAdd] = useState(false)
  const add = useAction(() => {
    setF({ ...f, name: '', price: '' })
    setShowAdd(false)
    onChange()
  })
  const upd = useAction(onChange)

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>{shop.name} — Service Menu</h3>
          <span className="muted" style={{ fontSize: '0.8rem' }}>Manage services, turnaround times and prices</span>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus size={15} />
          <span>Add Service</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {shop.services?.map((s: Service) => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: s.is_active ? '#fff' : 'var(--surface-subtle)',
              opacity: s.is_active ? 1 : 0.6
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{s.name}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {rupees(s.price)} / {s.unit} · ~{s.turnaround_hours}h turnaround
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => {
                  const v = window.prompt('Enter new price in ₹:', String(s.price))
                  if (v && v.trim() !== '' && Number(v) >= 0) {
                    upd.run(() => api.updateService(s.id, { price: Number(v) }))
                  }
                }}
              >
                <Edit2 size={13} style={{ display: 'inline', marginRight: 3 }} />
                Price
              </button>

              <button
                type="button"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                onClick={() => upd.run(() => api.updateService(s.id, { is_active: !s.is_active }))}
              >
                {s.is_active ? 'Active' : 'Disabled'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div style={{ background: 'var(--surface-subtle)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
          <h4 style={{ marginBottom: '0.75rem' }}>New Service Offer</h4>
          <input
            placeholder="Service name (e.g. Silk Saree Care, Bedding Wash)"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <select
              value={f.unit}
              onChange={(e) => setF({ ...f, unit: e.target.value as 'kg' | 'piece' })}
            >
              <option value="kg">Billed per kg</option>
              <option value="piece">Billed per piece</option>
            </select>
            <input
              type="number"
              min="0"
              placeholder="Price in ₹"
              value={f.price}
              onChange={(e) => setF({ ...f, price: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="number"
              min="1"
              placeholder="Turnaround in hours (e.g. 24 or 48)"
              value={f.turnaround_hours}
              onChange={(e) => setF({ ...f, turnaround_hours: e.target.value })}
              style={{ margin: 0, flex: 1 }}
            />
            <button
              type="button"
              className="primary"
              disabled={add.busy || !f.name || f.price === ''}
              onClick={() =>
                add.run(() =>
                  api.addService({
                    shop_id: shop.id,
                    name: f.name,
                    unit: f.unit,
                    price: Number(f.price),
                    turnaround_hours: Number(f.turnaround_hours) || 48
                  })
                )
              }
            >
              {add.busy ? 'Saving…' : 'Save Service'}
            </button>
          </div>
        </div>
      )}

      <ErrorText msg={add.error || upd.error} />
    </div>
  )
}

export default function ShopDashboard() {
  const orders = useAsync(api.shopOrders)
  const shops = useAsync(api.shopMe)
  const refresh = () => {
    orders.reload()
    shops.reload()
  }

  useEffect(() => {
    const t = setInterval(orders.reload, 20000)
    return () => clearInterval(t)
  })

  const by = (f: (o: Order) => boolean) => (orders.data ?? []).filter(f)
  const sections: [string, Order[]][] = [
    ['Needs Washing', by((o) => o.status === 'weighed')],
    ['Washing in Progress', by((o) => o.status === 'washing')],
    ['Ready / In Transit', by((o) => o.status === 'ready' || o.status === 'out_for_delivery')],
    ['Incoming Pickups', by((o) => INCOMING.includes(o.status))],
  ]

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Store size={22} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Laundry Shop Operations</h1>
          <span className="muted" style={{ fontSize: '0.85rem' }}>Order processing queue and menu catalog</span>
        </div>
      </div>

      <ErrorText msg={orders.error || shops.error} />

      <Loading loading={orders.loading}>
        {sections.map(([title, list]) => (
          <section key={title} style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span>{title}</span>
              <span className="badge" style={{ fontSize: '0.75rem' }}>{list.length}</span>
            </h2>
            {list.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem', padding: '0.5rem 0' }}>No orders in this stage.</p>
            ) : (
              list.map((o) => <OrderCard key={o.id} o={o} onDone={refresh} />)
            )}
          </section>
        ))}
      </Loading>

      <h2 style={{ fontSize: '1.25rem', marginTop: '2rem' }}>Laundry Menu &amp; Pricing</h2>
      {shops.data?.map((s) => (
        <ServiceEditor key={s.id} shop={s} onChange={shops.reload} />
      ))}
    </div>
  )
}
