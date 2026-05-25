-- Allow clients to add their own products and create client-owned inbound records.

drop policy if exists "Clients can create their products" on public.products;
create policy "Clients can create their products"
on public.products
for insert
to authenticated
with check (client_id = public.current_client_id());

drop policy if exists "Clients can create their incoming shipments" on public.incoming_shipments;
create policy "Clients can create their incoming shipments"
on public.incoming_shipments
for insert
to authenticated
with check (client_id = public.current_client_id());

drop policy if exists "Clients can create their incoming items" on public.incoming_items;
create policy "Clients can create their incoming items"
on public.incoming_items
for insert
to authenticated
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

drop policy if exists "Clients can create their incoming tracking boxes" on public.incoming_tracking_boxes;
create policy "Clients can create their incoming tracking boxes"
on public.incoming_tracking_boxes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.incoming_shipments shipment
    where shipment.id = incoming_tracking_boxes.shipment_id
      and shipment.client_id = public.current_client_id()
      and shipment.deleted_at is null
  )
);
