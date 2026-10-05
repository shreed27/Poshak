-- Delivery partner availability + last known location, used for automatic assignment and live tracking.
create table partner_status (
  partner_id uuid primary key references profiles(id) on delete cascade,
  is_online boolean not null default false,
  lat double precision,
  lng double precision,
  updated_at timestamptz not null default now()
);
alter table partner_status enable row level security;
create policy "own status" on partner_status for select using (partner_id = auth.uid());
create index on partner_status (is_online);

-- Who put the order on a partner: 'auto' (dispatch), 'partner' (accepted themselves), 'admin'.
alter table orders add column assigned_by text;
-- Partners who released an order, so dispatch doesn't hand it straight back to them.
alter table orders add column declined_by text[] not null default '{}';
