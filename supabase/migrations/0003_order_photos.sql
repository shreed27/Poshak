-- Photos of the customer's clothes, attached to an order at checkout.
create table order_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  path text not null,                      -- object path inside the order-photos bucket
  created_at timestamptz not null default now()
);
create index on order_photos (order_id);

alter table order_photos enable row level security;
create policy "own order photos" on order_photos for select
  using (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid()));

-- Private bucket; each user may only write/read inside their own folder ({user_id}/...).
-- Partners and shops see photos through short-lived signed URLs minted by the API.
insert into storage.buckets (id, name, public) values ('order-photos', 'order-photos', false)
  on conflict (id) do nothing;

create policy "upload own order photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'order-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read own order photos" on storage.objects for select to authenticated
  using (bucket_id = 'order-photos' and (storage.foldername(name))[1] = auth.uid()::text);
