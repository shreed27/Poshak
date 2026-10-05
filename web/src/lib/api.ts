import { supabase } from './supabase'
import { DEMO, demoRequest, getDemoRole } from './demo'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8100'

export type Role = 'customer' | 'partner' | 'shop' | 'admin'
export type Status =
  | 'placed' | 'pickup_assigned' | 'picked_up' | 'weighed' | 'washing'
  | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled'

export interface Profile { id: string; phone: string | null; full_name: string | null; role: Role }
export interface Service { id: string; shop_id: string; name: string; unit: 'kg' | 'piece'; price: number; turnaround_hours: number; is_active: boolean }
export interface Shop { emoji?: string; tint?: string; id: string; name: string; description: string | null; address: string | null; city: string; rating: number | null; is_active?: boolean; owner_id?: string | null; services?: Service[] }
export interface Address { id: string; label: string | null; line1: string; line2: string | null; city: string; pincode: string }
export interface OrderItem { id: string; service_id: string; quantity: number; unit_price: number; services?: { name: string; unit: string } }
export interface OrderEvent { id: string; status: Status; created_at: string }
export interface Order {
  id: string; status: Status; created_at: string
  estimated_amount: number; final_amount: number | null; weight_kg: number | null
  payment_method: 'online' | 'cod'; payment_status: string; refunded_amount?: number
  pickup_slot_start: string; pickup_slot_end: string
  rating: number | null; review: string | null
  customer_id: string; partner_id: string | null; shop_id: string; address_id: string
  order_photos?: { id: string; url: string }[]
  shops?: { name: string; address?: string | null; emoji?: string; tint?: string }
  addresses?: Address
  order_items?: OrderItem[]
  order_events?: OrderEvent[]
}
export interface Notification { id: string; title: string; body: string | null; read_at: string | null; created_at: string; order_id: string | null }
export interface Stats { orders: number; by_status: Record<string, number>; revenue: number; users_by_role: Record<string, number> }

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (DEMO) {
    const role = getDemoRole()
    if (!role) throw new Error('Not signed in')
    await new Promise((r) => setTimeout(r, 120)) // feel like a network call
    return demoRequest(init.method ?? (init.json !== undefined ? 'POST' : 'GET'), path, init.json as Record<string, unknown> | undefined, role) as T
  }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const { json, ...rest } = init
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    method: rest.method ?? (json !== undefined ? 'POST' : 'GET'),
    body: json !== undefined ? JSON.stringify(json) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!res.ok) {
    let msg = `${res.status}`
    try { const b = await res.json(); msg = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail) } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const post = <T>(path: string, json: unknown = {}) => request<T>(path, { json })
const patch = <T>(path: string, json: unknown) => request<T>(path, { method: 'PATCH', json })

export const api = {
  me: () => request<Profile>('/me'),
  updateMe: (full_name: string) => patch<Profile>('/me', { full_name }),

  shops: () => request<Shop[]>('/shops'),
  shopServices: (id: string) => request<Service[]>(`/shops/${id}/services`),

  addresses: () => request<Address[]>('/addresses'),
  addAddress: (a: Omit<Address, 'id'>) => post<Address>('/addresses', a),
  deleteAddress: (id: string) => request<void>(`/addresses/${id}`, { method: 'DELETE' }),

  orders: () => request<Order[]>('/orders'),
  order: (id: string) => request<Order>(`/orders/${id}`),
  placeOrder: (body: unknown) => post<Order>('/orders', body),
  cancelOrder: (id: string) => post<Order>(`/orders/${id}/cancel`),
  rateOrder: (id: string, rating: number, review: string) => post(`/orders/${id}/rating`, { rating, review }),

  createPayment: (id: string) => post<{ key_id: string; razorpay_order_id: string; amount: number; currency: string }>(`/payments/${id}/create`),
  verifyPayment: (body: unknown) => post('/payments/verify', body),

  notifications: () => request<{ unread: number; items: Notification[] }>('/notifications'),
  readAllNotifications: () => post<void>('/notifications/read-all'),

  partnerAvailable: () => request<Order[]>('/partner/available'),
  partnerMine: () => request<Order[]>('/partner/mine'),
  partnerAccept: (id: string) => post<Order>(`/partner/orders/${id}/accept`),
  partnerWeigh: (id: string, weight_kg: number) => post<Order>(`/partner/orders/${id}/weigh`, { weight_kg }),
  partnerStatus: (id: string, status: Status) => post<Order>(`/partner/orders/${id}/status`, { status }),

  shopMe: () => request<Shop[]>('/shop/me'),
  shopOrders: () => request<Order[]>('/shop/orders'),
  shopStatus: (id: string, status: Status) => post<Order>(`/shop/orders/${id}/status`, { status }),
  addService: (s: Omit<Service, 'id' | 'is_active'>) => post<Service>('/shop/services', s),
  updateService: (id: string, s: Partial<Service>) => patch<Service>(`/shop/services/${id}`, s),

  adminStats: () => request<Stats>('/admin/stats'),
  adminOrders: () => request<Order[]>('/admin/orders'),
  adminUsers: () => request<Profile[]>('/admin/users'),
  adminSetRole: (id: string, role: Role) => patch<Profile>(`/admin/users/${id}/role`, { role }),
  adminShops: () => request<Shop[]>('/admin/shops'),
  adminCreateShop: (s: unknown) => post<Shop>('/admin/shops', s),
  adminPatchShop: (id: string, s: unknown) => patch<Shop>(`/admin/shops/${id}`, s),
  adminRefund: (orderId: string, amount: number | null, reason: string) => post(`/admin/orders/${orderId}/refund`, { amount, reason: reason || null }),
  adminAssign: (orderId: string, partner_id: string) => post<Order>(`/admin/orders/${orderId}/assign`, { partner_id }),
}

export const STATUS_LABEL: Record<Status, string> = {
  placed: 'Order placed', pickup_assigned: 'Pickup scheduled', picked_up: 'Picked up', weighed: 'Weighed',
  washing: 'Washing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled',
}
export const STATUS_FLOW: Status[] = ['placed', 'pickup_assigned', 'picked_up', 'weighed', 'washing', 'ready', 'out_for_delivery', 'delivered']
export const rupees = (n: number | null | undefined) => (n == null ? '—' : `₹${Number(n).toFixed(2).replace(/\.00$/, '')}`)
export const fmtSlot = (a: string, b: string) => {
  const s = new Date(a), e = new Date(b)
  return `${s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${s.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} – ${e.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

export const STATUS_HERO: Record<Status, { emoji: string; title: string; sub: string }> = {
  placed: { emoji: '🕒', title: 'Order placed', sub: "We're finding a pickup partner near you" },
  pickup_assigned: { emoji: '🛵', title: 'Partner assigned', sub: 'Your partner will arrive in your pickup slot' },
  picked_up: { emoji: '🧺', title: 'Clothes picked up', sub: 'On the way to the laundry' },
  weighed: { emoji: '⚖️', title: 'Clothes weighed', sub: 'Your final bill is ready' },
  washing: { emoji: '🫧', title: 'Washing in progress', sub: 'Your clothes are being cleaned' },
  ready: { emoji: '✨', title: 'Fresh and ready', sub: 'Delivery will start shortly' },
  out_for_delivery: { emoji: '🚀', title: 'Out for delivery', sub: 'Your partner is on the way' },
  delivered: { emoji: '🎉', title: 'Delivered', sub: 'Enjoy your fresh clothes!' },
  cancelled: { emoji: '✖️', title: 'Order cancelled', sub: 'This order was cancelled' },
}

export const PAYMENT_LABEL: Record<string, string> = { pending: 'Payment pending', paid: 'Paid', refunded: 'Refunded', partially_refunded: 'Partly refunded' }
