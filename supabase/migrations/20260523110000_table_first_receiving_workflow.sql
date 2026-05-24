-- Table-first receiving workflow with tracking/box level status and posting.

create table public.incoming_tracking_boxes (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.incoming_shipments(id) on delete cascade,
  tracking_number text not null,
  carrier text,
  status text not null default 'In Transit',
  issue_notes text,
  inventory_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incoming_tracking_boxes_status_check check (
    status in ('In Transit', 'Delivered', 'Received', 'Issue')
  ),
  constraint incoming_tracking_boxes_tracking_number_check check (length(btrim(tracking_number)) > 0),
  constraint incoming_tracking_boxes_shipment_tracking_key unique (shipment_id, tracking_number)
);

alter table public.incoming_items
add column if not exists tracking_box_id uuid references public.incoming_tracking_boxes(id) on update cascade on delete set null,
add column if not exists is_unexpected boolean not null default false;

create trigger set_incoming_tracking_boxes_updated_at
before update on public.incoming_tracking_boxes
for each row execute function public.set_updated_at();

create index incoming_tracking_boxes_shipment_idx
on public.incoming_tracking_boxes (shipment_id, status)
where deleted_at is null;

create index incoming_tracking_boxes_tracking_idx
on public.incoming_tracking_boxes (tracking_number)
where deleted_at is null;

create index incoming_items_tracking_box_idx
on public.incoming_items (tracking_box_id)
where deleted_at is null and tracking_box_id is not null;

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('incoming_shipment', 'Pending Receiving', 'orange', 42, true, true),
  ('incoming_shipment', 'Partially Received', 'amber', 60, true, true),
  ('incoming_shipment', 'Received with Discrepancy', 'orange', 75, true, true),
  ('incoming_shipment', 'Issue', 'rose', 90, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();

create or replace function public.sync_incoming_shipment_receiving_status(p_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total_boxes integer;
  delivered_boxes integer;
  received_boxes integer;
  issue_boxes integer;
  discrepancy_count integer;
  next_status text;
  next_status_id uuid;
begin
  select
    count(*),
    count(*) filter (where status in ('Delivered', 'Received', 'Issue')),
    count(*) filter (where status = 'Received'),
    count(*) filter (where status = 'Issue')
  into total_boxes, delivered_boxes, received_boxes, issue_boxes
  from public.incoming_tracking_boxes
  where shipment_id = p_shipment_id
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

  if total_boxes = 0 then
    next_status := 'In Transit';
  elsif issue_boxes > 0 then
    next_status := 'Issue';
  elsif received_boxes = total_boxes then
    next_status := case when discrepancy_count > 0 then 'Received with Discrepancy' else 'Received' end;
  elsif received_boxes > 0 then
    next_status := 'Partially Received';
  elsif delivered_boxes > 0 then
    next_status := 'Pending Receiving';
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

    available_quantity := greatest(item_record.received_quantity - item_record.damaged_quantity, 0);

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
      item_record.received_quantity,
      available_quantity,
      0,
      0,
      0,
      item_record.damaged_quantity
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
      inventory_posted_at = now(),
      missing_quantity = greatest(expected_quantity - received_quantity, 0)
    where id = item_record.id
      and inventory_posted_at is null;
  end loop;

  update public.incoming_tracking_boxes
  set
    status = case when status = 'Issue' then status else 'Received' end,
    inventory_posted_at = now()
  where id = p_tracking_box_id
    and inventory_posted_at is null;

  perform public.sync_incoming_shipment_receiving_status(box_record.shipment_id);
end;
$$;

create or replace function public.sync_shipment_status_after_box_change()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_incoming_shipment_receiving_status(coalesce(new.shipment_id, old.shipment_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_shipment_status_after_box_change on public.incoming_tracking_boxes;
create trigger sync_shipment_status_after_box_change
after insert or update or delete
on public.incoming_tracking_boxes
for each row execute function public.sync_shipment_status_after_box_change();

alter table public.incoming_tracking_boxes enable row level security;

drop policy if exists "Admins can manage incoming tracking boxes"
on public.incoming_tracking_boxes;
create policy "Admins can manage incoming tracking boxes"
on public.incoming_tracking_boxes
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

drop policy if exists "Clients can read their incoming tracking boxes"
on public.incoming_tracking_boxes;
create policy "Clients can read their incoming tracking boxes"
on public.incoming_tracking_boxes
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);

grant execute on function public.post_incoming_tracking_box_to_inventory(uuid) to authenticated;
grant execute on function public.sync_incoming_shipment_receiving_status(uuid) to authenticated;
