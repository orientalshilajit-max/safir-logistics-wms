create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  request_number text not null unique default ('SR-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'Draft',
  carrier text,
  tracking_numbers text[] not null default '{}',
  box_count integer not null default 0,
  shipping_label_urls text[] not null default '{}',
  notes text,
  admin_notes text,
  estimated_total numeric(12, 2) not null default 0,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint service_requests_status_check check (
    status in (
      'Draft',
      'Submitted',
      'Pending Approval',
      'Approved',
      'Rejected',
      'Waiting Labels',
      'Ready for Prep',
      'Prep in Progress',
      'QC Check',
      'Packing',
      'Ready to Ship',
      'Shipped',
      'Completed',
      'On Hold',
      'Need Client Action'
    )
  ),
  constraint service_requests_box_count_check check (box_count >= 0),
  constraint service_requests_estimated_total_check check (estimated_total >= 0)
);

create table public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  fnsku text,
  requested_quantity integer not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint request_items_requested_quantity_check check (requested_quantity > 0)
);

create table public.request_item_services (
  id uuid primary key default gen_random_uuid(),
  request_item_id uuid not null references public.request_items(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  pricing_type text not null,
  unit_price numeric(12, 2) not null,
  quantity_basis integer not null default 1,
  estimated_total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint request_item_services_price_check check (unit_price >= 0),
  constraint request_item_services_quantity_basis_check check (quantity_basis >= 0),
  constraint request_item_services_estimated_total_check check (estimated_total >= 0)
);

create table public.request_boxes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  box_number integer not null,
  tracking_number text,
  uploaded_label_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint request_boxes_box_number_check check (box_number > 0),
  constraint request_boxes_request_box_number_key unique (request_id, box_number)
);

create table public.request_box_items (
  id uuid primary key default gen_random_uuid(),
  request_box_id uuid not null references public.request_boxes(id) on delete cascade,
  request_item_id uuid not null references public.request_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint request_box_items_quantity_check check (quantity > 0)
);

create trigger set_service_requests_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();

create trigger set_request_items_updated_at
before update on public.request_items
for each row execute function public.set_updated_at();

create trigger set_request_item_services_updated_at
before update on public.request_item_services
for each row execute function public.set_updated_at();

create trigger set_request_boxes_updated_at
before update on public.request_boxes
for each row execute function public.set_updated_at();

create trigger set_request_box_items_updated_at
before update on public.request_box_items
for each row execute function public.set_updated_at();

create index service_requests_client_idx on public.service_requests (client_id, created_at desc) where deleted_at is null;
create index service_requests_status_idx on public.service_requests (status, created_at desc) where deleted_at is null;
create index service_requests_request_number_idx on public.service_requests (request_number) where deleted_at is null;

create index request_items_request_idx on public.request_items (request_id) where deleted_at is null;
create index request_items_inventory_idx on public.request_items (inventory_id) where deleted_at is null;
create index request_items_product_idx on public.request_items (product_id) where deleted_at is null;

create index request_item_services_item_idx on public.request_item_services (request_item_id) where deleted_at is null;
create index request_item_services_service_idx on public.request_item_services (service_id) where deleted_at is null;

create index request_boxes_request_idx on public.request_boxes (request_id, box_number) where deleted_at is null;
create index request_box_items_box_idx on public.request_box_items (request_box_id) where deleted_at is null;
create index request_box_items_request_item_idx on public.request_box_items (request_item_id) where deleted_at is null;

alter table public.service_requests enable row level security;
alter table public.request_items enable row level security;
alter table public.request_item_services enable row level security;
alter table public.request_boxes enable row level security;
alter table public.request_box_items enable row level security;

create policy "Admins can manage service requests"
on public.service_requests
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their service requests"
on public.service_requests
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Clients can create their service requests"
on public.service_requests
for insert
to authenticated
with check (client_id = public.current_client_id());

create policy "Clients can update draft service requests"
on public.service_requests
for update
to authenticated
using (
  client_id = public.current_client_id()
  and status in ('Draft', 'Need Client Action')
  and deleted_at is null
)
with check (
  client_id = public.current_client_id()
  and status in ('Draft', 'Submitted', 'Pending Approval', 'Need Client Action')
);

create policy "Admins can manage request items"
on public.request_items
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their request items"
on public.request_items
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.service_requests request
    where request.id = request_items.request_id
      and request.client_id = public.current_client_id()
      and request.deleted_at is null
  )
);

create policy "Clients can create draft request items"
on public.request_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.service_requests request
    where request.id = request_items.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);

create policy "Admins can manage request item services"
on public.request_item_services
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their request item services"
on public.request_item_services
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.request_items item
    join public.service_requests request on request.id = item.request_id
    where item.id = request_item_services.request_item_id
      and request.client_id = public.current_client_id()
      and request.deleted_at is null
  )
);

create policy "Clients can create draft request item services"
on public.request_item_services
for insert
to authenticated
with check (
  exists (
    select 1
    from public.request_items item
    join public.service_requests request on request.id = item.request_id
    where item.id = request_item_services.request_item_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);

create policy "Admins can manage request boxes"
on public.request_boxes
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their request boxes"
on public.request_boxes
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.service_requests request
    where request.id = request_boxes.request_id
      and request.client_id = public.current_client_id()
      and request.deleted_at is null
  )
);

create policy "Clients can create draft request boxes"
on public.request_boxes
for insert
to authenticated
with check (
  exists (
    select 1 from public.service_requests request
    where request.id = request_boxes.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);

create policy "Admins can manage request box items"
on public.request_box_items
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their request box items"
on public.request_box_items
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.request_boxes box
    join public.service_requests request on request.id = box.request_id
    where box.id = request_box_items.request_box_id
      and request.client_id = public.current_client_id()
      and request.deleted_at is null
  )
);

create policy "Clients can create draft request box items"
on public.request_box_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.request_boxes box
    join public.service_requests request on request.id = box.request_id
    where box.id = request_box_items.request_box_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);

create or replace function public.submit_service_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_record public.service_requests%rowtype;
  item_record public.request_items%rowtype;
  available integer;
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

  for item_record in
    select *
    from public.request_items
    where request_id = p_request_id
      and deleted_at is null
  loop
    select inventory.available_qty
    into available
    from public.inventory
    where inventory.id = item_record.inventory_id
      and inventory.client_id = request_record.client_id
      and inventory.product_id = item_record.product_id
      and inventory.deleted_at is null
    for update;

    if available is null then
      raise exception 'Inventory row not found for request item %', item_record.id;
    end if;

    if item_record.requested_quantity > available then
      raise exception 'Requested quantity exceeds available inventory for product %', item_record.product_id;
    end if;

    update public.inventory
    set
      available_qty = available_qty - item_record.requested_quantity,
      reserved_qty = reserved_qty + item_record.requested_quantity
    where id = item_record.inventory_id;
  end loop;

  update public.service_requests
  set
    status = 'Pending Approval',
    submitted_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.submit_service_request(uuid) to authenticated;
