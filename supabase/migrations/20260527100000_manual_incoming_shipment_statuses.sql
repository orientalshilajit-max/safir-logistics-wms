-- Incoming shipment status is now manual/admin-controlled.
-- Discrepancies can be shown in UI, but they must not automatically change
-- the shipment status.

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('incoming_shipment', 'In Transit', 'blue', 10, true, true),
  ('incoming_shipment', 'Arrived', 'orange', 30, true, true),
  ('incoming_shipment', 'Partially Received', 'amber', 50, true, true),
  ('incoming_shipment', 'Received', 'emerald', 70, true, true),
  ('incoming_shipment', 'Need Attention', 'rose', 90, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = true,
  deleted_at = null,
  updated_at = now();

with status_map as (
  select old_status.id as old_status_id, new_status.id as new_status_id
  from public.statuses old_status
  join public.statuses new_status
    on new_status.category = 'incoming_shipment'
   and new_status.name = case
      when old_status.name in ('Draft', 'Submitted', 'Expected', 'In Transit') then 'In Transit'
      when old_status.name in ('Arrived', 'Arrived at Prep', 'Pending Receiving', 'Receiving') then 'Arrived'
      when old_status.name in ('Partially Received') then 'Partially Received'
      when old_status.name in ('Received', 'Completed') then 'Received'
      when old_status.name in ('Need Attention', 'Issue', 'Exception', 'Received with Discrepancy') then 'Need Attention'
      else null
    end
  where old_status.category = 'incoming_shipment'
)
update public.incoming_shipments shipment
set status_id = status_map.new_status_id
from status_map
where shipment.status_id = status_map.old_status_id
  and shipment.deleted_at is null;

update public.statuses
set
  active = false,
  updated_at = now()
where category = 'incoming_shipment'
  and name not in ('In Transit', 'Arrived', 'Received', 'Partially Received', 'Need Attention');

create or replace function public.sync_incoming_shipment_receiving_status(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Status is intentionally manual. Receiving/inventory operations should not
  -- assign Need Attention or any other shipment status automatically.
  return;
end;
$$;

