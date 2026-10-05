insert into shops (name, description, city, rating) values
  ('Fresh Fold Laundry', 'Wash, fold and iron', 'Bengaluru', 4.5),
  ('Sparkle Dry Cleaners', 'Dry clean and premium care', 'Bengaluru', 4.2);

insert into services (shop_id, name, unit, price, turnaround_hours)
select id, 'Wash & Fold', 'kg', 70, 48 from shops where name = 'Fresh Fold Laundry'
union all
select id, 'Iron', 'piece', 12, 24 from shops where name = 'Fresh Fold Laundry'
union all
select id, 'Dry Clean (Shirt)', 'piece', 120, 72 from shops where name = 'Sparkle Dry Cleaners';

insert into promo_codes (code, description, kind, value, max_discount, min_order, first_order_only) values
  ('WELCOME20', '20% off your first order (up to ₹100)', 'percent', 20, 100, 100, true),
  ('FLAT50', '₹50 off orders above ₹300', 'flat', 50, null, 300, false)
on conflict (code) do nothing;
