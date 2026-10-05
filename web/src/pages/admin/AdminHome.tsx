import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Users,
  Plus
} from 'lucide-react'
import { api, rupees, type Order, type Role } from '../../lib/api'
import { useAction, useAsync } from '../../lib/useAsync'
import { Badge, ErrorText, Loading } from '../../components/ui'

const ROLES: Role[] = ['customer', 'partner', 'shop', 'admin']

function RefundForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const act = useAction(() => { setOpen(false); setAmount(''); setReason(''); onDone() })
  const left = Number(order.final_amount ?? order.estimated_amount) - Number(order.refunded_amount ?? 0)
  if (!['paid', 'partially_refunded'].includes(order.payment_status) || left <= 0) return null
  return open ? (
    <div className="card form" style={{ width: '100%', margin: '.5rem 0 0' }}>
      <input type="number" min="1" max={left} step="0.01" placeholder={`Amount (blank = full ₹${left})`} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input placeholder="Reason (e.g. damaged shirt)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <div className="inline">
        <button className="primary" disabled={act.busy} onClick={() => act.run(() => api.adminRefund(order.id, amount ? Number(amount) : null, reason))}>Issue refund</button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <ErrorText msg={act.error} />
    </div>
  ) : <button onClick={() => setOpen(true)}>Refund</button>
}

export default function AdminHome() {
  const stats = useAsync(api.adminStats)
  const orders = useAsync(api.adminOrders)
  const users = useAsync(api.adminUsers)
  const shops = useAsync(api.adminShops)
  const [shop, setShop] = useState({ name: '', city: 'Bengaluru', address: '', owner_id: '' })
  const [showAddShop, setShowAddShop] = useState(false)
  const refresh = () => {
    stats.reload()
    users.reload()
    shops.reload()
    orders.reload()
  }
  const mut = useAction(refresh)
  const partners = users.data?.filter((u) => u.role === 'partner') ?? []

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.5rem' }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--brand-light)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutDashboard size={22} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.65rem' }}>Admin Console</h1>
          <span className="muted" style={{ fontSize: '0.85rem' }}>Platform metrics, orders dispatch &amp; merchant governance</span>
        </div>
      </div>

      <ErrorText msg={stats.error || mut.error} />

      <Loading loading={stats.loading}>
        {stats.data && (
          <div className="grid stats" style={{ marginBottom: '1.75rem' }}>
            <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Receipt size={22} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Total Orders</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{stats.data.orders}</h2>
              </div>
            </div>

            <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={22} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Delivered Revenue</div>
                <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{rupees(stats.data.revenue)}</h2>
              </div>
            </div>

            <div className="card" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={22} />
              </div>
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Users (Cust/Partner/Shop)</div>
                <h2 style={{ margin: 0, fontSize: '1.35rem' }}>
                  {stats.data.users_by_role.customer ?? 0} / {stats.data.users_by_role.partner ?? 0} / {stats.data.users_by_role.shop ?? 0}
                </h2>
              </div>
            </div>
          </div>
        )}
      </Loading>

      {/* Orders Management */}
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.85rem' }}>Recent Orders &amp; Dispatch</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '2rem' }}>
        {orders.data?.slice(0, 20).map((o) => (
          <div key={o.id} className="card" style={{ margin: 0, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <Link to={`/orders/${o.id}`} style={{ fontWeight: 700, color: 'var(--brand)', fontSize: '0.95rem' }}>
                  #{o.id.slice(-6).toUpperCase()}
                </Link>
                <span className="muted"> · {o.shops?.name}</span>
                <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
                  {rupees(o.final_amount ?? o.estimated_amount)}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <Badge status={o.status} />
                <RefundForm order={o} onDone={refresh} />
                {o.status === 'placed' && partners.length > 0 && (
                  <select
                    defaultValue=""
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem', margin: 0 }}
                    onChange={(e) => e.target.value && mut.run(() => api.adminAssign(o.id, e.target.value))}
                  >
                    <option value="">Assign Partner…</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? p.phone}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Shops Management */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Merchant Laundries ({shops.data?.length ?? 0})</h2>
        <button
          type="button"
          className="secondary"
          onClick={() => setShowAddShop(!showAddShop)}
        >
          <Plus size={15} />
          <span>Add Shop</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
        {shops.data?.map((s) => (
          <div key={s.id} className="card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem' }}>
            <div>
              <strong style={{ fontSize: '0.95rem' }}>{s.name}</strong>
              <div className="muted" style={{ fontSize: '0.8rem' }}>{s.address ?? s.city}</div>
            </div>
            <button
              type="button"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
              onClick={() => mut.run(() => api.adminPatchShop(s.id, { is_active: !s.is_active }))}
            >
              {s.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ))}
      </div>

      {showAddShop && (
        <div className="card" style={{ background: 'var(--surface-subtle)', border: '1px solid var(--border)' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Onboard New Laundry Partner</h3>
          <input placeholder="Shop Name" value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} />
          <input placeholder="City (e.g. Bengaluru)" value={shop.city} onChange={(e) => setShop({ ...shop, city: e.target.value })} />
          <input placeholder="Street Address" value={shop.address} onChange={(e) => setShop({ ...shop, address: e.target.value })} />
          <select value={shop.owner_id} onChange={(e) => setShop({ ...shop, owner_id: e.target.value })}>
            <option value="">Select Shop Owner Profile (optional)…</option>
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.phone} ({u.role})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="primary"
            disabled={!shop.name || !shop.city}
            onClick={() =>
              mut.run(async () => {
                await api.adminCreateShop({ ...shop, owner_id: shop.owner_id || null })
                setShop({ name: '', city: 'Bengaluru', address: '', owner_id: '' })
                setShowAddShop(false)
              })
            }
          >
            Create Merchant Partner
          </button>
        </div>
      )}

      {/* Users Role Governance */}
      <h2 style={{ fontSize: '1.25rem', marginTop: '2rem', marginBottom: '0.85rem' }}>User Profiles &amp; Roles</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
        {users.data?.map((u) => (
          <div key={u.id} className="card" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem' }}>
            <div>
              <strong style={{ fontSize: '0.92rem' }}>{u.full_name ?? u.phone ?? `User ${u.id.slice(0, 6)}`}</strong>
              <div className="muted" style={{ fontSize: '0.78rem' }}>{u.phone}</div>
            </div>
            <select
              value={u.role}
              style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.82rem', margin: 0 }}
              onChange={(e) => mut.run(() => api.adminSetRole(u.id, e.target.value as Role))}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
