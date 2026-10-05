-- Repeat orders ("subscriptions"): a saved order that is placed automatically every week / fortnight.
-- A daily cron (GET /cron/recurring) turns due schedules into real orders the day before pickup.
create table recurring_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id) on delete cascade,
  shop_id uuid not null references shops(id),
  address_id uuid not null references addresses(id),
  items jsonb not null,                              -- [{service_id, quantity}]
  payment_method payment_method not null default 'cod',
  frequency text not null default 'weekly' check (frequency in ('weekly', 'biweekly')),
  weekday int not null check (weekday between 0 and 6),        -- 0 = Monday
  slot_start_hour int not null check (slot_start_hour between 6 and 21),
  slot_end_hour int not null check (slot_end_hour between 7 and 22),
  next_run_date date not null,                       -- the next pickup date (India time)
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  last_order_id uuid references orders(id),
  last_error text,
  created_at timestamptz not null default now(),
  check (slot_end_hour > slot_start_hour)
);
create index on recurring_orders (status, next_run_date);
create index on recurring_orders (customer_id);

alter table recurring_orders enable row level security;
create policy "own schedules" on recurring_orders for select using (customer_id = auth.uid());
