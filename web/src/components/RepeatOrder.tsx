import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Repeat } from 'lucide-react'
import { api, hourLabel, SLOT_WINDOWS, WEEKDAYS, type Order } from '../lib/api'
import { useAction } from '../lib/useAsync'
import { ErrorText } from './ui'

const weekdayOf = (iso: string) => (new Date(iso).getDay() + 6) % 7 // JS: 0 = Sunday -> ours: 0 = Monday

/** "Repeat this order every week": saves the order's items, address and payment method as a schedule. */
export default function RepeatOrder({ order }: { order: Order }) {
  const [open, setOpen] = useState(false)
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly')
  const [weekday, setWeekday] = useState(weekdayOf(order.pickup_slot_start))
  const startHour = new Date(order.pickup_slot_start).getHours()
  const [slot, setSlot] = useState(Math.max(0, SLOT_WINDOWS.findIndex(([h]) => h === startHour)))
  const [done, setDone] = useState<string | null>(null)
  const act = useAction()

  const save = () => act.run(async () => {
    const [start, end] = SLOT_WINDOWS[slot]
    const r = await api.createRecurring({
      shop_id: order.shop_id, address_id: order.address_id, payment_method: order.payment_method, frequency, weekday,
      slot_start_hour: start, slot_end_hour: end,
      items: (order.order_items ?? []).map((i) => ({ service_id: i.service_id, quantity: i.quantity })),
    })
    setDone(new Date(`${r.next_run_date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }))
  })

  if (done) {
    return (
      <section className="card">
        <strong>✅ Repeat order set up</strong>
        <p className="muted" style={{ margin: '0.25rem 0 0' }}>Your next pickup is on {done}. Manage it any time in <Link to="/account" style={{ color: 'var(--brand)', fontWeight: 700 }}>Account</Link>.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Repeat size={18} color="var(--brand)" /><h3 style={{ margin: 0 }}>Make this a regular order</h3></div>
        {!open && <button type="button" onClick={() => setOpen(true)}>Set up</button>}
      </div>
      {open && (
        <div className="form">
          <p className="muted">We'll place this same order automatically and you can pause or cancel any time.</p>
          <select aria-label="How often" value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'biweekly')}>
            <option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option>
          </select>
          <select aria-label="Pickup day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <select aria-label="Pickup time" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
            {SLOT_WINDOWS.map(([a, b], i) => <option key={a} value={i}>{hourLabel(a)} – {hourLabel(b)}</option>)}
          </select>
          <div className="inline">
            <button type="button" className="primary" disabled={act.busy} onClick={save}>{act.busy ? 'Saving…' : 'Start repeating'}</button>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <ErrorText msg={act.error} />
        </div>
      )}
    </section>
  )
}
