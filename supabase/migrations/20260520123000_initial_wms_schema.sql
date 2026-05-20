-- Initial prep center WMS schema.
-- RLS policies below assume a client user's JWT includes either:
-- app_metadata.client_id or user_metadata.client_id.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'client_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'client_id', '')::uuid
  );
$$;

create or replace function public.is_wms_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'wms_admin');
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  telegram text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clients_email_format_check check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
);

create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  color text not null default 'slate',
  sort_order integer not null default 0,
  is_public boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint statuses_category_name_key unique (category, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  product_name text not null,
  sku text,
  fnsku text,
  asin text,
  photo_url text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.incoming_shipments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  carrier text not null,
  tracking_numbers text[] not null default '{}',
  number_of_boxes integer not null default 0,
  expected_arrival_date date,
  notes text,
  status_id uuid not null references public.statuses(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incoming_shipments_number_of_boxes_check check (number_of_boxes >= 0)
);

create table public.incoming_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.incoming_shipments(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  expected_quantity integer not null,
  received_quantity integer not null default 0,
  damaged_quantity integer not null default 0,
  missing_quantity integer not null default 0,
  notes text,
  inventory_posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint incoming_items_expected_quantity_check check (expected_quantity >= 0),
  constraint incoming_items_received_quantity_check check (received_quantity >= 0),
  constraint incoming_items_damaged_quantity_check check (damaged_quantity >= 0),
  constraint incoming_items_missing_quantity_check check (missing_quantity >= 0)
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  expected_qty integer not null default 0,
  received_qty integer not null default 0,
  available_qty integer not null default 0,
  reserved_qty integer not null default 0,
  processing_qty integer not null default 0,
  shipped_qty integer not null default 0,
  damaged_qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint inventory_client_product_key unique (client_id, product_id),
  constraint inventory_expected_qty_check check (expected_qty >= 0),
  constraint inventory_received_qty_check check (received_qty >= 0),
  constraint inventory_available_qty_check check (available_qty >= 0),
  constraint inventory_reserved_qty_check check (reserved_qty >= 0),
  constraint inventory_processing_qty_check check (processing_qty >= 0),
  constraint inventory_shipped_qty_check check (shipped_qty >= 0),
  constraint inventory_damaged_qty_check check (damaged_qty >= 0)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  user_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_url text not null,
  uploaded_by text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger set_statuses_updated_at
before update on public.statuses
for each row execute function public.set_updated_at();

create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger set_incoming_shipments_updated_at
before update on public.incoming_shipments
for each row execute function public.set_updated_at();

create trigger set_incoming_items_updated_at
before update on public.incoming_items
for each row execute function public.set_updated_at();

create trigger set_inventory_updated_at
before update on public.inventory
for each row execute function public.set_updated_at();

create trigger set_activity_logs_updated_at
before update on public.activity_logs
for each row execute function public.set_updated_at();

create trigger set_attachments_updated_at
before update on public.attachments
for each row execute function public.set_updated_at();

create index clients_company_name_idx on public.clients using gin (to_tsvector('simple', company_name));
create index clients_email_idx on public.clients (lower(email));
create index clients_status_idx on public.clients (status) where deleted_at is null;

create index statuses_category_active_idx on public.statuses (category, active, sort_order) where deleted_at is null;
create index statuses_public_idx on public.statuses (is_public, active) where deleted_at is null;

create index products_client_id_idx on public.products (client_id) where deleted_at is null;
create index products_product_name_idx on public.products using gin (to_tsvector('simple', product_name));
create index products_sku_idx on public.products (client_id, sku) where sku is not null and deleted_at is null;
create index products_fnsku_idx on public.products (client_id, fnsku) where fnsku is not null and deleted_at is null;
create index products_asin_idx on public.products (client_id, asin) where asin is not null and deleted_at is null;
create index products_active_idx on public.products (client_id, active) where deleted_at is null;

create index incoming_shipments_client_id_idx on public.incoming_shipments (client_id) where deleted_at is null;
create index incoming_shipments_status_id_idx on public.incoming_shipments (status_id) where deleted_at is null;
create index incoming_shipments_expected_arrival_idx on public.incoming_shipments (expected_arrival_date) where deleted_at is null;
create index incoming_shipments_tracking_numbers_idx on public.incoming_shipments using gin (tracking_numbers);

create index incoming_items_shipment_id_idx on public.incoming_items (shipment_id) where deleted_at is null;
create index incoming_items_product_id_idx on public.incoming_items (product_id) where deleted_at is null;

create index inventory_client_id_idx on public.inventory (client_id) where deleted_at is null;
create index inventory_product_id_idx on public.inventory (product_id) where deleted_at is null;
create index inventory_available_qty_idx on public.inventory (client_id, available_qty) where deleted_at is null;

create index activity_logs_client_created_idx on public.activity_logs (client_id, created_at desc) where deleted_at is null;
create index activity_logs_entity_idx on public.activity_logs (entity_type, entity_id) where deleted_at is null;
create index activity_logs_metadata_idx on public.activity_logs using gin (metadata);

create index attachments_client_created_idx on public.attachments (client_id, created_at desc) where deleted_at is null;
create index attachments_entity_idx on public.attachments (entity_type, entity_id) where deleted_at is null;

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('client', 'Active', 'emerald', 10, true, true),
  ('client', 'Onboarding', 'blue', 20, true, true),
  ('client', 'Paused', 'amber', 30, true, true),
  ('client', 'Inactive', 'slate', 40, true, true),
  ('incoming_shipment', 'Draft', 'slate', 10, true, true),
  ('incoming_shipment', 'Expected', 'blue', 20, true, true),
  ('incoming_shipment', 'In Transit', 'indigo', 30, true, true),
  ('incoming_shipment', 'Arrived', 'cyan', 40, true, true),
  ('incoming_shipment', 'Receiving', 'amber', 50, true, true),
  ('incoming_shipment', 'Partially Received', 'orange', 60, true, true),
  ('incoming_shipment', 'Received', 'emerald', 70, true, true),
  ('incoming_shipment', 'Exception', 'rose', 80, true, true),
  ('incoming_item', 'Pending', 'slate', 10, true, true),
  ('incoming_item', 'Received', 'emerald', 20, true, true),
  ('incoming_item', 'Damaged', 'rose', 30, true, true),
  ('incoming_item', 'Missing', 'amber', 40, true, true),
  ('inventory', 'Available', 'emerald', 10, true, true),
  ('inventory', 'Processing', 'blue', 20, true, true),
  ('inventory', 'Reserved', 'amber', 30, true, true),
  ('inventory', 'Damaged', 'rose', 40, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();

alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.incoming_shipments enable row level security;
alter table public.incoming_items enable row level security;
alter table public.inventory enable row level security;
alter table public.statuses enable row level security;
alter table public.activity_logs enable row level security;
alter table public.attachments enable row level security;

create policy "Public statuses are readable"
on public.statuses
for select
to authenticated
using (is_public = true and active = true and deleted_at is null);

create policy "Admins can manage statuses"
on public.statuses
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their own client record"
on public.clients
for select
to authenticated
using (id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage clients"
on public.clients
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their products"
on public.products
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage products"
on public.products
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their incoming shipments"
on public.incoming_shipments
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage incoming shipments"
on public.incoming_shipments
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their incoming shipment items"
on public.incoming_items
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);

create policy "Admins can manage incoming items"
on public.incoming_items
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their inventory"
on public.inventory
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage inventory"
on public.inventory
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their activity logs"
on public.activity_logs
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage activity logs"
on public.activity_logs
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their attachments"
on public.attachments
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Admins can manage attachments"
on public.attachments
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can create activity logs"
on public.activity_logs
for insert
to authenticated
with check (client_id = public.current_client_id());

create policy "Clients can create attachments"
on public.attachments
for insert
to authenticated
with check (client_id = public.current_client_id());
