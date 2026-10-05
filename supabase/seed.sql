insert into shops (name, description, city, rating) values
  ('Fresh Fold Laundry', 'Wash, fold and iron', 'Bengaluru', 4.5),
  ('Sparkle Dry Cleaners', 'Dry clean and premium care', 'Bengaluru', 4.2);

insert into services (shop_id, name, unit, price, turnaround_hours)
select id, 'Wash & Fold', 'kg', 70, 48 from shops where name = 'Fresh Fold Laundry'
union all
select id, 'Iron', 'piece', 12, 24 from shops where name = 'Fresh Fold Laundry'
union all
select id, 'Dry Clean (Shirt)', 'piece', 120, 72 from shops where name = 'Sparkle Dry Cleaners';
