-- Poshak initial schema. Users live in Supabase auth.users (phone OTP login).

create type user_role as enum ('customer', 'partner', 'shop', 'admin');
create type order_status as enum (
  'placed', 'pickup_assigned', 'picked_up', 'weighed', 'washing',
  'ready', 'out_for_delivery', 'delivered', 'cancelled'
);
create type price_unit as enum ('kg', 'piece');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text,
  line1 text not null,
  line2 text,
  city text not null,
  pincode text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create table shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id),
  name text not null,
  description text,
  address text,
  city text not null,
  lat double precision,
  lng double precision,
  rating numeric(2,1),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,            -- e.g. Wash & Fold, Dry Clean, Iron
  unit price_unit not null,
  price numeric(10,2) not null check (price >= 0),
  turnaround_hours int not null default 48,
  is_active boolean not null default true
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  shop_id uuid not null references shops(id),
  address_id uuid not null references addresses(id),
  partner_id uuid references profiles(id),
  status order_status not null default 'placed',
  pickup_slot_start timestamptz not null,
  pickup_slot_end timestamptz not null,
  estimated_amount numeric(10,2) not null,
  final_amount numeric(10,2),     -- set after weighing at pickup
  weight_kg numeric(6,2),
  payment_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  service_id uuid not null references services(id),
  quantity numeric(8,2) not null check (quantity > 0),
  unit_price numeric(10,2) not null
);

create table order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  actor_id uuid references profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index on orders (customer_id, created_at desc);
create index on orders (shop_id, status);
create index on services (shop_id);

-- Auto-create a profile on signup.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone) values (new.id, new.phone);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- RLS: the FastAPI backend uses the service role (bypasses RLS);
-- these policies protect any direct client access.
alter table profiles enable row level security;
alter table addresses enable row level security;
alter table shops enable row level security;
alter table services enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;

create policy "own profile" on profiles for select using (id = auth.uid());
create policy "own addresses" on addresses for all using (user_id = auth.uid());
create policy "public shops" on shops for select using (is_active);
create policy "public services" on services for select using (is_active);
create policy "own orders" on orders for select using (customer_id = auth.uid());
create policy "own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
create policy "own order events" on order_events for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));
