import { Repeat } from 'lucide-react'
import { api, hourLabel, WEEKDAYS, type Recurring } from '../lib/api'
import { useAction, useAsync } from '../lib/useAsync'
import { ErrorText } from './ui'

const when = (r: Recurring) => `${r.frequency === 'weekly' ? 'Every' : 'Every other'} ${WEEKDAYS[r.weekday]}, ${hourLabel(r.slot_start_hour)} – ${hourLabel(r.slot_end_hour)}`
const nextDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** Account section: the customer's repeat orders, with pause / resume / cancel. */
export default function RecurringOrders() {
  const list = useAsync(api.recurring)
  const act = useAction(() => list.reload())
  if (!list.data?.length && !list.error) return null

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <Repeat size={16} color="var(--brand)" /><h3 style={{ margin: 0 }}>Regular orders</h3>
      </div>
      <ErrorText msg={list.error || act.error} />
      {list.data?.map((r) => (
        <div key={r.id} style={{ padding: '0.7rem 0', borderTop: '1px solid var(--line)' }}>
          <div className="row">
            <div style={{ minWidth: 0 }}>
              <strong>{r.shops?.name ?? 'Laundry'}</strong>{' '}
              <span className={`badge ${r.status === 'paused' ? 'badge-cancelled' : ''}`}>{r.status === 'active' ? 'Active' : 'Paused'}</span>
              <div className="muted">{when(r)}</div>
              {r.status === 'active' && <div className="muted">Next pickup: {nextDate(r.next_run_date)}</div>}
              {r.last_error && <div className="error" style={{ margin: '0.2rem 0 0' }}>{r.last_error}</div>}
            </div>
            <div className="inline">
              <button type="button" disabled={act.busy} onClick={() => act.run(() => api.setRecurringStatus(r.id, r.status === 'active' ? 'paused' : 'active'))}>
                {r.status === 'active' ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className="danger" disabled={act.busy} onClick={() => act.run(() => api.setRecurringStatus(r.id, 'cancelled'))}>Cancel</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
