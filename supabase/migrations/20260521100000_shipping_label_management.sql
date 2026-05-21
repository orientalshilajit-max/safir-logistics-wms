-- Shipping and label management for service request outbound workflows.

alter table public.service_requests
drop constraint if exists service_requests_status_check;

alter table public.service_requests
add constraint service_requests_status_check check (
  status in (
    'Draft',
    'Submitted',
    'Pending Approval',
    'Approved',
    'Rejected',
    'Waiting Labels',
    'Labels Uploaded',
    'Ready to Pack',
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
);

insert into public.statuses (category, name, color, sort_order, is_public, active)
values
  ('service_request', 'Waiting Labels', 'amber', 45, true, true),
  ('service_request', 'Labels Uploaded', 'blue', 46, true, true),
  ('service_request', 'Ready to Pack', 'cyan', 47, true, true)
on conflict (category, name) do update set
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  active = excluded.active,
  updated_at = now();

insert into storage.buckets (id, name, public)
values ('shipping-labels', 'shipping-labels', false)
on conflict (id) do nothing;

create table public.shipping_labels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  request_box_id uuid references public.request_boxes(id) on delete set null,
  entity_type text not null default 'service_requests',
  entity_id uuid,
  label_category text not null,
  box_number integer,
  file_name text not null,
  file_url text not null,
  storage_path text,
  mime_type text,
  uploaded_by uuid references auth.users(id) on update cascade on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shipping_labels_category_check check (
    label_category in (
      'fba_box_label',
      'shipping_label',
      'pallet_label',
      'misc_document'
    )
  ),
  constraint shipping_labels_entity_type_check check (
    entity_type in ('service_requests', 'outbound_shipments')
  ),
  constraint shipping_labels_box_number_check check (
    box_number is null or box_number > 0
  ),
  constraint shipping_labels_file_name_check check (length(btrim(file_name)) > 0),
  constraint shipping_labels_file_url_check check (length(btrim(file_url)) > 0),
  constraint shipping_labels_request_entity_check check (
    service_request_id is not null or entity_id is not null
  )
);

create trigger set_shipping_labels_updated_at
before update on public.shipping_labels
for each row execute function public.set_updated_at();

create index shipping_labels_client_idx
on public.shipping_labels (client_id, created_at desc)
where deleted_at is null;

create index shipping_labels_request_idx
on public.shipping_labels (service_request_id, label_category, created_at desc)
where deleted_at is null;

create index shipping_labels_box_idx
on public.shipping_labels (request_box_id, label_category)
where deleted_at is null;

create index shipping_labels_entity_idx
on public.shipping_labels (entity_type, entity_id)
where deleted_at is null;

create or replace function public.validate_shipping_label_links()
returns trigger
language plpgsql
as $$
declare
  request_client_id uuid;
  box_request_id uuid;
  linked_box_number integer;
begin
  if new.service_request_id is not null then
    select client_id
    into request_client_id
    from public.service_requests
    where id = new.service_request_id
      and deleted_at is null;

    if request_client_id is null then
      raise exception 'Service request % does not exist or has been deleted', new.service_request_id;
    end if;

    if request_client_id <> new.client_id then
      raise exception 'Label client must match service request client';
    end if;
  end if;

  if new.request_box_id is not null then
    select request_id, box_number
    into box_request_id, linked_box_number
    from public.request_boxes
    where id = new.request_box_id
      and deleted_at is null;

    if box_request_id is null then
      raise exception 'Request box % does not exist or has been deleted', new.request_box_id;
    end if;

    if new.service_request_id is not null and box_request_id <> new.service_request_id then
      raise exception 'Label box must belong to the linked service request';
    end if;

    if new.box_number is null then
      new.box_number := linked_box_number;
    end if;
  end if;

  if new.entity_id is null then
    new.entity_id := new.service_request_id;
  end if;

  return new;
end;
$$;

create trigger validate_shipping_label_links_before_write
before insert or update of client_id, service_request_id, request_box_id, box_number, entity_id
on public.shipping_labels
for each row execute function public.validate_shipping_label_links();

alter table public.shipping_labels enable row level security;

create policy "Admins can manage shipping labels"
on public.shipping_labels
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Warehouse operators can manage shipping labels"
on public.shipping_labels
for all
to authenticated
using (public.is_warehouse_operator())
with check (public.is_warehouse_operator());

create policy "Clients can read their shipping labels"
on public.shipping_labels
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Clients can upload their shipping labels"
on public.shipping_labels
for insert
to authenticated
with check (client_id = public.current_client_id());

create policy "Clients can update their active shipping labels"
on public.shipping_labels
for update
to authenticated
using (client_id = public.current_client_id() and deleted_at is null)
with check (client_id = public.current_client_id());

create policy "Admins can manage shipping label files"
on storage.objects
for all
to authenticated
using (bucket_id = 'shipping-labels' and public.is_wms_admin())
with check (bucket_id = 'shipping-labels' and public.is_wms_admin());

create policy "Warehouse operators can manage shipping label files"
on storage.objects
for all
to authenticated
using (bucket_id = 'shipping-labels' and public.is_warehouse_operator())
with check (bucket_id = 'shipping-labels' and public.is_warehouse_operator());

create policy "Clients can manage their shipping label files"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'shipping-labels'
  and (storage.foldername(name))[1] = public.current_client_id()::text
)
with check (
  bucket_id = 'shipping-labels'
  and (storage.foldername(name))[1] = public.current_client_id()::text
);

drop policy if exists "Warehouse operators can update operational request statuses"
on public.service_requests;

create policy "Warehouse operators can update operational request statuses"
on public.service_requests
for update
to authenticated
using (public.is_warehouse_operator() and deleted_at is null)
with check (
  public.is_warehouse_operator()
  and status in (
    'Approved',
    'Waiting Labels',
    'Labels Uploaded',
    'Ready to Pack',
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
);
