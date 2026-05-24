-- Add global and client-specific scopes for general document attachments.

alter table public.attachments
add column if not exists file_scope text not null default 'client_specific';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachments_file_scope_check'
  ) then
    alter table public.attachments
    add constraint attachments_file_scope_check
    check (file_scope in ('global', 'client_specific'));
  end if;
end;
$$;

alter table public.attachments
drop constraint if exists document_attachments_require_client_check;

alter table public.attachments
add constraint document_attachments_client_scope_check
check (
  entity_type <> 'documents'
  or (
    (file_scope = 'global' and client_id is null)
    or (file_scope = 'client_specific' and client_id is not null)
  )
);

create index if not exists attachments_documents_scope_idx
on public.attachments (file_scope, client_id, created_at desc)
where deleted_at is null and archived_at is null and entity_type = 'documents';

drop policy if exists "Clients can read their attachments" on public.attachments;
create policy "Clients can read their attachments"
on public.attachments
for select
to authenticated
using (
  deleted_at is null
  and (
    entity_type <> 'documents'
    and client_id = public.current_client_id()
    or (
      entity_type = 'documents'
      and archived_at is null
      and (
        (file_scope = 'global' and visible_to_client = true)
        or (
          file_scope = 'client_specific'
          and client_id = public.current_client_id()
          and (
            visible_to_client = true
            or uploaded_by_user_id = auth.uid()
          )
        )
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
      file_scope = 'client_specific'
      and uploaded_by_user_id = auth.uid()
      and uploaded_by_role = 'client'
      and visible_to_client = true
      and archived_at is null
    )
  )
);

drop policy if exists "Clients can update their own document attachments" on public.attachments;
create policy "Clients can update their own document attachments"
on public.attachments
for update
to authenticated
using (
  entity_type = 'documents'
  and file_scope = 'client_specific'
  and client_id = public.current_client_id()
  and uploaded_by_user_id = auth.uid()
  and deleted_at is null
  and archived_at is null
)
with check (
  entity_type = 'documents'
  and file_scope = 'client_specific'
  and client_id = public.current_client_id()
  and uploaded_by_user_id = auth.uid()
  and uploaded_by_role = 'client'
  and visible_to_client = true
  and deleted_at is null
  and archived_at is null
);

drop policy if exists "Clients can read global document files" on storage.objects;
create policy "Clients can read global document files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.attachments attachment
    where attachment.storage_path = storage.objects.name
      and attachment.entity_type = 'documents'
      and attachment.file_scope = 'global'
      and attachment.visible_to_client = true
      and attachment.deleted_at is null
      and attachment.archived_at is null
  )
);

create or replace function public.validate_document_attachment_client_links()
returns trigger
language plpgsql
as $$
declare
  linked_client_id uuid;
begin
  if new.entity_type <> 'documents' then
    return new;
  end if;

  if new.file_scope = 'global' then
    if new.client_id is not null
      or new.product_id is not null
      or new.shipment_id is not null
      or new.service_request_id is not null
      or new.invoice_id is not null then
      raise exception 'Global document attachments cannot be linked to client-specific records';
    end if;

    return new;
  end if;

  if new.client_id is null then
    raise exception 'Client-specific document attachments require client_id';
  end if;

  if new.product_id is not null then
    select client_id into linked_client_id
    from public.products
    where id = new.product_id
      and deleted_at is null;

    if linked_client_id is null or linked_client_id <> new.client_id then
      raise exception 'Document product link must belong to the same client';
    end if;
  end if;

  if new.shipment_id is not null then
    select client_id into linked_client_id
    from public.incoming_shipments
    where id = new.shipment_id
      and deleted_at is null;

    if linked_client_id is null or linked_client_id <> new.client_id then
      raise exception 'Document shipment link must belong to the same client';
    end if;
  end if;

  if new.service_request_id is not null then
    select client_id into linked_client_id
    from public.service_requests
    where id = new.service_request_id
      and deleted_at is null;

    if linked_client_id is null or linked_client_id <> new.client_id then
      raise exception 'Document request link must belong to the same client';
    end if;
  end if;

  if new.invoice_id is not null then
    select client_id into linked_client_id
    from public.invoices
    where id = new.invoice_id
      and deleted_at is null;

    if linked_client_id is null or linked_client_id <> new.client_id then
      raise exception 'Document invoice link must belong to the same client';
    end if;
  end if;

  return new;
end;
$$;
