-- Per-user notification preferences and browser push subscriptions.
alter table profiles
  add column notify_push boolean not null default true,
  add column notify_whatsapp boolean not null default true,
  add column notify_sms boolean not null default false;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy "own subscriptions" on push_subscriptions for all using (user_id = auth.uid());
