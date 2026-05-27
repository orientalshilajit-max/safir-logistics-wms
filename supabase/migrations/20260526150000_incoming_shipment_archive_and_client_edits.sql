-- Archive incoming shipments without destroying receiving or inventory history.

alter table public.incoming_shipments
add column if not exists archived_at timestamptz;

create index if not exists incoming_shipments_active_client_status_idx
on public.incoming_shipments (client_id, status_id, created_at desc)
where deleted_at is null and archived_at is null;

create index if not exists incoming_shipments_archived_idx
on public.incoming_shipments (client_id, archived_at desc)
where deleted_at is null and archived_at is not null;

create or replace function public.is_incoming_shipment_in_transit(p_shipment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.incoming_shipments shipment
    join public.statuses status on status.id = shipment.status_id
    where shipment.id = p_shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
      and shipment.archived_at is null
      and status.name in ('Draft', 'Submitted', 'In Transit')
  );
$$;

create or replace function public.incoming_shipment_has_warehouse_activity(p_shipment_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.incoming_shipments shipment
    join public.statuses status on status.id = shipment.status_id
    where shipment.id = p_shipment_id
      and shipment.deleted_at is null
      and status.name in ('Arrived at Prep', 'Receiving', 'Received', 'Completed', 'Issue', 'Posted to Inventory')
  )
  or exists (
    select 1
    from public.incoming_items item
    where item.shipment_id = p_shipment_id
      and item.deleted_at is null
      and item.inventory_posted_at is not null
  )
  or exists (
    select 1
    from public.incoming_tracking_boxes box
    where box.shipment_id = p_shipment_id
      and box.deleted_at is null
      and box.inventory_posted_at is not null
  );
$$;

create or replace function public.archive_incoming_shipment(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_client_id uuid;
begin
  select client_id
  into shipment_client_id
  from public.incoming_shipments
  where id = p_shipment_id
    and deleted_at is null;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found';
  end if;

  if not public.is_wms_admin() and shipment_client_id <> public.current_client_id() then
    raise exception 'Not allowed to archive this incoming shipment';
  end if;

  update public.incoming_shipments
  set archived_at = now()
  where id = p_shipment_id
    and deleted_at is null;
end;
$$;

create or replace function public.delete_incoming_shipment_if_allowed(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_client_id uuid;
  shipment_status text;
begin
  select shipment.client_id, status.name
  into shipment_client_id, shipment_status
  from public.incoming_shipments shipment
  join public.statuses status on status.id = shipment.status_id
  where shipment.id = p_shipment_id
    and shipment.deleted_at is null;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found';
  end if;

  if not public.is_wms_admin() and shipment_client_id <> public.current_client_id() then
    raise exception 'Not allowed to delete this incoming shipment';
  end if;

  if shipment_status not in ('Draft', 'Submitted', 'In Transit')
    or public.incoming_shipment_has_warehouse_activity(p_shipment_id) then
    raise exception 'This shipment already has warehouse activity and cannot be deleted. You can archive it instead.';
  end if;

  update public.incoming_shipments
  set deleted_at = now()
  where id = p_shipment_id
    and deleted_at is null;
end;
$$;

create or replace function public.update_incoming_shipment_client_limited(
  p_shipment_id uuid,
  p_carrier text,
  p_tracking_rows jsonb,
  p_item_notes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_client_id uuid;
  shipment_status text;
  tracking_numbers text[];
  first_tracking text;
  total_boxes integer;
  row_record jsonb;
  item_record jsonb;
begin
  select shipment.client_id, status.name
  into shipment_client_id, shipment_status
  from public.incoming_shipments shipment
  join public.statuses status on status.id = shipment.status_id
  where shipment.id = p_shipment_id
    and shipment.deleted_at is null
    and shipment.archived_at is null;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found';
  end if;

  if shipment_client_id <> public.current_client_id() then
    raise exception 'Not allowed to edit this incoming shipment';
  end if;

  if shipment_status not in ('Arrived at Prep', 'Receiving') then
    raise exception 'Limited shipment edits are only allowed while receiving';
  end if;

  select
    coalesce(array_agg(row_value ->> 'tracking_number') filter (where length(btrim(row_value ->> 'tracking_number')) > 0), '{}'::text[]),
    nullif(btrim((p_tracking_rows -> 0) ->> 'tracking_number'), ''),
    coalesce(sum(coalesce(nullif(row_value ->> 'box_count', '')::integer, 1)), 0)
  into tracking_numbers, first_tracking, total_boxes
  from jsonb_array_elements(coalesce(p_tracking_rows, '[]'::jsonb)) row_value
  where nullif(row_value ->> 'box_count', '') is null
    or nullif(row_value ->> 'box_count', '')::integer >= 1;

  first_tracking := tracking_numbers[1];

  update public.incoming_shipments
  set
    carrier = btrim(coalesce(p_carrier, '')),
    master_tracking_number = first_tracking,
    tracking_numbers = tracking_numbers,
    number_of_boxes = total_boxes,
    updated_at = now()
  where id = p_shipment_id;

  for item_record in select * from jsonb_array_elements(coalesce(p_item_notes, '[]'::jsonb))
  loop
    update public.incoming_items
    set notes = nullif(btrim(coalesce(item_record ->> 'notes', '')), '')
    where id = nullif(item_record ->> 'id', '')::uuid
      and shipment_id = p_shipment_id
      and deleted_at is null;
  end loop;

  update public.incoming_tracking_boxes
  set deleted_at = now()
  where shipment_id = p_shipment_id
    and inventory_posted_at is null
    and deleted_at is null;

  for row_record in select * from jsonb_array_elements(coalesce(p_tracking_rows, '[]'::jsonb))
  loop
    if length(btrim(coalesce(row_record ->> 'tracking_number', ''))) > 0 then
      insert into public.incoming_tracking_boxes (
        shipment_id,
        tracking_number,
        carrier,
        box_count,
        notes
      )
      values (
        p_shipment_id,
        btrim(row_record ->> 'tracking_number'),
        nullif(btrim(coalesce(p_carrier, '')), ''),
        coalesce(nullif(row_record ->> 'box_count', '')::integer, 1),
        nullif(btrim(coalesce(row_record ->> 'notes', '')), '')
      );
    end if;
  end loop;
end;
$$;

grant execute on function public.incoming_shipment_has_warehouse_activity(uuid) to authenticated;
grant execute on function public.archive_incoming_shipment(uuid) to authenticated;
grant execute on function public.delete_incoming_shipment_if_allowed(uuid) to authenticated;
grant execute on function public.update_incoming_shipment_client_limited(uuid, text, jsonb, jsonb) to authenticated;
