/* Demo mode: an in-browser stand-in for the API + login so the app can be explored with no
   Supabase or backend. Data persists in localStorage and is shared across the demo roles. */
import type { Role } from './api'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const DEMO = import.meta.env.VITE_DEMO === 'true' || !url || url.includes('your-project')

const ROLE_KEY = 'poshak-demo-role'
const DB_KEY = 'poshak-demo-db-v1'

const km = (a: number, b: number, c: number, d: number) => {
  const r = 6371, rad = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
const FRESH_MS = 10 * 60 * 1000

// India-time date helpers for repeat orders (dates are 'YYYY-MM-DD' strings)
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekdayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7   // 0 = Monday
const nextWeekday = (after: string, wd: number) => addDays(after, ((wd - weekdayOf(after) - 1 + 7) % 7) + 1)
const slotIso = (iso: string, hour: number) => `${iso}T${String(hour).padStart(2, '0')}:00:00+05:30`

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
interface DB { recurring: Rec[]; prefs: Record<string, Rec>; partners: Record<string, Rec>; promos: Rec[]; shops: Rec[]; services: Rec[]; addresses: Rec[]; orders: Rec[]; events: Rec[]; notifications: Rec[]; seq: number }

const sv = (id: string, shop_id: string, name: string, unit: 'kg' | 'piece', price: number, turnaround_hours: number): Rec =>
  ({ id, shop_id, name, unit, price, turnaround_hours, is_active: true })

function seed(): DB {
  const shop = (id: string, name: string, description: string, area: string, rating: number, emoji: string, tint: string, owner_id: string | null = null): Rec =>
    ({ id, name, description, address: `${area}, Bengaluru`, city: 'Bengaluru', rating, is_active: true, owner_id, emoji, tint })
  return {
    seq: 100,
    recurring: [],
    partners: {},
    prefs: {},
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
  try { const raw = localStorage.getItem(DB_KEY); if (raw) { const d = JSON.parse(raw); d.promos ??= seed().promos; d.partners ??= {}; d.prefs ??= {}; d.recurring ??= []; return d } } catch { /* ignore */ }
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
    partner_tracking: tracking(o),
  })
  const tracking = (o: Rec) => {
    const st = o.partner_id && db.partners[o.partner_id], a = db.addresses.find((x) => x.id === o.address_id)
    if (!['pickup_assigned', 'out_for_delivery'].includes(o.status) || !st || a?.lat == null || st.lat == null || Date.now() - Date.parse(st.updated_at) > FRESH_MS) return null
    const d = km(a.lat, a.lng, st.lat, st.lng)
    return { name: 'Ravi', distance_km: Math.round(d * 10) / 10, eta_minutes: Math.max(1, Math.ceil((d / 20) * 60)), heading: o.status === 'pickup_assigned' ? 'pickup' : 'delivery', updated_at: st.updated_at }
  }
  const move = (o: Rec, status: string, extra: Rec = {}) => {
    if (!FLOW[o.status].includes(status)) fail(`Cannot move from ${o.status} to ${status}`)
    Object.assign(o, extra, { status })
    if (status === 'delivered' && o.payment_method === 'cod') o.payment_status = 'paid'
    db.events.push({ id: uid(), order_id: o.id, status, created_at: now() })
    const n = STATUS_NOTE[status]; if (n) note(o.customer_id, n[0], n[1], o.id)
    return o
  }
  const activeJobs = (pid: string) => db.orders.filter((o) => o.partner_id === pid && !['delivered', 'cancelled'].includes(o.status)).length
  const autoAssign = (o: Rec) => {
    const a = db.addresses.find((x) => x.id === o.address_id)
    const st = db.partners.p1
    if (!st?.is_online || st.lat == null || a?.lat == null || Date.now() - Date.parse(st.updated_at) > FRESH_MS) return
    if ((o.declined_by ?? []).includes('p1') || activeJobs('p1') >= 3 || km(a.lat, a.lng, st.lat, st.lng) > 15) return
    o.partner_id = 'p1'; o.assigned_by = 'auto'
    move(o, 'pickup_assigned')
    note('p1', 'New pickup assigned', 'A nearby pickup was assigned to you.', o.id)
  }
  const out = (v: unknown) => { save(db); return v }
  let m: RegExpMatchArray | null

  if (path === '/me' && method === 'GET') return { id: me.id, phone: me.phone, full_name: me.full_name, role, ...(db.prefs[me.id] ?? {}) }
  if (path === '/me/preferences') { db.prefs[me.id] = { ...(db.prefs[me.id] ?? {}), ...body }; return out({ id: me.id, phone: me.phone, full_name: me.full_name, role, ...db.prefs[me.id] }) }
  if (path === '/shops') return db.shops.map((s) => ({ ...s, services: db.services.filter((v) => v.shop_id === s.id && v.is_active) }))
  if ((m = path.match(/^\/shops\/([^/]+)\/services$/))) return db.services.filter((s) => s.shop_id === m![1] && s.is_active)

  if (path === '/addresses' && method === 'GET') return db.addresses.filter((a) => a.user_id === me.id)
  if (path === '/addresses' && method === 'POST') { const a = { ...body, id: uid(), user_id: me.id }; db.addresses.push(a); return out(a) }
  if ((m = path.match(/^\/addresses\/([^/]+)$/)) && method === 'DELETE') { db.addresses = db.addresses.filter((a) => a.id !== m![1]); return out(undefined) }

  const placeOrder = (b: Rec, customerId: string): Rec => {
        const items = b.items.map((i: Rec) => ({ ...i, unit_price: find(db.services, i.service_id, 'Service').price }))
    const gross = items.reduce((s: number, i: Rec) => s + i.unit_price * i.quantity, 0)
    const applied = b.promo_code ? checkPromo(b.promo_code, gross) : null
    const o: Rec = {
      id: uid(), customer_id: customerId, partner_id: null, shop_id: b.shop_id, address_id: b.address_id, status: 'placed',
      payment_method: b.payment_method, payment_status: 'pending', pickup_slot_start: b.pickup_slot_start, pickup_slot_end: b.pickup_slot_end,
      estimated_amount: gross - (applied?.discount ?? 0), discount_amount: applied?.discount ?? 0, promo_code: applied?.promo.code ?? null, promo: applied?.promo ?? null, final_amount: null, weight_kg: null,
      rating: null, review: null, created_at: now(), items,
      refunded_amount: 0,
      order_photos: ((b.photo_paths ?? []) as string[]).map((url) => ({ id: uid(), url })),
    }
    o.declined_by = []
    db.orders.push(o); db.events.push({ id: uid(), order_id: o.id, status: 'placed', created_at: o.created_at })
    note(customerId, 'Order placed', "We're finding a pickup partner.", o.id)
    autoAssign(o)
    return o
  }
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

  if (path === '/orders' && method === 'POST') return out(view(placeOrder(body as Rec, me.id)))
  const runRecurring = () => {
    const horizon = addDays(istToday(), 1)
    for (const r of db.recurring.filter((x) => x.status === 'active' && x.customer_id === me.id && x.next_run_date <= horizon)) {
      const pickup = r.next_run_date
      r.next_run_date = addDays(pickup, r.frequency === 'biweekly' ? 14 : 7)
      if (Date.parse(slotIso(pickup, r.slot_start_hour)) < Date.now() + 30 * 60 * 1000) { r.last_error = `Missed the pickup on ${pickup}`; continue }
      try {
        const o = placeOrder({ shop_id: r.shop_id, address_id: r.address_id, payment_method: r.payment_method, items: r.items, pickup_slot_start: new Date(slotIso(pickup, r.slot_start_hour)).toISOString(), pickup_slot_end: new Date(slotIso(pickup, r.slot_end_hour)).toISOString() }, r.customer_id)
        r.last_order_id = o.id; r.last_error = null
      } catch (e) {
        r.status = 'paused'; r.last_error = (e as Error).message
        note(r.customer_id, 'Your repeat order was paused', `We couldn't schedule it: ${r.last_error}`, null)
      }
    }
  }
  if (path === '/recurring' && method === 'GET') {
    runRecurring()
    return out(db.recurring.filter((r) => r.customer_id === me.id && r.status !== 'cancelled').map((r) => ({ ...r, shops: db.shops.find((s) => s.id === r.shop_id) })).reverse())
  }
  if (path === '/recurring' && method === 'POST') {
    const b = body as Rec
    if (!db.addresses.some((a) => a.id === b.address_id && a.user_id === me.id)) fail('Unknown address')
    if (b.items.some((i: Rec) => !db.services.some((v) => v.id === i.service_id && v.shop_id === b.shop_id && v.is_active))) fail('Unknown service for this shop')
    if (db.recurring.filter((r) => r.customer_id === me.id && r.status === 'active').length >= 5) fail('You can have up to 5 active repeat orders')
    const today = istToday()
    if (b.first_pickup && b.first_pickup <= today) fail('The first pickup must be after today')
    const weekday = b.first_pickup ? weekdayOf(b.first_pickup) : b.weekday
    const r = { id: uid(), customer_id: me.id, shop_id: b.shop_id, address_id: b.address_id, items: b.items, payment_method: b.payment_method, frequency: b.frequency ?? 'weekly', weekday,
      slot_start_hour: b.slot_start_hour, slot_end_hour: b.slot_end_hour, next_run_date: b.first_pickup ?? nextWeekday(today, weekday), status: 'active', last_order_id: null, last_error: null, created_at: now() }
    db.recurring.push(r); return out(r)
  }
  if ((m = path.match(/^\/recurring\/([^/]+)$/))) {
    const r = db.recurring.find((x) => x.id === m![1] && x.customer_id === me.id) ?? fail('Repeat order not found')
    if (r.status === 'cancelled') fail("A cancelled repeat order can't be changed")
    r.status = body!.status
    if (r.status === 'active') { r.last_error = null; if (r.next_run_date <= istToday()) r.next_run_date = nextWeekday(istToday(), r.weekday) }
    return out(r)
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

  if (path === '/partner/status' && method === 'GET') return db.partners[me.id] ?? { is_online: false, lat: null, lng: null, updated_at: null }
  if (path === '/partner/status') {
    const st = { ...(db.partners[me.id] ?? { lat: null, lng: null }), is_online: !!body!.online }
    if (body!.lat != null) Object.assign(st, { lat: body!.lat, lng: body!.lng, updated_at: now() })
    db.partners[me.id] = st
    let assigned = 0
    if (st.is_online && me.id === 'p1') for (const o of db.orders.filter((x) => x.status === 'placed' && !x.partner_id)) { autoAssign(o); if (o.partner_id) assigned++ }
    return out({ ...st, assigned_now: assigned })
  }
  if (path === '/partner/location') {
    const st = db.partners[me.id] ?? { is_online: false }
    db.partners[me.id] = { ...st, lat: body!.lat, lng: body!.lng, updated_at: now() }
    return out(undefined)
  }
  if ((m = path.match(/^\/partner\/orders\/([^/]+)\/release$/))) {
    const o = find(db.orders, m[1], 'Order')
    if (o.partner_id !== me.id) fail('This order is not assigned to you')
    if (o.status !== 'pickup_assigned') fail('You can only release an order before picking it up')
    o.partner_id = null; o.assigned_by = null; o.status = 'placed'; o.declined_by = [...(o.declined_by ?? []), me.id]
    db.events.push({ id: uid(), order_id: o.id, status: 'placed', created_at: now() })
    note(o.customer_id, 'Finding you a new partner', 'Your previous partner could not make it.', o.id)
    return out(o)
  }
  if (path === '/partner/available') return db.orders.filter((o) => o.status === 'placed' && !o.partner_id).map(view)
  if (path === '/partner/mine') return db.orders.filter((o) => o.partner_id === me.id && !['delivered', 'cancelled'].includes(o.status)).map(view)
  if ((m = path.match(/^\/partner\/orders\/([^/]+)\/accept$/))) { const o = find(db.orders, m[1], 'Order'); if (o.partner_id) fail('Another partner just took this order'); o.partner_id = me.id; o.assigned_by = 'partner'; return out(move(o, 'pickup_assigned')) }
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
  if ((m = path.match(/^\/admin\/orders\/([^/]+)\/assign$/))) { const o = find(db.orders, m[1], 'Order'); o.partner_id = body!.partner_id; o.assigned_by = 'admin'; return out(move(o, 'pickup_assigned')) }
  if (path.match(/^\/admin\/users\/[^/]+\/role$/)) return profiles()[0]

  return fail(`Demo mode: ${method} ${path} is not available`)
}
