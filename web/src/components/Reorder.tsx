import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Zap } from 'lucide-react'
import { api, type Order } from '../lib/api'
import { useAction } from '../lib/useAsync'
import { ErrorText } from './ui'

export const orderSummary = (o: Order) =>
  (o.order_items ?? [])
    .map((i) => `${i.services?.name ?? 'Item'} × ${i.quantity}${i.services?.unit === 'kg' ? ' kg' : ''}`)
    .join(', ')

/** "Add to cart" opens the shop with the same items pre-filled; "Reorder" goes straight to checkout
 *  with the same items, address and payment method (using today's prices). */
export function ReorderButtons({ order }: { order: Order }) {
  const nav = useNavigate()
  const act = useAction()

  const addToCart = () =>
    nav(`/shop/${order.shop_id}`, {
      state: { cart: Object.fromEntries((order.order_items ?? []).map((i) => [i.service_id, i.quantity])) }
    })

  const reorder = () =>
    act.run(async () => {
      const services = await api.shopServices(order.shop_id)
      const items = (order.order_items ?? []).flatMap((i) => {
        const s = services.find((x) => x.id === i.service_id)
        return s ? [{ service_id: s.id, quantity: i.quantity, name: s.name, unit: s.unit, price: s.price }] : []
      })
      if (items.length === 0) throw new Error('Those services are no longer available at this laundry')
      nav('/checkout', {
        state: { shopId: order.shop_id, shopName: order.shops?.name, items, addressId: order.address_id, method: order.payment_method }
      })
    })

  return (
    <>
      <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={addToCart}
          style={{ flex: 1, padding: '0.6rem 0.85rem', fontSize: '0.88rem' }}
        >
          <ShoppingBag size={15} />
          <span>Customize</span>
        </button>
        <button
          type="button"
          className="primary"
          disabled={act.busy}
          onClick={reorder}
          style={{ flex: 1, padding: '0.6rem 0.85rem', fontSize: '0.88rem' }}
        >
          <Zap size={15} />
          <span>Quick Reorder</span>
        </button>
      </div>
      <ErrorText msg={act.error} />
    </>
  )
}
