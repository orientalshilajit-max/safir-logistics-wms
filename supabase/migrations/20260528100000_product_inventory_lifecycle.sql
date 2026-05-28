-- Product and inventory lifecycle hardening.
-- Products should always have an inventory row, unposted incoming items should
-- appear as incoming units, and receiving should not double-count expected units.

-- The initial schema already enforces one inventory row per client/product with
-- inventory_client_product_key. The lifecycle triggers below rely on that
-- invariant and use the existing unique constraint for upserts.

create or replace function public.ensure_product_inventory_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
    new.client_id,
    new.id,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (client_id, product_id) do nothing;

  return new;
end;
$$;

create or replace function public.ensure_inventory_for_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  product_record public.products%rowtype;
  inventory_id uuid;
begin
  select *
  into product_record
  from public.products
  where id = p_product_id
    and deleted_at is null;

  if not found then
    raise exception 'Product % not found for inventory creation', p_product_id;
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
    product_record.client_id,
    product_record.id,
    0,
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (client_id, product_id) do update
  set updated_at = public.inventory.updated_at
  where public.inventory.deleted_at is null
  returning id into inventory_id;

  if inventory_id is null then
    select id
    into inventory_id
    from public.inventory
    where client_id = product_record.client_id
      and product_id = product_record.id
      and deleted_at is null;
  end if;

  if inventory_id is null then
    raise exception 'Inventory row for product % is soft-deleted and cannot be updated', p_product_id;
  end if;

  return inventory_id;
end;
$$;

drop trigger if exists ensure_product_inventory_after_insert on public.products;
create trigger ensure_product_inventory_after_insert
after insert on public.products
for each row execute function public.ensure_product_inventory_row();

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
select
  product.client_id,
  product.id,
  0,
  0,
  0,
  0,
  0,
  0,
  0
from public.products product
where product.deleted_at is null
on conflict (client_id, product_id) do nothing;

create or replace function public.validate_incoming_item_product_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_client_id uuid;
  product_client_id uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select client_id
  into shipment_client_id
  from public.incoming_shipments
  where id = new.shipment_id
    and deleted_at is null;

  if shipment_client_id is null then
    raise exception 'Incoming shipment % not found for incoming item', new.shipment_id;
  end if;

  select client_id
  into product_client_id
  from public.products
  where id = new.product_id
    and deleted_at is null;

  if product_client_id is null then
    raise exception 'Product % not found for incoming item', new.product_id;
  end if;

  if product_client_id <> shipment_client_id then
    raise exception 'Product % belongs to a different client than shipment %', new.product_id, new.shipment_id;
  end if;

  perform public.ensure_inventory_for_product(new.product_id);

  return new;
end;
$$;

drop trigger if exists validate_incoming_item_product_client_before_write on public.incoming_items;
create trigger validate_incoming_item_product_client_before_write
before insert or update of shipment_id, product_id, deleted_at on public.incoming_items
for each row execute function public.validate_incoming_item_product_client();

create or replace function public.adjust_inventory_expected_for_incoming_item(
  p_client_id uuid,
  p_product_id uuid,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  product_client_id uuid;
begin
  if p_client_id is null or p_product_id is null then
    raise exception 'Client and product are required for inventory adjustment';
  end if;

  if p_delta = 0 then
    return;
  end if;

  select client_id
  into product_client_id
  from public.products
  where id = p_product_id
    and deleted_at is null;

  if product_client_id is null then
    raise exception 'Product % not found for inventory adjustment', p_product_id;
  end if;

  if product_client_id <> p_client_id then
    raise exception 'Product % belongs to a different client than the shipment', p_product_id;
  end if;

  perform public.ensure_inventory_for_product(p_product_id);

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
    product_client_id,
    p_product_id,
    greatest(p_delta, 0),
    0,
    0,
    0,
    0,
    0,
    0
  )
  on conflict (client_id, product_id) do update
  set
    expected_qty = greatest(public.inventory.expected_qty + p_delta, public.inventory.received_qty),
    updated_at = now()
  where public.inventory.deleted_at is null;

  if not found then
    raise exception 'Inventory row for product % is soft-deleted and cannot be updated', p_product_id;
  end if;
end;
$$;

create or replace function public.sync_incoming_item_expected_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_client_id uuid;
  new_client_id uuid;
  old_counts boolean;
  new_counts boolean;
begin
  if tg_op = 'INSERT' then
    new_counts := new.deleted_at is null and new.inventory_posted_at is null;

    if new_counts then
      select client_id into new_client_id
      from public.incoming_shipments
      where id = new.shipment_id;

      perform public.adjust_inventory_expected_for_incoming_item(new_client_id, new.product_id, new.expected_quantity);
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    old_counts := old.deleted_at is null and old.inventory_posted_at is null;

    if old_counts then
      select client_id into old_client_id
      from public.incoming_shipments
      where id = old.shipment_id;

      perform public.adjust_inventory_expected_for_incoming_item(old_client_id, old.product_id, -old.expected_quantity);
    end if;

    return old;
  end if;

  old_counts := old.deleted_at is null and old.inventory_posted_at is null;
  new_counts := new.deleted_at is null and new.inventory_posted_at is null;

  if old_counts then
    select client_id into old_client_id
    from public.incoming_shipments
    where id = old.shipment_id;
  end if;

  if new_counts then
    select client_id into new_client_id
    from public.incoming_shipments
    where id = new.shipment_id;
  end if;

  if old_counts and new_counts then
    if old_client_id = new_client_id and old.product_id = new.product_id then
      perform public.adjust_inventory_expected_for_incoming_item(new_client_id, new.product_id, new.expected_quantity - old.expected_quantity);
    else
      perform public.adjust_inventory_expected_for_incoming_item(old_client_id, old.product_id, -old.expected_quantity);
      perform public.adjust_inventory_expected_for_incoming_item(new_client_id, new.product_id, new.expected_quantity);
    end if;
  elsif old_counts and new.deleted_at is not null then
    perform public.adjust_inventory_expected_for_incoming_item(old_client_id, old.product_id, -old.expected_quantity);
  elsif not old_counts and new_counts then
    perform public.adjust_inventory_expected_for_incoming_item(new_client_id, new.product_id, new.expected_quantity);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_incoming_item_expected_inventory_after_write on public.incoming_items;
create trigger sync_incoming_item_expected_inventory_after_write
after insert or update or delete on public.incoming_items
for each row execute function public.sync_incoming_item_expected_inventory();

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
select
  shipment.client_id,
  item.product_id,
  sum(item.expected_quantity)::integer,
  0,
  0,
  0,
  0,
  0,
  0
from public.incoming_items item
join public.incoming_shipments shipment on shipment.id = item.shipment_id
join public.products product
  on product.id = item.product_id
 and product.client_id = shipment.client_id
 and product.deleted_at is null
where item.deleted_at is null
  and item.inventory_posted_at is null
  and shipment.deleted_at is null
group by shipment.client_id, item.product_id
on conflict (client_id, product_id) do update
set
  expected_qty = greatest(public.inventory.expected_qty, public.inventory.received_qty + excluded.expected_qty),
  updated_at = now()
where public.inventory.deleted_at is null;

do $$
declare
  skipped_count integer;
begin
  select count(*)
  into skipped_count
  from public.incoming_items item
  join public.incoming_shipments shipment on shipment.id = item.shipment_id
  left join public.products product
    on product.id = item.product_id
   and product.client_id = shipment.client_id
   and product.deleted_at is null
  where item.deleted_at is null
    and shipment.deleted_at is null
    and product.id is null;

  if skipped_count > 0 then
    raise notice 'Skipped % incoming item(s) with invalid product/client linkage while repairing inventory expected units', skipped_count;
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
  product_client_id uuid;
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

  select client_id
  into product_client_id
  from public.products
  where id = item_record.product_id
    and deleted_at is null;

  if product_client_id is null then
    raise exception 'Product % not found for incoming item %', item_record.product_id, p_incoming_item_id;
  end if;

  if product_client_id <> shipment_client_id then
    raise exception 'Product % belongs to a different client than incoming item shipment', item_record.product_id;
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
    product_client_id,
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
  product_client_id uuid;
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

    select client_id
    into product_client_id
    from public.products
    where id = item_record.product_id
      and deleted_at is null;

    if product_client_id is null then
      raise exception 'Product % not found for incoming item %', item_record.product_id, item_record.id;
    end if;

    if product_client_id <> shipment_client_id then
      raise exception 'Product % belongs to a different client than tracking box shipment', item_record.product_id;
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
      product_client_id,
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

create or replace function public.adjust_inventory_with_audit(
  p_product_id uuid,
  p_client_id uuid,
  p_adjustment_type text,
  p_quantity integer,
  p_reason text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inventory_record public.inventory%rowtype;
  product_client_id uuid;
  previous_value integer;
  next_value integer;
begin
  if not public.is_wms_admin() then
    raise exception 'Only admins can adjust inventory';
  end if;

  if coalesce(p_quantity, 0) = 0 then
    raise exception 'Adjustment quantity cannot be zero';
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Adjustment reason is required';
  end if;

  if p_adjustment_type not in ('received_qty', 'expected_qty', 'reserved_qty', 'available_qty', 'storage_boxes') then
    raise exception 'Unsupported adjustment type %', p_adjustment_type;
  end if;

  select client_id
  into product_client_id
  from public.products
  where id = p_product_id
    and deleted_at is null;

  if product_client_id is null then
    raise exception 'Product % not found for inventory adjustment', p_product_id;
  end if;

  if p_client_id is not null and p_client_id <> product_client_id then
    raise exception 'Product % belongs to a different client than requested adjustment client', p_product_id;
  end if;

  perform public.ensure_inventory_for_product(p_product_id);

  select *
  into inventory_record
  from public.inventory
  where client_id = product_client_id
    and product_id = p_product_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Inventory row not found for product %', p_product_id;
  end if;

  previous_value := case p_adjustment_type
    when 'received_qty' then inventory_record.received_qty
    when 'expected_qty' then inventory_record.expected_qty
    when 'reserved_qty' then inventory_record.reserved_qty
    when 'available_qty' then inventory_record.available_qty
    when 'storage_boxes' then inventory_record.storage_boxes
  end;
  next_value := previous_value + p_quantity;

  if next_value < 0 then
    raise exception 'Adjustment would make % negative', p_adjustment_type;
  end if;

  update public.inventory
  set
    received_qty = case when p_adjustment_type = 'received_qty' then next_value else received_qty end,
    expected_qty = case when p_adjustment_type = 'expected_qty' then next_value else expected_qty end,
    reserved_qty = case when p_adjustment_type = 'reserved_qty' then next_value else reserved_qty end,
    available_qty = case when p_adjustment_type = 'available_qty' then next_value else available_qty end,
    storage_boxes = case when p_adjustment_type = 'storage_boxes' then next_value else storage_boxes end,
    updated_at = now()
  where id = inventory_record.id;

  insert into public.inventory_adjustments (
    client_id,
    product_id,
    inventory_id,
    adjustment_type,
    quantity,
    reason,
    notes,
    previous_value,
    new_value,
    created_by
  )
  values (
    product_client_id,
    p_product_id,
    inventory_record.id,
    p_adjustment_type,
    p_quantity,
    btrim(p_reason),
    nullif(btrim(coalesce(p_notes, '')), ''),
    previous_value,
    next_value,
    auth.uid()
  );
end;
$$;

grant execute on function public.post_incoming_item_to_inventory(uuid, integer, integer, integer) to authenticated;
grant execute on function public.post_incoming_tracking_box_to_inventory(uuid) to authenticated;
grant execute on function public.ensure_inventory_for_product(uuid) to authenticated;
grant execute on function public.adjust_inventory_with_audit(uuid, uuid, text, integer, text, text) to authenticated;
