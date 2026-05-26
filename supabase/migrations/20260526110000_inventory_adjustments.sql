-- Audited inventory adjustments for admin product operations.

alter table public.inventory
add column if not exists storage_boxes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_storage_boxes_check'
  ) then
    alter table public.inventory
    add constraint inventory_storage_boxes_check
    check (storage_boxes >= 0);
  end if;
end;
$$;

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on update cascade on delete restrict,
  product_id uuid not null references public.products(id) on update cascade on delete restrict,
  inventory_id uuid references public.inventory(id) on update cascade on delete set null,
  adjustment_type text not null,
  quantity integer not null,
  reason text not null,
  notes text,
  previous_value integer not null,
  new_value integer not null,
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_adjustments_type_check check (
    adjustment_type in ('received_qty', 'expected_qty', 'reserved_qty', 'available_qty', 'storage_boxes')
  ),
  constraint inventory_adjustments_reason_check check (length(btrim(reason)) > 0),
  constraint inventory_adjustments_quantity_check check (quantity <> 0)
);

create index if not exists inventory_adjustments_product_idx
on public.inventory_adjustments (product_id, created_at desc);

create index if not exists inventory_adjustments_client_idx
on public.inventory_adjustments (client_id, created_at desc);

alter table public.inventory_adjustments enable row level security;

drop policy if exists "Admins can manage inventory adjustments" on public.inventory_adjustments;
create policy "Admins can manage inventory adjustments"
on public.inventory_adjustments
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

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

  insert into public.inventory (client_id, product_id)
  values (p_client_id, p_product_id)
  on conflict (client_id, product_id) do nothing;

  select *
  into inventory_record
  from public.inventory
  where client_id = p_client_id
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
    p_client_id,
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

grant execute on function public.adjust_inventory_with_audit(uuid, uuid, text, integer, text, text) to authenticated;
