create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  body text,
  notification_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_notification_user_key unique (notification_id, user_id)
);

create index notifications_client_created_idx on public.notifications (client_id, created_at desc) where deleted_at is null;
create index notifications_entity_idx on public.notifications (entity_type, entity_id) where deleted_at is null;
create index notifications_type_idx on public.notifications (notification_type, created_at desc) where deleted_at is null;
create index user_notifications_user_read_idx on public.user_notifications (user_id, read_at);

alter table public.notifications enable row level security;
alter table public.user_notifications enable row level security;

create policy "Admins can manage notifications"
on public.notifications
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Clients can read their notifications"
on public.notifications
for select
to authenticated
using (
  deleted_at is null
  and (client_id = public.current_client_id() or client_id is null)
);

create policy "Users can manage their notification reads"
on public.user_notifications
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.current_actor_label()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'email', ''),
    case when public.is_wms_admin() then 'Admin' else 'Client' end,
    'System'
  );
$$;

create or replace function public.record_activity_notification(
  p_client_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_body text default null,
  p_notification_type text default 'info',
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
begin
  actor := public.current_actor_label();

  insert into public.activity_logs (
    client_id,
    user_type,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_client_id,
    actor,
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('actor', actor)
  );

  insert into public.notifications (
    client_id,
    title,
    body,
    notification_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_client_id,
    p_title,
    p_body,
    p_notification_type,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('actor', actor)
  );
end;
$$;

create or replace function public.log_receiving_activity()
returns trigger
language plpgsql
as $$
declare
  shipment_client_id uuid;
begin
  if new.inventory_posted_at is not null and old.inventory_posted_at is null then
    select client_id into shipment_client_id
    from public.incoming_shipments
    where id = new.shipment_id;

    perform public.record_activity_notification(
      shipment_client_id,
      'shipment received',
      'incoming_shipments',
      new.shipment_id,
      'Shipment received',
      'Incoming item quantities were posted to inventory.',
      'shipment_received',
      jsonb_build_object(
        'incoming_item_id', new.id,
        'product_id', new.product_id,
        'expected_quantity', new.expected_quantity,
        'received_quantity', new.received_quantity,
        'damaged_quantity', new.damaged_quantity,
        'missing_quantity', new.missing_quantity
      )
    );

    if new.expected_quantity <> new.received_quantity
      or new.damaged_quantity > 0
      or new.missing_quantity > 0 then
      perform public.record_activity_notification(
        shipment_client_id,
        'discrepancy found',
        'incoming_shipments',
        new.shipment_id,
        'Receiving discrepancy found',
        'Expected, received, damaged, or missing quantities do not match.',
        'discrepancy_found',
        jsonb_build_object(
          'incoming_item_id', new.id,
          'product_id', new.product_id,
          'expected_quantity', new.expected_quantity,
          'received_quantity', new.received_quantity,
          'damaged_quantity', new.damaged_quantity,
          'missing_quantity', new.missing_quantity
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger log_receiving_activity_after_item_update
after update of inventory_posted_at, received_quantity, damaged_quantity, missing_quantity on public.incoming_items
for each row execute function public.log_receiving_activity();

create or replace function public.log_service_request_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_activity_notification(
      new.client_id,
      'request created',
      'service_requests',
      new.id,
      'Service request created',
      new.request_number,
      'request_created',
      jsonb_build_object('request_number', new.request_number, 'status', new.status)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'Pending Approval' then
      perform public.record_activity_notification(
        new.client_id,
        'request submitted',
        'service_requests',
        new.id,
        'Service request submitted',
        new.request_number || ' is pending approval.',
        'request_submitted',
        jsonb_build_object('request_number', new.request_number, 'from_status', old.status, 'to_status', new.status)
      );
    elsif new.status = 'Approved' then
      perform public.record_activity_notification(
        new.client_id,
        'request approved',
        'service_requests',
        new.id,
        'Service request approved',
        new.request_number || ' was approved.',
        'request_approved',
        jsonb_build_object('request_number', new.request_number, 'from_status', old.status, 'to_status', new.status)
      );
    else
      perform public.record_activity_notification(
        new.client_id,
        'request status changed',
        'service_requests',
        new.id,
        'Request status changed',
        new.request_number || ' moved to ' || new.status || '.',
        'request_status_changed',
        jsonb_build_object('request_number', new.request_number, 'from_status', old.status, 'to_status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger log_service_request_activity_after_insert
after insert on public.service_requests
for each row execute function public.log_service_request_activity();

create trigger log_service_request_activity_after_status_update
after update of status on public.service_requests
for each row execute function public.log_service_request_activity();

create or replace function public.log_invoice_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_activity_notification(
      new.client_id,
      'invoice created',
      'invoices',
      new.id,
      'Invoice created',
      new.invoice_number || ' was generated.',
      'invoice_created',
      jsonb_build_object('invoice_number', new.invoice_number, 'total_amount', new.total_amount)
    );
    return new;
  end if;

  if new.status is distinct from old.status and new.status = 'Overdue' then
    perform public.record_activity_notification(
      new.client_id,
      'invoice overdue',
      'invoices',
      new.id,
      'Invoice overdue',
      new.invoice_number || ' is overdue.',
      'invoice_overdue',
      jsonb_build_object('invoice_number', new.invoice_number, 'due_date', new.due_date, 'balance_due', new.balance_due)
    );
  end if;

  return new;
end;
$$;

create trigger log_invoice_activity_after_insert
after insert on public.invoices
for each row execute function public.log_invoice_activity();

create trigger log_invoice_activity_after_status_update
after update of status on public.invoices
for each row execute function public.log_invoice_activity();

create or replace function public.log_inventory_adjustment()
returns trigger
language plpgsql
as $$
begin
  if new.available_qty is distinct from old.available_qty
    or new.reserved_qty is distinct from old.reserved_qty
    or new.processing_qty is distinct from old.processing_qty
    or new.shipped_qty is distinct from old.shipped_qty
    or new.damaged_qty is distinct from old.damaged_qty then
    perform public.record_activity_notification(
      new.client_id,
      'inventory adjusted',
      'inventory',
      new.id,
      'Inventory adjusted',
      'Inventory quantities changed.',
      'inventory_adjusted',
      jsonb_build_object(
        'product_id', new.product_id,
        'available_before', old.available_qty,
        'available_after', new.available_qty,
        'reserved_before', old.reserved_qty,
        'reserved_after', new.reserved_qty,
        'damaged_before', old.damaged_qty,
        'damaged_after', new.damaged_qty
      )
    );
  end if;

  return new;
end;
$$;

create trigger log_inventory_adjustment_after_update
after update of available_qty, reserved_qty, processing_qty, shipped_qty, damaged_qty on public.inventory
for each row execute function public.log_inventory_adjustment();

create or replace function public.mark_overdue_invoices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.invoices
  set status = 'Overdue'
  where due_date < current_date
    and balance_due > 0
    and status in ('Sent', 'Unpaid', 'Partial Paid')
    and deleted_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.mark_overdue_invoices() to authenticated;
