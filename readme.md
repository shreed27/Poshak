# Poshak

On-demand laundry, Swiggy-style: order, a partner picks up, the shop washes, it comes back with live tracking. Launching in India.

## Stack
| Layer | Tech |
|---|---|
| Frontend | React + TypeScript (Vite), deployed on Vercel |
| Backend | Python + FastAPI, deployed on Vercel |
| Database / Auth | Supabase (Postgres, phone OTP login) |
| Payments | Razorpay (UPI, cards) + cash on delivery |
| Notifications | In-app, Web Push, Twilio SMS and WhatsApp |

## Layout
```
backend/    FastAPI app (app/), tests/
web/        React app (src/pages, src/lib)
supabase/   migrations/0001..0008 (schema), seed.sql
docs/       order-flow.md
.github/    CI (backend tests, web lint + build)
```

## Setup
1. Create a Supabase project. Run every file in `supabase/migrations/` in order (`0001` to `0008`; `0003` also creates the private `order-photos` storage bucket), then `supabase/seed.sql`, in the SQL editor. Enable Phone auth (needs an SMS provider such as Twilio).
2. Run everything from the repo root:
   ```
   npm install
   npm run dev
   ```
   `npm run dev` first runs `scripts/setup.sh` (creates the backend venv, installs dependencies, copies `backend/.env.example` to `backend/.env` and `web/.env.example` to `web/.env.local` if missing), then starts the API on http://localhost:8100 (docs at `/docs`) and the web app on http://localhost:3000 (or the next free port if 3000 is busy; the terminal shows the actual URL).
**Demo mode:** with no Supabase keys configured (the default after setup), the app runs entirely on sample data in your browser. No login, no backend needed. Pick a role (customer, partner, shop, admin) on the first screen and switch roles from the yellow bar to follow one order end to end. Data lives in localStorage; "Reset data" clears it. Demo mode turns off automatically once real Supabase keys are set.

3. Fill in `backend/.env` and `web/.env.local` with your Supabase keys. The login screen won't work until you do.

Other commands: `npm test` (backend tests: 110, using an in-memory Supabase fake), `npm run build` (web production build).

## Deploy (Vercel)
Create two Vercel projects from this repo: root directory `web` (frontend) and `backend` (FastAPI, entrypoint `app/main.py`). Set the env vars from the `.env.example` files, and add the frontend URL to `CORS_ORIGINS`. `backend/vercel.json` registers the daily recurring-orders cron; set `CRON_SECRET` so Vercel can authenticate to it.

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

## Payments, webhook and refunds
Customers choose **pay on delivery** (marked paid when the partner delivers) or **pay online** via Razorpay. Online payment opens once the clothes are weighed, because the final bill depends on the weight. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; the signature is verified server-side.

- **Webhook:** in the Razorpay dashboard add a webhook to `POST https://<api>/payments/webhook`, subscribe to `payment.captured`, `payment.failed`, `refund.processed` and `refund.failed`, and set the same secret as `RAZORPAY_WEBHOOK_SECRET`. It covers a customer who pays and then closes the browser before our confirm call. Handling is idempotent, so Razorpay's retries are safe.
- **Refunds:** admins can refund any paid order in full or in part (e.g. a damage claim). Online payments are refunded through Razorpay; cash orders are recorded as manual refunds. The balance is claimed with a conditional update first, so two admins cannot double-refund, and the claim is rolled back if Razorpay rejects the call.

## Promo codes
Percent or flat discounts with an optional maximum discount, minimum order, first-order-only rule, total and per-customer usage limits and start/end dates. Customers enter a code at checkout; admins create and deactivate codes in the Admin screen. The promo is snapshotted on the order and re-applied to the real weighed total, so the final bill stays correct. `seed.sql` adds two sample codes (`WELCOME20`, `FLAT50`).

## Automatic partner assignment and tracking
Partners switch **online** in the app and share their location every 30 seconds. A new order goes to the nearest eligible partner: online, a location fresher than 10 minutes, within 15 km of the pickup address, and under 3 active jobs (each active job counts as 1.5 km extra distance). Orders placed while nobody is online are assigned as soon as a partner comes online. A partner can release an assigned pickup, and it is reassigned without handing it back to them. Customers see the partner's distance and ETA, never coordinates. Addresses need coordinates for this: the checkout has a "Use my current location" button. Without coordinates the order simply waits for a partner to accept it manually. Tuning constants are at the top of `backend/app/services/dispatch.py`.

## Notifications
Every status change writes an in-app notification (bell icon). Important ones (pickup scheduled, weighed, out for delivery, delivered, cancelled, refunds and new partner assignments) can also go out through external channels, controlled per user in **Account → Notifications**. Each channel is optional and skipped when not configured; a failure in one never affects the others or the order update.

| Channel | Setup |
|---|---|
| Web Push | Generate keys with `npx web-push generate-vapid-keys`; set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:`). The service worker is `web/public/sw.js`. |
| WhatsApp | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`. Note: outside WhatsApp's 24-hour customer window, production sends need pre-approved message templates. The sandbox works for testing. |
| SMS | Set `TWILIO_SMS_FROM` as well. Off by default per user to limit cost. |

## Repeat orders
A customer can turn any order into a regular one (every week or every 2 weeks, on a chosen day and slot) from the order page, and pause, resume or cancel it in **Account**. A daily cron (`GET /cron/recurring`, secured by `CRON_SECRET`) places each order the day before pickup through the same code path as a manual order, so it also gets auto-assigned. Each run is claimed atomically, so a retried cron cannot create duplicates; if the laundry has removed a service the schedule pauses and the customer is notified. Dates and slots use India time.

## Roadmap
- [x] Schema, order state machine, OTP login
- [x] Customer ordering flow, tracking, cancel, ratings
- [x] Partner app and shop dashboard
- [x] Razorpay payments (online + COD), webhook, refunds
- [x] In-app, Web Push, WhatsApp and SMS notifications
- [x] Admin panel, promo codes
- [x] Automatic partner assignment by distance, live partner distance/ETA
- [x] Repeat orders (subscriptions)
- [ ] Paid plans (a subscription fee with included kilograms or discounts)
- [ ] A map view of the partner (today it shows distance and ETA only)
- [ ] Browser-based end-to-end tests in CI
