-- How a route gets around (walk, bike or car) and how long a stop lasts by default. Both live on the route, so on the
-- shared route the whole group sees the same timeline. A stop can override the mode for the leg that leads to it.
alter table public.ah_routes
  add column travel text not null default 'foot' check (travel in ('foot', 'bike', 'car')),
  add column stay int not null default 45 check (stay between 10 and 180);
alter table public.ah_stops add column travel text check (travel in ('foot', 'bike', 'car'));
grant update (travel, stay) on public.ah_routes to authenticated;
grant update (travel) on public.ah_stops to authenticated; -- stop columns are granted one by one
