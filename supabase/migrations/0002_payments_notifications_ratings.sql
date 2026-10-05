create type payment_method as enum ('online', 'cod');

alter table orders
  add column payment_method payment_method not null default 'cod',
  add column delivery_slot_note text,
  add column rating int check (rating between 1 and 5),
  add column review text;

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  razorpay_order_id text unique,
  razorpay_payment_id text,
  amount numeric(10,2) not null,
  status text not null default 'created',   -- created | paid | failed
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

alter table payments enable row level security;
alter table notifications enable row level security;
create policy "own payments" on payments for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "own notifications" on notifications for select using (user_id = auth.uid());
