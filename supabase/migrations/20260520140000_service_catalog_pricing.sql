create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  pricing_type text not null,
  default_price numeric(12, 2) not null default 0,
  active boolean not null default true,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint services_pricing_type_check check (
    pricing_type in (
      'per_unit',
      'per_box',
      'per_shipment',
      'per_pallet',
      'per_order',
      'per_month',
      'manual'
    )
  ),
  constraint services_default_price_check check (default_price >= 0)
);

create table public.client_pricing_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  override_price numeric(12, 2) not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint client_pricing_overrides_price_check check (override_price >= 0),
  constraint client_pricing_overrides_client_service_key unique (client_id, service_id)
);

create trigger set_services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create trigger set_client_pricing_overrides_updated_at
before update on public.client_pricing_overrides
for each row execute function public.set_updated_at();

create index services_name_idx on public.services using gin (to_tsvector('simple', name));
create index services_category_idx on public.services (category) where deleted_at is null;
create index services_pricing_type_idx on public.services (pricing_type) where deleted_at is null;
create index services_active_visible_idx on public.services (active, visible_to_client) where deleted_at is null;

create index client_pricing_overrides_client_idx
on public.client_pricing_overrides (client_id)
where deleted_at is null;

create index client_pricing_overrides_service_idx
on public.client_pricing_overrides (service_id)
where deleted_at is null;

create index client_pricing_overrides_active_idx
on public.client_pricing_overrides (client_id, service_id, active)
where deleted_at is null;

alter table public.services enable row level security;
alter table public.client_pricing_overrides enable row level security;

create policy "Admins can manage services"
on public.services
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read visible active services"
on public.services
for select
to authenticated
using (active = true and visible_to_client = true and deleted_at is null);

create policy "Admins can manage client pricing overrides"
on public.client_pricing_overrides
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their pricing overrides"
on public.client_pricing_overrides
for select
to authenticated
using (
  client_id = public.current_client_id()
  and active = true
  and deleted_at is null
);
