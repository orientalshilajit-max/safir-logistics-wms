-- Simple multi-product incoming shipment workflow.

alter table public.incoming_shipments
add column if not exists supplier text,
add column if not exists master_tracking_number text;

alter table public.incoming_items
add column if not exists expected_boxes integer not null default 0,
add column if not exists received_boxes integer;

alter table public.incoming_tracking_boxes
add column if not exists box_count integer,
add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incoming_items_expected_boxes_check'
  ) then
    alter table public.incoming_items
    add constraint incoming_items_expected_boxes_check
    check (expected_boxes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'incoming_items_received_boxes_check'
  ) then
    alter table public.incoming_items
    add constraint incoming_items_received_boxes_check
    check (received_boxes is null or received_boxes >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'incoming_tracking_boxes_box_count_check'
  ) then
    alter table public.incoming_tracking_boxes
    add constraint incoming_tracking_boxes_box_count_check
    check (box_count is null or box_count >= 0);
  end if;
end;
$$;

create index if not exists incoming_shipments_supplier_idx
on public.incoming_shipments (supplier)
where deleted_at is null and supplier is not null;

create index if not exists incoming_shipments_master_tracking_idx
on public.incoming_shipments (master_tracking_number)
where deleted_at is null and master_tracking_number is not null;

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
  total_items integer;
  posted_items integer;
  discrepancy_count integer;
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

  select
    count(*),
    count(*) filter (where inventory_posted_at is not null),
    count(*) filter (
      where inventory_posted_at is not null
        and (
          is_unexpected = true
          or expected_quantity <> received_quantity
          or expected_boxes <> coalesce(received_boxes, expected_boxes)
          or damaged_quantity > 0
          or missing_quantity > 0
        )
    )
  into total_items, posted_items, discrepancy_count
  from public.incoming_items
  where shipment_id = p_shipment_id
    and deleted_at is null;

  if issue_tracking_rows > 0 or discrepancy_count > 0 then
    next_status := 'Issue';
  elsif total_items > 0 and posted_items = total_items then
    next_status := 'Received';
  elsif received_tracking_rows = total_tracking_rows and total_tracking_rows > 0 then
    next_status := 'Received';
  elsif delivered_tracking_rows > 0 then
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
      and status.name = 'In Transit'
  );
$$;

drop policy if exists "Clients can update their incoming shipments" on public.incoming_shipments;
create policy "Clients can update their incoming shipments"
on public.incoming_shipments
for update
to authenticated
using (
  client_id = public.current_client_id()
  and public.is_incoming_shipment_in_transit(id)
)
with check (
  client_id = public.current_client_id()
);

drop policy if exists "Clients can update their incoming items" on public.incoming_items;
create policy "Clients can update their incoming items"
on public.incoming_items
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and public.is_incoming_shipment_in_transit(shipment.id)
  )
)
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    join public.products product on product.id = incoming_items.product_id
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and product.client_id = public.current_client_id()
      and public.is_incoming_shipment_in_transit(shipment.id)
  )
);

drop policy if exists "Clients can update their incoming tracking boxes" on public.incoming_tracking_boxes;
create policy "Clients can update their incoming tracking boxes"
on public.incoming_tracking_boxes
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and public.is_incoming_shipment_in_transit(shipment.id)
  )
)
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and public.is_incoming_shipment_in_transit(shipment.id)
  )
);

grant execute on function public.is_incoming_shipment_in_transit(uuid) to authenticated;
