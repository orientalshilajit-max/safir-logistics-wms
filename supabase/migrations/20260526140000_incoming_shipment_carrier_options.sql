-- Manage incoming shipment carrier options without hardcoding the intake form.

create table if not exists public.carrier_options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint carrier_options_name_check check (length(btrim(name)) > 0),
  constraint carrier_options_name_key unique (name)
);

create trigger set_carrier_options_updated_at
before update on public.carrier_options
for each row execute function public.set_updated_at();

insert into public.carrier_options (name, sort_order, active)
values
  ('UPS', 10, true),
  ('FedEx', 20, true),
  ('DHL', 30, true),
  ('USPS', 40, true),
  ('OnTrac', 50, true),
  ('Amazon Freight', 60, true),
  ('Amazon Delivery', 70, true),
  ('LTL Freight', 80, true),
  ('Local Delivery', 90, true),
  ('Other', 100, true)
on conflict (name) do update set
  sort_order = excluded.sort_order,
  active = excluded.active,
  deleted_at = null,
  updated_at = now();

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('incoming_shipment', 'Draft', 'slate', 5, true, true),
  ('incoming_shipment', 'Submitted', 'blue', 8, true, true),
  ('incoming_shipment', 'In Transit', 'blue', 10, true, true),
  ('incoming_shipment', 'Receiving', 'orange', 30, true, true),
  ('incoming_shipment', 'Completed', 'emerald', 70, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();

alter table public.carrier_options enable row level security;

drop policy if exists "Authenticated users can read carrier options" on public.carrier_options;
create policy "Authenticated users can read carrier options"
on public.carrier_options
for select
to authenticated
using (active = true and deleted_at is null);

drop policy if exists "Admins can manage carrier options" on public.carrier_options;
create policy "Admins can manage carrier options"
on public.carrier_options
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());
