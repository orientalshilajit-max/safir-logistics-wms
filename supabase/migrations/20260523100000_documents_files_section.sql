-- Documents & Files section backed by the existing attachments table.

alter table public.attachments
add column if not exists category text not null default 'General',
add column if not exists visible_to_client boolean not null default true,
add column if not exists uploaded_by_user_id uuid references auth.users(id) on update cascade on delete set null,
add column if not exists uploaded_by_role text not null default 'admin',
add column if not exists product_id uuid references public.products(id) on update cascade on delete set null,
add column if not exists shipment_id uuid references public.incoming_shipments(id) on update cascade on delete set null,
add column if not exists service_request_id uuid references public.service_requests(id) on update cascade on delete set null,
add column if not exists invoice_id uuid references public.invoices(id) on update cascade on delete set null,
add column if not exists archived_at timestamptz,
add column if not exists storage_path text,
add column if not exists mime_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachments_category_check'
  ) then
    alter table public.attachments
    add constraint attachments_category_check
    check (
      category in (
        'Agreement',
        'Product Images',
        'Supplier Invoice',
        'Compliance',
        'General',
        'Other'
      )
    );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'attachments_uploaded_by_role_check'
  ) then
    alter table public.attachments
    add constraint attachments_uploaded_by_role_check
    check (uploaded_by_role in ('admin', 'client', 'warehouse_operator', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'document_attachments_require_client_check'
  ) then
    alter table public.attachments
    add constraint document_attachments_require_client_check
    check (entity_type <> 'documents' or client_id is not null);
  end if;
end;
$$;

create index if not exists attachments_documents_client_category_idx
on public.attachments (client_id, category, created_at desc)
where deleted_at is null and archived_at is null and entity_type = 'documents';

create index if not exists attachments_documents_visibility_idx
on public.attachments (client_id, visible_to_client, uploaded_by_user_id)
where deleted_at is null and archived_at is null and entity_type = 'documents';

create index if not exists attachments_documents_product_idx
on public.attachments (product_id)
where deleted_at is null and archived_at is null and product_id is not null;

create index if not exists attachments_documents_shipment_idx
on public.attachments (shipment_id)
where deleted_at is null and archived_at is null and shipment_id is not null;

create index if not exists attachments_documents_request_idx
on public.attachments (service_request_id)
where deleted_at is null and archived_at is null and service_request_id is not null;

create index if not exists attachments_documents_invoice_idx
on public.attachments (invoice_id)
where deleted_at is null and archived_at is null and invoice_id is not null;

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "Clients can read their attachments" on public.attachments;
create policy "Clients can read their attachments"
on public.attachments
for select
to authenticated
using (
  client_id = public.current_client_id()
  and deleted_at is null
  and (
    entity_type <> 'documents'
    or (
      archived_at is null
      and (
        visible_to_client = true
        or uploaded_by_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Clients can create attachments" on public.attachments;
create policy "Clients can create attachments"
on public.attachments
for insert
to authenticated
with check (
  client_id = public.current_client_id()
  and (
    entity_type <> 'documents'
    or (
      uploaded_by_user_id = auth.uid()
      and uploaded_by_role = 'client'
      and visible_to_client = true
      and archived_at is null
    )
  )
);

create policy "Admins can manage document files"
on storage.objects
for all
to authenticated
using (bucket_id = 'documents' and public.is_wms_admin())
with check (bucket_id = 'documents' and public.is_wms_admin());

create policy "Clients can read their document files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'documents'
  and (storage.foldername(name))[2] = public.current_client_id()::text
);

create policy "Clients can upload their document files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'documents'
  and (storage.foldername(name))[2] = public.current_client_id()::text
);
