-- Incoming shipments use a simple operational status model.

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('incoming_shipment', 'In Transit', 'blue', 10, true, true),
  ('incoming_shipment', 'Arrived at Prep', 'orange', 30, true, true),
  ('incoming_shipment', 'Received', 'emerald', 70, true, true),
  ('incoming_shipment', 'Issue', 'rose', 90, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();
