create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  invoice_number text not null unique default ('INV-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'Draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + 14),
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  balance_due numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invoices_status_check check (
    status in (
      'Draft',
      'Sent',
      'Unpaid',
      'Partial Paid',
      'Paid',
      'Overdue',
      'Cancelled'
    )
  ),
  constraint invoices_paid_amount_check check (paid_amount >= 0),
  constraint invoices_request_key unique (service_request_id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_request_id uuid references public.service_requests(id) on delete set null,
  request_item_service_id uuid references public.request_item_services(id) on delete set null,
  item_type text not null default 'service',
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint invoice_items_type_check check (
    item_type in (
      'service',
      'storage_fee',
      'repack_fee',
      'custom_labor',
      'discount',
      'urgent_processing'
    )
  ),
  constraint invoice_items_quantity_check check (quantity >= 0)
);

create trigger set_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger set_invoice_items_updated_at
before update on public.invoice_items
for each row execute function public.set_updated_at();

create index invoices_client_idx on public.invoices (client_id, created_at desc) where deleted_at is null;
create index invoices_request_idx on public.invoices (service_request_id) where deleted_at is null;
create index invoices_status_idx on public.invoices (status, due_date) where deleted_at is null;
create index invoice_items_invoice_idx on public.invoice_items (invoice_id, sort_order) where deleted_at is null;

create or replace function public.recalculate_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subtotal_value numeric(12, 2);
  discount_value numeric(12, 2);
  total_value numeric(12, 2);
  paid_value numeric(12, 2);
begin
  select
    coalesce(sum(case when item_type = 'discount' then 0 else line_total end), 0),
    coalesce(sum(case when item_type = 'discount' then abs(line_total) else 0 end), 0)
  into subtotal_value, discount_value
  from public.invoice_items
  where invoice_id = p_invoice_id
    and deleted_at is null;

  select paid_amount
  into paid_value
  from public.invoices
  where id = p_invoice_id;

  total_value := greatest(subtotal_value - discount_value, 0);

  update public.invoices
  set
    subtotal = subtotal_value,
    discount_total = discount_value,
    total_amount = total_value,
    balance_due = greatest(total_value - coalesce(paid_value, 0), 0),
    status = case
      when status = 'Cancelled' then status
      when coalesce(paid_value, 0) >= total_value and total_value > 0 then 'Paid'
      when coalesce(paid_value, 0) > 0 then 'Partial Paid'
      when status = 'Paid' and coalesce(paid_value, 0) < total_value then 'Partial Paid'
      else status
    end
  where id = p_invoice_id;
end;
$$;

create or replace function public.set_invoice_item_line_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total = round(new.quantity * new.unit_price, 2);
  if new.item_type = 'discount' then
    new.line_total = -abs(new.line_total);
  end if;
  return new;
end;
$$;

create trigger set_invoice_item_line_total
before insert or update of quantity, unit_price, item_type on public.invoice_items
for each row execute function public.set_invoice_item_line_total();

create or replace function public.recalculate_invoice_totals_from_item()
returns trigger
language plpgsql
as $$
begin
  perform public.recalculate_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

create trigger recalculate_invoice_after_item_change
after insert or update or delete on public.invoice_items
for each row execute function public.recalculate_invoice_totals_from_item();

create or replace function public.generate_invoice_for_service_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.service_requests%rowtype;
  v_invoice_id uuid;
begin
  select *
  into request_record
  from public.service_requests
  where id = p_request_id
    and deleted_at is null;

  if not found then
    raise exception 'Service request not found';
  end if;

  if request_record.status <> 'Completed' then
    raise exception 'Only completed service requests can be invoiced';
  end if;

  insert into public.invoices (
    client_id,
    service_request_id,
    issue_date,
    due_date,
    status,
    notes
  )
  values (
    request_record.client_id,
    request_record.id,
    current_date,
    current_date + 14,
    'Draft',
    'Generated from completed service request ' || request_record.request_number
  )
  on conflict (service_request_id) do update
  set updated_at = public.invoices.updated_at
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id,
    service_request_id,
    request_item_service_id,
    item_type,
    description,
    quantity,
    unit_price,
    sort_order
  )
  select
    v_invoice_id,
    request_record.id,
    item_service.id,
    'service',
    services.name || ' - ' || products.product_name,
    item_service.quantity_basis,
    item_service.unit_price,
    row_number() over (order by item_service.created_at, item_service.id)
  from public.request_item_services item_service
  join public.request_items request_item on request_item.id = item_service.request_item_id
  join public.products products on products.id = request_item.product_id
  join public.services services on services.id = item_service.service_id
  where request_item.request_id = request_record.id
    and item_service.deleted_at is null
    and request_item.deleted_at is null
    and not exists (
      select 1
      from public.invoice_items existing
      where existing.invoice_id = v_invoice_id
        and existing.request_item_service_id = item_service.id
        and existing.deleted_at is null
    );

  if not exists (
    select 1 from public.invoice_items
    where invoice_items.invoice_id = v_invoice_id
      and invoice_items.deleted_at is null
  ) then
  insert into public.invoice_items (
      invoice_id,
      service_request_id,
      item_type,
      description,
      quantity,
      unit_price,
      sort_order
    )
    values (
      v_invoice_id,
      request_record.id,
      'service',
      'Service request estimate snapshot',
      1,
      request_record.estimated_total,
      1
    );
  end if;

  perform public.recalculate_invoice_totals(v_invoice_id);
  return v_invoice_id;
end;
$$;

create or replace function public.generate_invoice_when_request_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    perform public.generate_invoice_for_service_request(new.id);
  end if;
  return new;
end;
$$;

create trigger generate_invoice_after_request_completed
after update of status on public.service_requests
for each row execute function public.generate_invoice_when_request_completed();

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

create policy "Admins can manage invoices"
on public.invoices
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their invoices"
on public.invoices
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage invoice items"
on public.invoice_items
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their invoice items"
on public.invoice_items
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and invoice.client_id = public.current_client_id()
      and invoice.deleted_at is null
  )
);

grant execute on function public.generate_invoice_for_service_request(uuid) to authenticated;
grant execute on function public.recalculate_invoice_totals(uuid) to authenticated;
