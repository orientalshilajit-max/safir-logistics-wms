-- Security hardening: client portal data must always be scoped by the
-- authenticated user's client_id. Admin/WMS users keep cross-client access.

alter table public.products enable row level security;
alter table public.inventory enable row level security;
alter table public.incoming_shipments enable row level security;
alter table public.incoming_items enable row level security;
alter table public.incoming_tracking_boxes enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_items enable row level security;
alter table public.request_item_services enable row level security;
alter table public.request_boxes enable row level security;
alter table public.request_box_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.attachments enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.shipping_labels enable row level security;

drop policy if exists "Clients can read their products" on public.products;
drop policy if exists "Clients can create their products" on public.products;
drop policy if exists "Clients can update their products" on public.products;
create policy "Clients can read their products"
on public.products for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create their products"
on public.products for insert to authenticated
with check (client_id = public.current_client_id());
create policy "Clients can update their products"
on public.products for update to authenticated
using (client_id = public.current_client_id() and deleted_at is null)
with check (client_id = public.current_client_id());

drop policy if exists "Clients can read their inventory" on public.inventory;
create policy "Clients can read their inventory"
on public.inventory for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

drop policy if exists "Clients can read their incoming shipments" on public.incoming_shipments;
drop policy if exists "Clients can create their incoming shipments" on public.incoming_shipments;
drop policy if exists "Clients can update their incoming shipments" on public.incoming_shipments;
create policy "Clients can read their incoming shipments"
on public.incoming_shipments for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create their incoming shipments"
on public.incoming_shipments for insert to authenticated
with check (client_id = public.current_client_id());
create policy "Clients can update their incoming shipments"
on public.incoming_shipments for update to authenticated
using (client_id = public.current_client_id() and deleted_at is null)
with check (client_id = public.current_client_id());

drop policy if exists "Clients can read their incoming shipment items" on public.incoming_items;
drop policy if exists "Clients can create their incoming items" on public.incoming_items;
drop policy if exists "Clients can update their incoming items" on public.incoming_items;
create policy "Clients can read their incoming shipment items"
on public.incoming_items for select to authenticated
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
create policy "Clients can create their incoming items"
on public.incoming_items for insert to authenticated
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    join public.products product on product.id = incoming_items.product_id
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and product.client_id = public.current_client_id()
      and shipment.deleted_at is null
      and product.deleted_at is null
  )
);
create policy "Clients can update their incoming items"
on public.incoming_items for update to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    join public.products product on product.id = incoming_items.product_id
    where shipment.id = incoming_items.shipment_id
      and shipment.client_id = public.current_client_id()
      and product.client_id = public.current_client_id()
      and shipment.deleted_at is null
      and product.deleted_at is null
  )
);

drop policy if exists "Clients can read their incoming tracking boxes" on public.incoming_tracking_boxes;
drop policy if exists "Clients can create their incoming tracking boxes" on public.incoming_tracking_boxes;
drop policy if exists "Clients can update their incoming tracking boxes" on public.incoming_tracking_boxes;
create policy "Clients can read their incoming tracking boxes"
on public.incoming_tracking_boxes for select to authenticated
using (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);
create policy "Clients can create their incoming tracking boxes"
on public.incoming_tracking_boxes for insert to authenticated
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);
create policy "Clients can update their incoming tracking boxes"
on public.incoming_tracking_boxes for update to authenticated
using (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);

drop policy if exists "Clients can read their service requests" on public.service_requests;
drop policy if exists "Clients can create their service requests" on public.service_requests;
drop policy if exists "Clients can update draft service requests" on public.service_requests;
create policy "Clients can read their service requests"
on public.service_requests for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create their service requests"
on public.service_requests for insert to authenticated
with check (client_id = public.current_client_id());
create policy "Clients can update draft service requests"
on public.service_requests for update to authenticated
using (
  client_id = public.current_client_id()
  and status in ('Draft', 'Submitted', 'Need Client Action')
  and deleted_at is null
)
with check (
  client_id = public.current_client_id()
  and status in ('Draft', 'Submitted', 'Pending Approval', 'Need Client Action')
);

drop policy if exists "Clients can read their request items" on public.request_items;
drop policy if exists "Clients can create draft request items" on public.request_items;
drop policy if exists "Clients can update draft request items" on public.request_items;
create policy "Clients can read their request items"
on public.request_items for select to authenticated
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
on public.request_items for insert to authenticated
with check (
  exists (
    select 1 from public.service_requests request
    where request.id = request_items.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);
create policy "Clients can update draft request items"
on public.request_items for update to authenticated
using (
  deleted_at is null
  and exists (
    select 1 from public.service_requests request
    where request.id = request_items.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Submitted', 'Need Client Action')
      and request.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.service_requests request
    where request.id = request_items.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Submitted', 'Need Client Action')
      and request.deleted_at is null
  )
);

drop policy if exists "Clients can read their request item services" on public.request_item_services;
drop policy if exists "Clients can create draft request item services" on public.request_item_services;
drop policy if exists "Clients can update draft request item services" on public.request_item_services;
create policy "Clients can read their request item services"
on public.request_item_services for select to authenticated
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
on public.request_item_services for insert to authenticated
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
create policy "Clients can update draft request item services"
on public.request_item_services for update to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.request_items item
    join public.service_requests request on request.id = item.request_id
    where item.id = request_item_services.request_item_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Submitted', 'Need Client Action')
      and request.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.request_items item
    join public.service_requests request on request.id = item.request_id
    where item.id = request_item_services.request_item_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Submitted', 'Need Client Action')
      and request.deleted_at is null
  )
);

drop policy if exists "Clients can read their request boxes" on public.request_boxes;
drop policy if exists "Clients can create draft request boxes" on public.request_boxes;
create policy "Clients can read their request boxes"
on public.request_boxes for select to authenticated
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
on public.request_boxes for insert to authenticated
with check (
  exists (
    select 1 from public.service_requests request
    where request.id = request_boxes.request_id
      and request.client_id = public.current_client_id()
      and request.status in ('Draft', 'Need Client Action')
      and request.deleted_at is null
  )
);

drop policy if exists "Clients can read their request box items" on public.request_box_items;
drop policy if exists "Clients can create draft request box items" on public.request_box_items;
create policy "Clients can read their request box items"
on public.request_box_items for select to authenticated
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
on public.request_box_items for insert to authenticated
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

drop policy if exists "Clients can read their invoices" on public.invoices;
create policy "Clients can read their invoices"
on public.invoices for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

drop policy if exists "Clients can read their invoice items" on public.invoice_items;
create policy "Clients can read their invoice items"
on public.invoice_items for select to authenticated
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

drop policy if exists "Clients can read their attachments" on public.attachments;
drop policy if exists "Clients can create attachments" on public.attachments;
drop policy if exists "Clients can update their own document attachments" on public.attachments;
create policy "Clients can read their attachments"
on public.attachments for select to authenticated
using (
  client_id = public.current_client_id()
  and file_scope = 'client_specific'
  and deleted_at is null
  and (visible_to_client = true or uploaded_by_user_id = auth.uid())
);
create policy "Clients can create attachments"
on public.attachments for insert to authenticated
with check (
  client_id = public.current_client_id()
  and file_scope = 'client_specific'
  and uploaded_by_user_id = auth.uid()
  and uploaded_by_role = 'client'
);
create policy "Clients can update their own document attachments"
on public.attachments for update to authenticated
using (
  client_id = public.current_client_id()
  and file_scope = 'client_specific'
  and uploaded_by_user_id = auth.uid()
  and deleted_at is null
)
with check (
  client_id = public.current_client_id()
  and file_scope = 'client_specific'
  and uploaded_by_user_id = auth.uid()
  and uploaded_by_role = 'client'
);

drop policy if exists "Clients can read their activity logs" on public.activity_logs;
drop policy if exists "Clients can create activity logs" on public.activity_logs;
create policy "Clients can read their activity logs"
on public.activity_logs for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create activity logs"
on public.activity_logs for insert to authenticated
with check (client_id = public.current_client_id());

drop policy if exists "Clients can read their notifications" on public.notifications;
drop policy if exists "Clients can create their notifications" on public.notifications;
create policy "Clients can read their notifications"
on public.notifications for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create their notifications"
on public.notifications for insert to authenticated
with check (client_id = public.current_client_id());

drop policy if exists "Clients can read their shipping labels" on public.shipping_labels;
drop policy if exists "Clients can create their shipping labels" on public.shipping_labels;
drop policy if exists "Clients can update their shipping labels" on public.shipping_labels;
create policy "Clients can read their shipping labels"
on public.shipping_labels for select to authenticated
using (client_id = public.current_client_id() and deleted_at is null);
create policy "Clients can create their shipping labels"
on public.shipping_labels for insert to authenticated
with check (client_id = public.current_client_id());
create policy "Clients can update their shipping labels"
on public.shipping_labels for update to authenticated
using (client_id = public.current_client_id() and deleted_at is null)
with check (client_id = public.current_client_id());

drop policy if exists "Clients can read global document files" on storage.objects;
drop policy if exists "Clients can read their document files" on storage.objects;
create policy "Clients can read their document files"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = 'documents'
  and (storage.foldername(name))[2] = public.current_client_id()::text
);
