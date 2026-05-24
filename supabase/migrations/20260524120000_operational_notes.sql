-- Lightweight operational notes for client-visible and internal context.

create table if not exists public.operational_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on update cascade on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  visibility text not null default 'internal',
  content text not null,
  status text not null default 'open',
  author_user_id uuid references auth.users(id) on update cascade on delete set null,
  author_label text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz,
  constraint operational_notes_visibility_check check (visibility in ('client', 'internal')),
  constraint operational_notes_status_check check (status in ('open', 'resolved')),
  constraint operational_notes_entity_type_check check (
    entity_type in ('clients', 'service_requests', 'incoming_shipments', 'inventory', 'invoices')
  ),
  constraint operational_notes_content_check check (length(btrim(content)) > 0)
);

create index if not exists operational_notes_entity_idx
on public.operational_notes (entity_type, entity_id, created_at desc)
where deleted_at is null;

create index if not exists operational_notes_client_idx
on public.operational_notes (client_id, created_at desc)
where deleted_at is null;

alter table public.operational_notes enable row level security;

drop policy if exists "Admins can manage operational notes" on public.operational_notes;
create policy "Admins can manage operational notes"
on public.operational_notes
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

drop policy if exists "Clients can read their visible operational notes" on public.operational_notes;
create policy "Clients can read their visible operational notes"
on public.operational_notes
for select
to authenticated
using (
  client_id = public.current_client_id()
  and visibility = 'client'
  and deleted_at is null
);

drop policy if exists "Clients can create their operational notes" on public.operational_notes;
create policy "Clients can create their operational notes"
on public.operational_notes
for insert
to authenticated
with check (
  client_id = public.current_client_id()
  and visibility = 'client'
  and author_user_id = auth.uid()
);
