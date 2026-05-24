-- Keep general document attachments scoped to one client and prevent related
-- object links from crossing client boundaries.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_attachments_require_client_check'
  ) then
    alter table public.attachments
    add constraint document_attachments_require_client_check
    check (entity_type <> 'documents' or client_id is not null);
  end if;
end;
$$;

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

  if new.client_id is null then
    raise exception 'Document attachments require client_id';
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

drop trigger if exists validate_document_attachment_client_links_before_write
on public.attachments;

create trigger validate_document_attachment_client_links_before_write
before insert or update of entity_type, client_id, product_id, shipment_id, service_request_id, invoice_id
on public.attachments
for each row execute function public.validate_document_attachment_client_links();
