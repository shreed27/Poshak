# Poshak

On-demand laundry, Swiggy-style: order, a partner picks up, the shop washes, it comes back with live tracking. Launching in India.

## Stack
| Layer | Tech |
|---|---|
| Frontend | React + TypeScript (Vite), deployed on Vercel |
| Backend | Python + FastAPI, deployed on Vercel |
| Database / Auth | Supabase (Postgres, phone OTP login) |
| Payments (planned) | Razorpay (UPI, cards, COD) |

## Layout
```
backend/    FastAPI app (app/), tests/
web/        React app (src/pages, src/lib)
supabase/   migrations/0001_init.sql, 0002_payments_notifications_ratings.sql, seed.sql
docs/       order-flow.md
```

## Setup
1. Create a Supabase project. Run `supabase/migrations/0001_init.sql`, `0002_payments_notifications_ratings.sql`, `0003_order_photos.sql` (creates the private `order-photos` storage bucket), then `supabase/seed.sql` in the SQL editor. Enable Phone auth (needs an SMS provider such as Twilio).
2. Run everything from the repo root:
   ```
   npm install
   npm run dev
   ```
   `npm run dev` first runs `scripts/setup.sh` (creates the backend venv, installs dependencies, copies `backend/.env.example` to `backend/.env` and `web/.env.example` to `web/.env.local` if missing), then starts the API on http://localhost:8100 (docs at `/docs`) and the web app on http://localhost:3000 (or the next free port if 3000 is busy; the terminal shows the actual URL).
**Demo mode:** with no Supabase keys configured (the default after setup), the app runs entirely on sample data in your browser. No login, no backend needed. Pick a role (customer, partner, shop, admin) on the first screen and switch roles from the yellow bar to follow one order end to end. Data lives in localStorage; "Reset data" clears it. Demo mode turns off automatically once real Supabase keys are set.

3. Fill in `backend/.env` and `web/.env.local` with your Supabase keys. The login screen won't work until you do.

Other commands: `npm test` (backend tests), `npm run build` (web production build).

## Deploy (Vercel)
Create two Vercel projects from this repo: root directory `web` (frontend) and `backend` (FastAPI, entrypoint `app/main.py`). Set the env vars from the `.env.example` files, and add the frontend URL to `CORS_ORIGINS`.

## Roles and screens
| Role | Screens |
|---|---|
| `customer` | Browse shops, cart, checkout (address, slot, payment), live order tracking, pay online, cancel, rate |
| `partner` | Accept pickups, mark picked up, enter weight (sets the final bill), deliver, collect cash |
| `shop` | Orders by stage (start washing, mark ready), manage menu and prices |
| `admin` | Stats, all orders, assign partners, create/activate shops, change user roles |

Roles live in `profiles.role` and take effect immediately. Everyone signs up as `customer`. Make the first admin in the SQL editor:
```sql
update profiles set role = 'admin' where phone = '91XXXXXXXXXX';
```
Then promote partners and shop owners from the Admin screen.

## Photos and reordering
- **Clothes photos:** at checkout the customer can take photos (opens the camera on phones) or upload up to 6. They are resized in the browser, uploaded straight to a private Supabase Storage bucket under the customer's own folder, and shown to the customer, the assigned partner and the shop through short-lived signed URLs.
- **Order again:** once a customer has an order, the home page shows an *Order again* card, and past orders have two buttons. **Add to cart** opens the shop with the same items pre-filled. **Reorder** goes to checkout with the same items, address and payment method, at today's prices, and skips services the shop no longer offers.

## Payments
Customers choose **pay on delivery** (marked paid when the partner delivers) or **pay online** via Razorpay. Online payment opens once the clothes are weighed, because the final bill depends on the weight. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the backend; the signature is verified server-side.

## Notifications
Every status change writes an in-app notification (bell icon, polled every 20s). `backend/app/services/notify.py` is the single place to add push, WhatsApp or SMS senders.

## Roadmap
- [x] Schema, order state machine, OTP login
- [x] Customer ordering flow, tracking, cancel, ratings
- [x] Partner app and shop dashboard
- [x] Razorpay payments (online + COD)
- [x] In-app notifications
- [x] Admin panel
- [ ] Push / WhatsApp / SMS delivery
- [ ] Razorpay webhook (covers the case where the browser closes mid-payment)
- [ ] Automatic partner assignment by distance, live partner location
- [ ] Refunds, promo codes, subscriptions
