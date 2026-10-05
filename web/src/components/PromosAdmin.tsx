import { useState } from 'react'
import { api, rupees, type Promo } from '../lib/api'
import { useAction, useAsync } from '../lib/useAsync'
import { ErrorText } from './ui'

const blank = { code: '', description: '', kind: 'percent' as 'percent' | 'flat', value: '', max_discount: '', min_order: '', usage_limit: '', first_order_only: false }

const describe = (p: Promo) =>
  `${p.kind === 'percent' ? `${p.value}% off${p.max_discount ? ` (up to ${rupees(p.max_discount)})` : ''}` : `${rupees(p.value)} off`}` +
  `${p.min_order > 0 ? ` · min ${rupees(p.min_order)}` : ''}${p.first_order_only ? ' · first order' : ''}${p.usage_limit ? ` · limit ${p.usage_limit}` : ''}`

/** Admin: list, create and switch off promo codes. */
export default function PromosAdmin() {
  const promos = useAsync(api.adminPromos)
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)
  const act = useAction(() => promos.reload())
  const create = useAction(() => { setF(blank); setOpen(false); promos.reload() })

  const submit = () => create.run(() => api.adminCreatePromo({
    code: f.code.trim(), description: f.description || null, kind: f.kind, value: Number(f.value),
    max_discount: f.max_discount ? Number(f.max_discount) : null, min_order: f.min_order ? Number(f.min_order) : 0,
    usage_limit: f.usage_limit ? Number(f.usage_limit) : null, first_order_only: f.first_order_only,
  }))

  return (
    <section style={{ marginBottom: '2rem' }}>
      <div className="row" style={{ marginBottom: '.85rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Promo codes ({promos.data?.length ?? 0})</h2>
        <button type="button" onClick={() => setOpen(!open)}>{open ? 'Close' : '+ New promo'}</button>
      </div>
      <ErrorText msg={promos.error || act.error} />

      {open && (
        <div className="card form">
          <input placeholder="Code (e.g. SUMMER25)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} maxLength={40} />
          <input placeholder="Description shown to customers" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={200} />
          <div className="inline" style={{ width: '100%' }}>
            <select style={{ flex: 1 }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as 'percent' | 'flat' })}>
              <option value="percent">Percent off</option><option value="flat">Flat ₹ off</option>
            </select>
            <input style={{ flex: 1 }} type="number" min="1" placeholder={f.kind === 'percent' ? 'Percent (1-100)' : 'Amount ₹'} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </div>
          <div className="inline" style={{ width: '100%' }}>
            {f.kind === 'percent' && <input style={{ flex: 1 }} type="number" min="1" placeholder="Max discount ₹ (optional)" value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} />}
            <input style={{ flex: 1 }} type="number" min="0" placeholder="Minimum order ₹" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} />
            <input style={{ flex: 1 }} type="number" min="1" placeholder="Total uses (blank = unlimited)" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} />
          </div>
          <label className="radio"><input type="checkbox" checked={f.first_order_only} onChange={(e) => setF({ ...f, first_order_only: e.target.checked })} /> First order only</label>
          <button className="primary" disabled={create.busy || f.code.trim().length < 3 || !(Number(f.value) > 0)} onClick={submit}>Create promo</button>
          <ErrorText msg={create.error} />
        </div>
      )}

      {promos.data?.map((p) => (
        <div key={p.code} className="card row" style={{ margin: '0 0 .6rem' }}>
          <div style={{ minWidth: 0 }}>
            <strong className={p.is_active ? '' : 'muted'}>{p.code}</strong> <span className="muted">· {p.redemptions ?? 0} used</span>
            <div className="muted">{describe(p)}</div>
          </div>
          <button type="button" onClick={() => act.run(() => api.adminPatchPromo(p.code, { is_active: !p.is_active }))}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
        </div>
      ))}
    </section>
  )
}
