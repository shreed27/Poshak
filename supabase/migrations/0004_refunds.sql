-- Refunds against delivered/paid orders (e.g. damage claims). Online payments are refunded through
-- Razorpay; cash-on-delivery refunds are recorded as 'manual' (the admin returns the cash).
alter table orders add column refunded_amount numeric(10,2) not null default 0;

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  payment_id uuid references payments(id),
  amount numeric(10,2) not null check (amount > 0),
  reason text,
  status text not null default 'pending',     -- pending | processed | manual | failed
  razorpay_refund_id text unique,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on refunds (order_id);

alter table refunds enable row level security;
create policy "own refunds" on refunds for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
