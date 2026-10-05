import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, ArrowRight } from 'lucide-react'
import { api, rupees, type Order } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { ReorderButtons, orderSummary } from '../../components/Reorder'
import { Badge, Empty, ErrorText, Loading, ShopTile } from '../../components/ui'

export default function Orders() {
  const { data, error, loading } = useAsync(api.orders)
  const [tab, setTab] = useState<'active' | 'past'>('active')

  const activeOrders = (data ?? []).filter((o) => !['delivered', 'cancelled'].includes(o.status))
  const pastOrders = (data ?? []).filter((o) => ['delivered', 'cancelled'].includes(o.status))
  const displayOrders = tab === 'active' ? activeOrders : pastOrders

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0 }}>My Orders</h1>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {(data?.length ?? 0)} total
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--surface-subtle)', padding: '0.3rem', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem' }}>
        <button
          type="button"
          style={{
            flex: 1,
            border: 0,
            background: tab === 'active' ? '#fff' : 'transparent',
            color: tab === 'active' ? 'var(--brand)' : 'var(--text-secondary)',
            fontWeight: tab === 'active' ? 700 : 500,
            boxShadow: tab === 'active' ? 'var(--shadow-xs)' : 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.55rem'
          }}
          onClick={() => setTab('active')}
        >
          Active ({activeOrders.length})
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            border: 0,
            background: tab === 'past' ? '#fff' : 'transparent',
            color: tab === 'past' ? 'var(--brand)' : 'var(--text-secondary)',
            fontWeight: tab === 'past' ? 700 : 500,
            boxShadow: tab === 'past' ? 'var(--shadow-xs)' : 'none',
            borderRadius: 'var(--radius-md)',
            padding: '0.55rem'
          }}
          onClick={() => setTab('past')}
        >
          History ({pastOrders.length})
        </button>
      </div>

      <ErrorText msg={error} />

      <Loading loading={loading}>
        {displayOrders.length === 0 && (
          <Empty
            icon={Receipt}
            action={
              <Link to="/" style={{ display: 'inline-flex', padding: '0.65rem 1.25rem', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', fontWeight: 700 }}>
                Explore Laundries
              </Link>
            }
          >
            {tab === 'active'
              ? 'No active orders in progress right now.'
              : 'You have no past orders yet.'}
          </Empty>
        )}

        {displayOrders.map((o: Order) => (
          <div key={o.id} className="card card-interactive" style={{ marginBottom: '1rem' }}>
            <Link to={`/orders/${o.id}`} style={{ display: 'block' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <ShopTile shop={o.shops ?? {}} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                      {o.shops?.name}
                    </div>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: '0.1rem' }}>
                      {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · #{o.id.slice(-6).toUpperCase()}
                    </div>
                  </div>
                </div>
                <Badge status={o.status} />
              </div>

              <div style={{ background: 'var(--surface-subtle)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '0.65rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{orderSummary(o)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.4rem' }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>
                  {rupees(o.final_amount ?? o.estimated_amount)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--brand)', fontWeight: 600, fontSize: '0.88rem' }}>
                  <span>{['delivered', 'cancelled'].includes(o.status) ? 'View Receipt' : 'Live Tracking'}</span>
                  <ArrowRight size={15} />
                </div>
              </div>
            </Link>

            {['delivered', 'cancelled'].includes(o.status) && (
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.4rem' }}>
                <ReorderButtons order={o} />
              </div>
            )}
          </div>
        ))}
      </Loading>
    </div>
  )
}
