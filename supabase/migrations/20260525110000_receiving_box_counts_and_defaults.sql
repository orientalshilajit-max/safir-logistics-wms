-- Keep tracking numbers separate from box counts and make receiving confirmation
-- post expected quantities when actual quantities have not been entered.

alter table public.incoming_shipments
add column if not exists actual_received_boxes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incoming_shipments_actual_received_boxes_check'
  ) then
    alter table public.incoming_shipments
    add constraint incoming_shipments_actual_received_boxes_check
    check (actual_received_boxes is null or actual_received_boxes >= 0);
  end if;
end;
$$;

create or replace function public.sync_incoming_shipment_receiving_status(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_tracking_rows integer;
  delivered_tracking_rows integer;
  received_tracking_rows integer;
  issue_tracking_rows integer;
  discrepancy_count integer;
  shipment_boxes integer;
  actual_boxes integer;
  next_status text;
  next_status_id uuid;
begin
  select
    count(*),
    count(*) filter (where status in ('Delivered', 'Received', 'Issue')),
    count(*) filter (where status = 'Received'),
    count(*) filter (where status = 'Issue')
  into total_tracking_rows, delivered_tracking_rows, received_tracking_rows, issue_tracking_rows
  from public.incoming_tracking_boxes
  where shipment_id = p_shipment_id
    and deleted_at is null;

  select number_of_boxes, actual_received_boxes
  into shipment_boxes, actual_boxes
  from public.incoming_shipments
  where id = p_shipment_id
    and deleted_at is null;

  select count(*)
  into discrepancy_count
  from public.incoming_items
  where shipment_id = p_shipment_id
    and deleted_at is null
    and (
      is_unexpected = true
      or expected_quantity <> received_quantity
      or damaged_quantity > 0
      or missing_quantity > 0
    );

  if actual_boxes is not null and actual_boxes <> shipment_boxes then
    discrepancy_count := discrepancy_count + 1;
  end if;

  if total_tracking_rows = 0 then
    next_status := 'In Transit';
  elsif issue_tracking_rows > 0 then
    next_status := 'Issue';
  elsif received_tracking_rows = total_tracking_rows then
    next_status := case when discrepancy_count > 0 then 'Issue' else 'Received' end;
  elsif received_tracking_rows > 0 or delivered_tracking_rows > 0 then
    next_status := 'Arrived at Prep';
  else
    next_status := 'In Transit';
  end if;

  select id
  into next_status_id
  from public.statuses
  where category = 'incoming_shipment'
    and name = next_status
    and active = true
    and deleted_at is null
  limit 1;

  if next_status_id is not null then
    update public.incoming_shipments
    set status_id = next_status_id
    where id = p_shipment_id
      and deleted_at is null;
  end if;
end;
$$;

create or replace function public.post_incoming_tracking_box_to_inventory(p_tracking_box_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  box_record public.incoming_tracking_boxes%rowtype;
  item_record public.incoming_items%rowtype;
  shipment_client_id uuid;
  actual_received integer;
  actual_damaged integer;
  available_quantity integer;
begin
  select *
  into box_record
  from public.incoming_tracking_boxes
  where id = p_tracking_box_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Tracking box % not found', p_tracking_box_id;
  end if;

  if box_record.inventory_posted_at is not null then
    raise exception 'Tracking box % has already been posted to inventory', p_tracking_box_id;
  end if;

  select client_id
  into shipment_client_id
  from public.incoming_shipments
  where id = box_record.shipment_id
    and deleted_at is null
  for update;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found for tracking box %', p_tracking_box_id;
  end if;

  for item_record in
    select *
    from public.incoming_items
    where tracking_box_id = p_tracking_box_id
      and deleted_at is null
    order by id
    for update
  loop
    if item_record.inventory_posted_at is not null then
      raise exception 'Incoming item % has already been posted to inventory', item_record.id;
    end if;

    actual_received := case
      when item_record.received_quantity = 0 and item_record.expected_quantity > 0 then item_record.expected_quantity
      else item_record.received_quantity
    end;
    actual_damaged := item_record.damaged_quantity;
    available_quantity := greatest(actual_received - actual_damaged, 0);

    insert into public.inventory (
      client_id,
      product_id,
      expected_qty,
      received_qty,
      available_qty,
      reserved_qty,
      processing_qty,
      shipped_qty,
      damaged_qty
    )
    values (
      shipment_client_id,
      item_record.product_id,
      item_record.expected_quantity,
      actual_received,
      available_quantity,
      0,
      0,
      0,
      actual_damaged
    )
    on conflict (client_id, product_id) do update
    set
      expected_qty = public.inventory.expected_qty + excluded.expected_qty,
      received_qty = public.inventory.received_qty + excluded.received_qty,
      available_qty = public.inventory.available_qty + excluded.available_qty,
      damaged_qty = public.inventory.damaged_qty + excluded.damaged_qty,
      updated_at = now()
    where public.inventory.deleted_at is null;

    update public.incoming_items
    set
      received_quantity = actual_received,
      inventory_posted_at = now(),
      missing_quantity = greatest(expected_quantity - actual_received, 0)
    where id = item_record.id
      and inventory_posted_at is null;
  end loop;

  update public.incoming_tracking_boxes
  set
    status = case when status = 'Issue' then status else 'Received' end,
    inventory_posted_at = now()
  where id = p_tracking_box_id
    and inventory_posted_at is null;

  update public.incoming_shipments
  set actual_received_boxes = coalesce(actual_received_boxes, number_of_boxes)
  where id = box_record.shipment_id
    and deleted_at is null;

  perform public.sync_incoming_shipment_receiving_status(box_record.shipment_id);
end;
$$;
