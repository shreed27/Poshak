create table promo_codes (
  code text primary key,                        -- always stored upper-case
  description text,
  kind text not null check (kind in ('percent', 'flat')),
  value numeric(10,2) not null check (value > 0),
  max_discount numeric(10,2),                   -- cap for percent promos
  min_order numeric(10,2) not null default 0,
  first_order_only boolean not null default false,
  usage_limit int,                              -- total redemptions across all customers (null = unlimited)
  per_user_limit int not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table promo_codes enable row level security;
create policy "active promos are readable" on promo_codes for select using (is_active);

-- The promo is snapshotted on the order so later edits don't change a placed order's discount.
alter table orders
  add column promo_code text references promo_codes(code),
  add column promo_kind text,
  add column promo_value numeric(10,2),
  add column promo_max_discount numeric(10,2),
  add column discount_amount numeric(10,2) not null default 0;
