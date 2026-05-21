-- Database integrity hardening for operational inventory, requests, invoices,
-- notifications, and warehouse task workflows.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_reserved_not_over_total_check'
  ) then
    alter table public.inventory
    add constraint inventory_reserved_not_over_total_check
    check (reserved_qty <= greatest(received_qty - shipped_qty - damaged_qty, 0));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'products_id_client_id_key'
  ) then
    alter table public.products
    add constraint products_id_client_id_key
    unique (id, client_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'inventory_product_client_fk'
  ) then
    alter table public.inventory
    add constraint inventory_product_client_fk
    foreign key (product_id, client_id)
    references public.products(id, client_id)
    on update cascade
    on delete restrict
    not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'invoices_due_after_issue_check'
  ) then
    alter table public.invoices
    add constraint invoices_due_after_issue_check
    check (due_date >= issue_date);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'invoices_amounts_non_negative_check'
  ) then
    alter table public.invoices
    add constraint invoices_amounts_non_negative_check
    check (
      subtotal >= 0
      and discount_total >= 0
      and total_amount >= 0
      and paid_amount >= 0
      and balance_due >= 0
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'invoice_items_unit_price_check'
  ) then
    alter table public.invoice_items
    add constraint invoice_items_unit_price_check
    check (unit_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'invoice_items_description_not_blank_check'
  ) then
    alter table public.invoice_items
    add constraint invoice_items_description_not_blank_check
    check (length(btrim(description)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'notifications_title_not_blank_check'
  ) then
    alter table public.notifications
    add constraint notifications_title_not_blank_check
    check (length(btrim(title)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'notifications_entity_not_blank_check'
  ) then
    alter table public.notifications
    add constraint notifications_entity_not_blank_check
    check (length(btrim(entity_type)) > 0 and length(btrim(notification_type)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_notifications_user_id_fkey'
  ) then
    alter table public.user_notifications
    add constraint user_notifications_user_id_fkey
    foreign key (user_id)
    references auth.users(id)
    on update cascade
    on delete cascade
    not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'warehouse_tasks_assigned_to_fkey'
  ) then
    alter table public.warehouse_tasks
    add constraint warehouse_tasks_assigned_to_fkey
    foreign key (assigned_to)
    references auth.users(id)
    on update cascade
    on delete set null
    not valid;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'service_requests_created_by_fkey'
  ) then
    alter table public.service_requests
    add constraint service_requests_created_by_fkey
    foreign key (created_by)
    references auth.users(id)
    on update cascade
    on delete set null
    not valid;
  end if;
end;
$$;

create index if not exists inventory_client_product_available_idx
on public.inventory (client_id, product_id, available_qty)
where deleted_at is null;

create index if not exists inventory_low_stock_idx
on public.inventory (client_id, available_qty)
where deleted_at is null and available_qty > 0;

create index if not exists request_items_request_product_idx
on public.request_items (request_id, product_id)
where deleted_at is null;

create index if not exists request_items_inventory_request_idx
on public.request_items (inventory_id, request_id)
where deleted_at is null;

create unique index if not exists request_items_request_inventory_product_active_key
on public.request_items (request_id, inventory_id, product_id)
where deleted_at is null;

create unique index if not exists request_item_services_item_service_active_key
on public.request_item_services (request_item_id, service_id)
where deleted_at is null;

create index if not exists request_box_items_product_idx
on public.request_box_items (product_id)
where deleted_at is null;

create unique index if not exists request_box_items_box_item_active_key
on public.request_box_items (request_box_id, request_item_id)
where deleted_at is null;

create index if not exists invoices_client_status_due_idx
on public.invoices (client_id, status, due_date)
where deleted_at is null;

create index if not exists invoices_balance_due_idx
on public.invoices (status, balance_due, due_date)
where deleted_at is null and balance_due > 0;

create index if not exists invoice_items_request_service_idx
on public.invoice_items (request_item_service_id)
where deleted_at is null and request_item_service_id is not null;

create index if not exists notifications_unread_lookup_idx
on public.user_notifications (user_id, notification_id, read_at);

create index if not exists notifications_global_created_idx
on public.notifications (created_at desc)
where deleted_at is null and client_id is null;

create index if not exists warehouse_tasks_active_queue_idx
on public.warehouse_tasks (status, priority, due_date, assigned_to)
where deleted_at is null and status not in ('Completed', 'Cancelled');

create unique index if not exists warehouse_tasks_request_item_type_active_key
on public.warehouse_tasks (service_request_id, request_item_id, task_type)
where deleted_at is null and request_item_id is not null;

create unique index if not exists warehouse_tasks_request_box_type_active_key
on public.warehouse_tasks (service_request_id, request_box_id, task_type)
where deleted_at is null and request_box_id is not null;

create or replace function public.validate_request_item_inventory()
returns trigger
language plpgsql
as $$
declare
  request_client_id uuid;
  inventory_record public.inventory%rowtype;
begin
  select client_id
  into request_client_id
  from public.service_requests
  where id = new.request_id
    and deleted_at is null;

  if request_client_id is null then
    raise exception 'Request % does not exist or has been deleted', new.request_id;
  end if;

  select *
  into inventory_record
  from public.inventory
  where id = new.inventory_id
    and deleted_at is null;

  if not found then
    raise exception 'Inventory row % does not exist or has been deleted', new.inventory_id;
  end if;

  if inventory_record.client_id <> request_client_id then
    raise exception 'Request item inventory client does not match request client';
  end if;

  if inventory_record.product_id <> new.product_id then
    raise exception 'Request item product does not match inventory product';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_request_item_inventory_before_write on public.request_items;
create trigger validate_request_item_inventory_before_write
before insert or update of request_id, inventory_id, product_id on public.request_items
for each row execute function public.validate_request_item_inventory();

create or replace function public.validate_request_box_item()
returns trigger
language plpgsql
as $$
declare
  box_request_id uuid;
  item_request_id uuid;
  item_product_id uuid;
  item_requested_quantity integer;
  total_boxed_quantity integer;
begin
  select request_id
  into box_request_id
  from public.request_boxes
  where id = new.request_box_id
    and deleted_at is null;

  select request_id, product_id, requested_quantity
  into item_request_id, item_product_id, item_requested_quantity
  from public.request_items
  where id = new.request_item_id
    and deleted_at is null;

  if box_request_id is null or item_request_id is null then
    raise exception 'Request box or request item does not exist';
  end if;

  if box_request_id <> item_request_id then
    raise exception 'Box item must belong to the same service request as the request item';
  end if;

  if new.product_id <> item_product_id then
    raise exception 'Box item product must match request item product';
  end if;

  select coalesce(sum(quantity), 0)
  into total_boxed_quantity
  from public.request_box_items
  where request_item_id = new.request_item_id
    and deleted_at is null
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if total_boxed_quantity + new.quantity > item_requested_quantity then
    raise exception 'Boxed quantity exceeds requested quantity for request item %', new.request_item_id;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_request_box_item_before_write on public.request_box_items;
create trigger validate_request_box_item_before_write
before insert or update of request_box_id, request_item_id, product_id, quantity on public.request_box_items
for each row execute function public.validate_request_box_item();

create or replace function public.validate_warehouse_task_links()
returns trigger
language plpgsql
as $$
declare
  request_client_id uuid;
  item_request_id uuid;
  item_product_id uuid;
  box_request_id uuid;
begin
  if new.service_request_id is not null then
    select client_id
    into request_client_id
    from public.service_requests
    where id = new.service_request_id
      and deleted_at is null;

    if request_client_id is null then
      raise exception 'Warehouse task service request does not exist';
    end if;

    if request_client_id <> new.client_id then
      raise exception 'Warehouse task client must match service request client';
    end if;
  end if;

  if new.request_item_id is not null then
    select request_id, product_id
    into item_request_id, item_product_id
    from public.request_items
    where id = new.request_item_id
      and deleted_at is null;

    if item_request_id is null then
      raise exception 'Warehouse task request item does not exist';
    end if;

    if new.service_request_id is not null and item_request_id <> new.service_request_id then
      raise exception 'Warehouse task item must belong to the linked service request';
    end if;

    if new.product_id is not null and item_product_id <> new.product_id then
      raise exception 'Warehouse task product must match request item product';
    end if;
  end if;

  if new.request_box_id is not null then
    select request_id
    into box_request_id
    from public.request_boxes
    where id = new.request_box_id
      and deleted_at is null;

    if box_request_id is null then
      raise exception 'Warehouse task request box does not exist';
    end if;

    if new.service_request_id is not null and box_request_id <> new.service_request_id then
      raise exception 'Warehouse task box must belong to the linked service request';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_warehouse_task_links_before_write on public.warehouse_tasks;
create trigger validate_warehouse_task_links_before_write
before insert or update of client_id, service_request_id, request_item_id, request_box_id, product_id
on public.warehouse_tasks
for each row execute function public.validate_warehouse_task_links();

create or replace function public.reserve_inventory_for_request_item(p_request_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record public.request_items%rowtype;
  request_client_id uuid;
begin
  select *
  into item_record
  from public.request_items
  where id = p_request_item_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Request item % not found', p_request_item_id;
  end if;

  select client_id
  into request_client_id
  from public.service_requests
  where id = item_record.request_id
    and deleted_at is null
  for update;

  if request_client_id is null then
    raise exception 'Request not found for request item %', p_request_item_id;
  end if;

  update public.inventory
  set
    available_qty = available_qty - item_record.requested_quantity,
    reserved_qty = reserved_qty + item_record.requested_quantity
  where id = item_record.inventory_id
    and client_id = request_client_id
    and product_id = item_record.product_id
    and deleted_at is null
    and available_qty >= item_record.requested_quantity;

  if not found then
    raise exception 'Insufficient available inventory for product %', item_record.product_id;
  end if;
end;
$$;

create or replace function public.release_inventory_for_request_item(p_request_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record public.request_items%rowtype;
begin
  select *
  into item_record
  from public.request_items
  where id = p_request_item_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Request item % not found', p_request_item_id;
  end if;

  update public.inventory
  set
    available_qty = available_qty + item_record.requested_quantity,
    reserved_qty = reserved_qty - item_record.requested_quantity
  where id = item_record.inventory_id
    and product_id = item_record.product_id
    and deleted_at is null
    and reserved_qty >= item_record.requested_quantity;

  if not found then
    raise exception 'Insufficient reserved inventory to release for product %', item_record.product_id;
  end if;
end;
$$;

create or replace function public.adjust_inventory_quantities(
  p_inventory_id uuid,
  p_available_delta integer default 0,
  p_reserved_delta integer default 0,
  p_processing_delta integer default 0,
  p_shipped_delta integer default 0,
  p_damaged_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory
  set
    available_qty = available_qty + coalesce(p_available_delta, 0),
    reserved_qty = reserved_qty + coalesce(p_reserved_delta, 0),
    processing_qty = processing_qty + coalesce(p_processing_delta, 0),
    shipped_qty = shipped_qty + coalesce(p_shipped_delta, 0),
    damaged_qty = damaged_qty + coalesce(p_damaged_delta, 0)
  where id = p_inventory_id
    and deleted_at is null
    and available_qty + coalesce(p_available_delta, 0) >= 0
    and reserved_qty + coalesce(p_reserved_delta, 0) >= 0
    and processing_qty + coalesce(p_processing_delta, 0) >= 0
    and shipped_qty + coalesce(p_shipped_delta, 0) >= 0
    and damaged_qty + coalesce(p_damaged_delta, 0) >= 0;

  if not found then
    raise exception 'Inventory adjustment would create negative inventory quantities';
  end if;
end;
$$;

create or replace function public.post_incoming_item_to_inventory(
  p_incoming_item_id uuid,
  p_received_quantity integer,
  p_damaged_quantity integer default 0,
  p_missing_quantity integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record public.incoming_items%rowtype;
  shipment_client_id uuid;
  available_quantity integer;
begin
  if coalesce(p_received_quantity, 0) < 0
    or coalesce(p_damaged_quantity, 0) < 0
    or coalesce(p_missing_quantity, 0) < 0 then
    raise exception 'Receiving quantities cannot be negative';
  end if;

  select *
  into item_record
  from public.incoming_items
  where id = p_incoming_item_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Incoming item % not found', p_incoming_item_id;
  end if;

  if item_record.inventory_posted_at is not null then
    raise exception 'Incoming item % has already been posted to inventory', p_incoming_item_id;
  end if;

  select client_id
  into shipment_client_id
  from public.incoming_shipments
  where id = item_record.shipment_id
    and deleted_at is null
  for update;

  if shipment_client_id is null then
    raise exception 'Incoming shipment not found for item %', p_incoming_item_id;
  end if;

  available_quantity := greatest(p_received_quantity - p_damaged_quantity, 0);

  update public.incoming_items
  set
    received_quantity = p_received_quantity,
    damaged_quantity = p_damaged_quantity,
    missing_quantity = p_missing_quantity,
    inventory_posted_at = now()
  where id = item_record.id
    and inventory_posted_at is null;

  if not found then
    raise exception 'Incoming item % was already posted by another transaction', p_incoming_item_id;
  end if;

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
    p_received_quantity,
    available_quantity,
    0,
    0,
    0,
    p_damaged_quantity
  )
  on conflict (client_id, product_id) do update
  set
    expected_qty = public.inventory.expected_qty + excluded.expected_qty,
    received_qty = public.inventory.received_qty + excluded.received_qty,
    available_qty = public.inventory.available_qty + excluded.available_qty,
    damaged_qty = public.inventory.damaged_qty + excluded.damaged_qty,
    updated_at = now()
  where public.inventory.deleted_at is null;

  if not found then
    raise exception 'Inventory row for product % is soft-deleted and cannot be updated', item_record.product_id;
  end if;
end;
$$;

create or replace function public.submit_service_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.service_requests%rowtype;
  item_record public.request_items%rowtype;
begin
  select *
  into request_record
  from public.service_requests
  where id = p_request_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Service request not found';
  end if;

  if not (
    public.is_wms_admin()
    or request_record.client_id = public.current_client_id()
  ) then
    raise exception 'Not authorized to submit this service request';
  end if;

  if request_record.status not in ('Draft', 'Need Client Action') then
    raise exception 'Only draft requests can be submitted';
  end if;

  if not exists (
    select 1
    from public.request_items
    where request_id = p_request_id
      and deleted_at is null
  ) then
    raise exception 'Cannot submit a service request without request items';
  end if;

  for item_record in
    select *
    from public.request_items
    where request_id = p_request_id
      and deleted_at is null
    order by inventory_id, id
  loop
    perform public.reserve_inventory_for_request_item(item_record.id);
  end loop;

  update public.service_requests
  set
    status = 'Pending Approval',
    submitted_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.reserve_inventory_for_request_item(uuid) to authenticated;
grant execute on function public.release_inventory_for_request_item(uuid) to authenticated;
grant execute on function public.adjust_inventory_quantities(uuid, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.post_incoming_item_to_inventory(uuid, integer, integer, integer) to authenticated;
