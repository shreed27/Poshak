/* Demo mode: an in-browser stand-in for the API + login so the app can be explored with no
   Supabase or backend. Data persists in localStorage and is shared across the demo roles. */
import type { Role } from './api'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const DEMO = import.meta.env.VITE_DEMO === 'true' || !url || url.includes('your-project')

const ROLE_KEY = 'poshak-demo-role'
const DB_KEY = 'poshak-demo-db-v1'

const discountFor = (p: Rec, subtotal: number) => {
  const d = p.kind === 'percent' ? Math.min((subtotal * p.value) / 100, p.max_discount ?? Infinity) : p.value
  return Math.round(Math.max(0, Math.min(d, subtotal)) * 100) / 100
}

export const DEMO_USERS: Record<Role, { id: string; full_name: string; phone: string }> = {
  customer: { id: 'c1', full_name: 'Aarav Sharma', phone: '+919876500001' },
  partner: { id: 'p1', full_name: 'Ravi Kumar', phone: '+919876500002' },
  shop: { id: 's1', full_name: 'Meera (Fresh Fold)', phone: '+919876500003' },
  admin: { id: 'a1', full_name: 'Poshak Admin', phone: '+919876500004' },
}

export const getDemoRole = (): Role | null => {
  try { return localStorage.getItem(ROLE_KEY) as Role | null } catch { return null }
}
export const setDemoRole = (r: Role | null) => {
  try { r ? localStorage.setItem(ROLE_KEY, r) : localStorage.removeItem(ROLE_KEY) } catch { /* ignore */ }
}
export const resetDemo = () => { try { localStorage.removeItem(DB_KEY) } catch { /* ignore */ } }

type Rec = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
interface DB { promos: Rec[]; shops: Rec[]; services: Rec[]; addresses: Rec[]; orders: Rec[]; events: Rec[]; notifications: Rec[]; seq: number }

const sv = (id: string, shop_id: string, name: string, unit: 'kg' | 'piece', price: number, turnaround_hours: number): Rec =>
  ({ id, shop_id, name, unit, price, turnaround_hours, is_active: true })

function seed(): DB {
  const shop = (id: string, name: string, description: string, area: string, rating: number, emoji: string, tint: string, owner_id: string | null = null): Rec =>
    ({ id, name, description, address: `${area}, Bengaluru`, city: 'Bengaluru', rating, is_active: true, owner_id, emoji, tint })
  return {
    seq: 100,
    promos: [
      { code: 'WELCOME20', description: '20% off your first order (up to ₹100)', kind: 'percent', value: 20, max_discount: 100, min_order: 100, first_order_only: true, usage_limit: null, per_user_limit: 1, is_active: true },
      { code: 'FLAT50', description: '₹50 off orders above ₹300', kind: 'flat', value: 50, max_discount: null, min_order: 300, first_order_only: false, usage_limit: null, per_user_limit: 5, is_active: true },
    ],
    shops: [
      shop('sh1', 'Fresh Fold Laundry', 'Everyday wash, fold & iron', 'Indiranagar', 4.6, '🧺', 'orange', 's1'),
      shop('sh2', 'Sparkle Dry Cleaners', 'Premium dry cleaning & garment care', 'Koramangala', 4.4, '👔', 'blue'),
      shop('sh3', 'Bubble & Press', 'Quick iron and steam press', 'HSR Layout', 4.2, '♨️', 'pink'),
      shop('sh4', 'Quick Wash Express', '24-hour express turnaround', 'Whitefield', 3.9, '⚡', 'yellow'),
      shop('sh5', 'Royal Dry Clean', 'Sarees, suits and delicate fabrics', 'Jayanagar', 4.7, '👑', 'purple'),
      shop('sh6', 'Eco Wash Co.', 'Eco-friendly detergents, gentle on fabric', 'JP Nagar', 4.5, '🌿', 'green'),
    ],
    services: [
      sv('v1', 'sh1', 'Wash & Fold', 'kg', 70, 48), sv('v2', 'sh1', 'Wash & Iron', 'kg', 95, 48), sv('v3', 'sh1', 'Iron', 'piece', 12, 24),
      sv('v4', 'sh1', 'Dry Clean', 'piece', 120, 72), sv('v5', 'sh1', 'Shoe Cleaning', 'piece', 250, 72),
      sv('v6', 'sh2', 'Dry Clean', 'piece', 150, 72), sv('v7', 'sh2', 'Suit Dry Clean', 'piece', 450, 96), sv('v8', 'sh2', 'Iron', 'piece', 15, 24),
      sv('v9', 'sh2', 'Curtains', 'piece', 220, 96), sv('v10', 'sh2', 'Bedding', 'piece', 300, 72),
      sv('v11', 'sh3', 'Iron', 'piece', 10, 12), sv('v12', 'sh3', 'Wash & Iron', 'kg', 90, 48), sv('v13', 'sh3', 'Wash & Fold', 'kg', 65, 48),
      sv('v14', 'sh4', 'Wash & Fold', 'kg', 85, 24), sv('v15', 'sh4', 'Wash & Iron', 'kg', 110, 24), sv('v16', 'sh4', 'Iron', 'piece', 14, 12),
      sv('v17', 'sh5', 'Saree Dry Clean', 'piece', 350, 96), sv('v18', 'sh5', 'Dry Clean', 'piece', 180, 72), sv('v19', 'sh5', 'Curtains', 'piece', 250, 96),
      sv('v20', 'sh5', 'Bedding', 'piece', 350, 96), sv('v21', 'sh5', 'Shoe Cleaning', 'piece', 300, 72),
      sv('v22', 'sh6', 'Wash & Fold', 'kg', 75, 48), sv('v23', 'sh6', 'Wash & Iron', 'kg', 100, 48), sv('v24', 'sh6', 'Bedding', 'piece', 280, 72),
    ],
    addresses: [
      { id: 'addr1', user_id: 'c1', label: 'Home', line1: 'Flat 402, Green Glen Apts, 12th Main', line2: 'Near Indiranagar Club', city: 'Bengaluru', pincode: '560038' },
      { id: 'addr2', user_id: 'c1', label: 'Office', line1: 'WeWork Galaxy, 43 Residency Rd', line2: 'Ashok Nagar', city: 'Bengaluru', pincode: '560025' },
    ],
    orders: [
      {
        id: 'ord-101',
        shop_id: 'sh1',
        customer_id: 'c1',
        partner_id: 'p1',
        address_id: 'addr1',
        status: 'delivered',
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        estimated_amount: 280,
        final_amount: 310,
        weight_kg: 3.2,
        payment_method: 'online',
        payment_status: 'paid',
        pickup_slot_start: new Date(Date.now() - 3 * 86400000).toISOString(),
        pickup_slot_end: new Date(Date.now() - 3 * 86400000 + 7200000).toISOString(),
        rating: 5,
        review: 'Super clean clothes and neatly folded! Quick turnaround.',
        items: [{ service_id: 'v1', quantity: 3 }],
        photo_paths: [],
      }
    ],
    events: [
      { id: 'ev1', order_id: 'ord-101', status: 'placed', created_at: new Date(Date.now() - 3 * 86400000).toISOString() },
      { id: 'ev2', order_id: 'ord-101', status: 'pickup_assigned', created_at: new Date(Date.now() - 3 * 86400000 + 600000).toISOString() },
      { id: 'ev3', order_id: 'ord-101', status: 'picked_up', created_at: new Date(Date.now() - 3 * 86400000 + 1800000).toISOString() },
      { id: 'ev4', order_id: 'ord-101', status: 'weighed', created_at: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString() },
      { id: 'ev5', order_id: 'ord-101', status: 'washing', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: 'ev6', order_id: 'ord-101', status: 'ready', created_at: new Date(Date.now() - 1 * 86400000).toISOString() },
      { id: 'ev7', order_id: 'ord-101', status: 'out_for_delivery', created_at: new Date(Date.now() - 1 * 86400000 + 3600000).toISOString() },
      { id: 'ev8', order_id: 'ord-101', status: 'delivered', created_at: new Date(Date.now() - 1 * 86400000 + 7200000).toISOString() },
    ],
    notifications: [
      { id: 'nt1', user_id: 'c1', order_id: 'ord-101', title: 'Order Delivered 🎉', body: 'Your fresh clothes have been delivered. Enjoy!', read_at: null, created_at: new Date().toISOString() }
    ],
  }
}

function load(): DB {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const d = JSON.parse(raw); d.promos ??= seed().promos; return d } } catch { /* ignore */ }
  return seed()
}
const save = (db: DB) => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)) } catch { /* ignore */ } }

const FLOW: Record<string, string[]> = {
  placed: ['pickup_assigned', 'cancelled'], pickup_assigned: ['picked_up', 'cancelled'], picked_up: ['weighed'], weighed: ['washing'],
  washing: ['ready'], ready: ['out_for_delivery'], out_for_delivery: ['delivered'], delivered: [], cancelled: [],
}
const STATUS_NOTE: Record<string, [string, string]> = {
  pickup_assigned: ['Pickup scheduled', 'A partner has been assigned to collect your clothes.'],
  picked_up: ['Clothes picked up', 'We have your clothes and are heading to the shop.'],
  weighed: ['Clothes weighed', 'Your final bill is ready.'],
  washing: ['Washing started', 'Your clothes are being cleaned.'],
  ready: ['Clothes are ready', 'Your order will be out for delivery shortly.'],
  out_for_delivery: ['Out for delivery', 'Your partner is on the way.'],
  delivered: ['Delivered', 'Enjoy your fresh clothes! Rate your order.'],
  cancelled: ['Order cancelled', 'Your order was cancelled.'],
}

class DemoError extends Error {}
const fail = (msg: string): never => { throw new DemoError(msg) }

export function demoRequest(method: string, path: string, body: Rec | undefined, role: Role): unknown {
  const db = load()
  const me = DEMO_USERS[role]
  const now = () => new Date().toISOString()
  const uid = () => `${++db.seq}`.padStart(8, '0')
  const note = (user_id: string, title: string, text: string | null, order_id: string | null) =>
    db.notifications.unshift({ id: uid(), user_id, order_id, title, body: text, read_at: null, created_at: now() })
  const find = (list: Rec[], id: string, what: string): Rec => list.find((x) => x.id === id) ?? fail(`${what} not found`)
  const view = (o: Rec): Rec => ({
    ...o, shops: db.shops.find((s) => s.id === o.shop_id), addresses: db.addresses.find((a) => a.id === o.address_id),
    order_items: o.items.map((i: Rec, n: number) => ({ ...i, id: `${o.id}-${n}`, services: db.services.find((s) => s.id === i.service_id) })),
    order_events: db.events.filter((e) => e.order_id === o.id),
  })
  const move = (o: Rec, status: string, extra: Rec = {}) => {
    if (!FLOW[o.status].includes(status)) fail(`Cannot move from ${o.status} to ${status}`)
    Object.assign(o, extra, { status })
    if (status === 'delivered' && o.payment_method === 'cod') o.payment_status = 'paid'
    db.events.push({ id: uid(), order_id: o.id, status, created_at: now() })
    const n = STATUS_NOTE[status]; if (n) note(o.customer_id, n[0], n[1], o.id)
    return o
  }
  const out = (v: unknown) => { save(db); return v }
  let m: RegExpMatchArray | null

  if (path === '/me' && method === 'GET') return { id: me.id, phone: me.phone, full_name: me.full_name, role }
  if (path === '/shops') return db.shops.map((s) => ({ ...s, services: db.services.filter((v) => v.shop_id === s.id && v.is_active) }))
  if ((m = path.match(/^\/shops\/([^/]+)\/services$/))) return db.services.filter((s) => s.shop_id === m![1] && s.is_active)

  if (path === '/addresses' && method === 'GET') return db.addresses.filter((a) => a.user_id === me.id)
  if (path === '/addresses' && method === 'POST') { const a = { ...body, id: uid(), user_id: me.id }; db.addresses.push(a); return out(a) }
  if ((m = path.match(/^\/addresses\/([^/]+)$/)) && method === 'DELETE') { db.addresses = db.addresses.filter((a) => a.id !== m![1]); return out(undefined) }

  const checkPromo = (code: string, subtotal: number): { promo: Rec; discount: number } => {
    const promo = db.promos.find((p) => p.code === code.trim().toUpperCase() && p.is_active) ?? fail('This promo code is not valid')
    if (subtotal < promo.min_order) fail(`Add items worth ₹${promo.min_order} or more to use this code`)
    const mine = db.orders.filter((o) => o.customer_id === me.id && o.status !== 'cancelled')
    if (mine.filter((o) => o.promo_code === promo.code).length >= promo.per_user_limit) fail('You have already used this promo code')
    if (promo.first_order_only && mine.length > 0) fail('This promo code is only for your first order')
    return { promo, discount: discountFor(promo, subtotal) }
  }
  if (path === '/promos/validate') {
    const { promo, discount } = checkPromo(body!.code, Number(body!.subtotal))
    return { code: promo.code, description: promo.description, discount, total: Number(body!.subtotal) - discount }
  }
  if (path === '/admin/promos' && method === 'GET') return db.promos.map((p) => ({ ...p, redemptions: db.orders.filter((o) => o.promo_code === p.code && o.status !== 'cancelled').length }))
  if (path === '/admin/promos' && method === 'POST') { const p = { ...body, code: String(body!.code).toUpperCase(), is_active: true }; if (db.promos.some((x) => x.code === p.code)) fail('That promo code already exists'); db.promos.push(p); return out(p) }
  if ((m = path.match(/^\/admin\/promos\/([^/]+)$/))) { const p = find(db.promos.map((x) => ({ ...x, id: x.code })), m[1].toUpperCase(), 'Promo'); Object.assign(db.promos.find((x) => x.code === p.id)!, body); return out(db.promos.find((x) => x.code === p.id)) }

  if (path === '/orders' && method === 'POST') {
    const b = body as Rec
    const items = b.items.map((i: Rec) => ({ ...i, unit_price: find(db.services, i.service_id, 'Service').price }))
    const gross = items.reduce((s: number, i: Rec) => s + i.unit_price * i.quantity, 0)
    const applied = b.promo_code ? checkPromo(b.promo_code, gross) : null
    const o: Rec = {
      id: uid(), customer_id: me.id, partner_id: null, shop_id: b.shop_id, address_id: b.address_id, status: 'placed',
      payment_method: b.payment_method, payment_status: 'pending', pickup_slot_start: b.pickup_slot_start, pickup_slot_end: b.pickup_slot_end,
      estimated_amount: gross - (applied?.discount ?? 0), discount_amount: applied?.discount ?? 0, promo_code: applied?.promo.code ?? null, promo: applied?.promo ?? null, final_amount: null, weight_kg: null,
      rating: null, review: null, created_at: now(), items,
      refunded_amount: 0,
      order_photos: ((b.photo_paths ?? []) as string[]).map((url) => ({ id: uid(), url })),
    }
    db.orders.push(o); db.events.push({ id: uid(), order_id: o.id, status: 'placed', created_at: o.created_at })
    note(me.id, 'Order placed', "We're finding a pickup partner.", o.id)
    return out(o)
  }
  if (path === '/orders') return db.orders.filter((o) => o.customer_id === me.id).map(view).reverse()
  if ((m = path.match(/^\/orders\/([^/]+)$/))) return view(find(db.orders, m[1], 'Order'))
  if ((m = path.match(/^\/orders\/([^/]+)\/cancel$/))) return out(move(find(db.orders, m[1], 'Order'), 'cancelled'))
  if ((m = path.match(/^\/orders\/([^/]+)\/rating$/))) {
    const o = find(db.orders, m[1], 'Order'); if (o.status !== 'delivered') fail('You can rate an order after it is delivered')
    o.rating = body!.rating; o.review = body!.review; return out({ rating: o.rating })
  }
  if ((m = path.match(/^\/payments\/([^/]+)\/create$/))) return fail('Online payments are not available in demo mode. Choose Pay on delivery.')

  if (path === '/notifications' && method === 'GET') {
    const items = db.notifications.filter((n) => n.user_id === me.id)
    return { unread: items.filter((n) => !n.read_at).length, items }
  }
  if (path === '/notifications/read-all') { db.notifications.filter((n) => n.user_id === me.id).forEach((n) => (n.read_at = now())); return out(undefined) }

  if (path === '/partner/available') return db.orders.filter((o) => o.status === 'placed' && !o.partner_id).map(view)
  if (path === '/partner/mine') return db.orders.filter((o) => o.partner_id === me.id && !['delivered', 'cancelled'].includes(o.status)).map(view)
  if ((m = path.match(/^\/partner\/orders\/([^/]+)\/accept$/))) { const o = find(db.orders, m[1], 'Order'); if (o.partner_id) fail('Another partner just took this order'); o.partner_id = me.id; return out(move(o, 'pickup_assigned')) }
  if ((m = path.match(/^\/partner\/orders\/([^/]+)\/weigh$/))) {
    const o = find(db.orders, m[1], 'Order'); if (o.status !== 'picked_up') fail('Mark the order as picked up before weighing')
    const kg = Number(body!.weight_kg)
    const gross = o.items.reduce((s: number, i: Rec) => { const unit = find(db.services, i.service_id, 'Service').unit; return s + i.unit_price * (unit === 'kg' ? kg : i.quantity) }, 0)
    const discount = o.promo ? discountFor(o.promo, gross) : 0
    return out(move(o, 'weighed', { weight_kg: kg, final_amount: Math.round((gross - discount) * 100) / 100, discount_amount: discount }))
  }
  if ((m = path.match(/^\/(partner|shop)\/orders\/([^/]+)\/status$/))) return out(move(find(db.orders, m[2], 'Order'), body!.status))

  if (path === '/shop/me') return db.shops.filter((s) => s.owner_id === me.id || role === 'admin').map((s) => ({ ...s, services: db.services.filter((v) => v.shop_id === s.id) }))
  if (path === '/shop/orders') return db.orders.filter((o) => role === 'admin' || db.shops.find((s) => s.id === o.shop_id)?.owner_id === me.id).map(view).reverse()
  if (path === '/shop/services' && method === 'POST') { const s = { ...body, id: uid(), is_active: true }; db.services.push(s); return out(s) }
  if ((m = path.match(/^\/shop\/services\/([^/]+)$/))) { const s = find(db.services, m[1], 'Service'); Object.assign(s, body); return out(s) }

  const profiles = () => (Object.keys(DEMO_USERS) as Role[]).map((r) => ({ ...DEMO_USERS[r], role: r }))
  if (path === '/admin/stats') {
    const by_status: Record<string, number> = {}; db.orders.forEach((o) => (by_status[o.status] = (by_status[o.status] ?? 0) + 1))
    const revenue = db.orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + Number(o.final_amount ?? o.estimated_amount), 0)
    return { orders: db.orders.length, by_status, revenue, users_by_role: { customer: 1, partner: 1, shop: 1, admin: 1 } }
  }
  if (path === '/admin/orders') return db.orders.map(view).reverse()
  if (path === '/admin/users') return profiles()
  if (path === '/admin/shops' && method === 'GET') return db.shops
  if (path === '/admin/shops' && method === 'POST') { const s = { ...body, id: uid(), is_active: true, rating: null, emoji: '🧺', tint: 'orange' }; db.shops.push(s); return out(s) }
  if ((m = path.match(/^\/admin\/shops\/([^/]+)$/))) { const s = find(db.shops, m[1], 'Shop'); Object.assign(s, body); return out(s) }
  if ((m = path.match(/^\/admin\/orders\/([^/]+)\/refund$/))) {
    const o = find(db.orders, m[1], 'Order')
    if (!['paid', 'partially_refunded'].includes(o.payment_status)) fail('Only paid orders can be refunded')
    const total = Number(o.final_amount ?? o.estimated_amount), left = total - Number(o.refunded_amount ?? 0)
    const amt = body!.amount == null ? left : Number(body!.amount)
    if (amt <= 0 || amt > left) fail(`Refund exceeds the remaining balance of ₹${left}`)
    o.refunded_amount = Number(o.refunded_amount ?? 0) + amt
    o.payment_status = o.refunded_amount >= total ? 'refunded' : 'partially_refunded'
    note(o.customer_id, 'Refund initiated', `₹${amt} will be returned to you.`, o.id)
    return out({ id: uid(), order_id: o.id, amount: amt, status: 'manual' })
  }
  if ((m = path.match(/^\/admin\/orders\/([^/]+)\/assign$/))) { const o = find(db.orders, m[1], 'Order'); o.partner_id = body!.partner_id; return out(move(o, 'pickup_assigned')) }
  if (path.match(/^\/admin\/users\/[^/]+\/role$/)) return profiles()[0]

  return fail(`Demo mode: ${method} ${path} is not available`)
}
