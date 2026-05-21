alter table public.products
add column if not exists barcode text,
add column if not exists barcode_type text;

alter table public.request_boxes
add column if not exists box_barcode text,
add column if not exists box_barcode_type text;

create or replace function public.is_warehouse_operator()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'warehouse_operator');
$$;

create table public.warehouse_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete cascade,
  request_item_id uuid references public.request_items(id) on delete set null,
  request_box_id uuid references public.request_boxes(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  task_type text not null default 'picking',
  status text not null default 'Pending',
  priority text not null default 'Normal',
  assigned_to uuid,
  due_date date,
  quantity integer not null default 0,
  barcode text,
  internal_notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint warehouse_tasks_type_check check (
    task_type in (
      'picking',
      'packing',
      'qc',
      'ready_to_ship',
      'inventory_adjustment',
      'general'
    )
  ),
  constraint warehouse_tasks_status_check check (
    status in (
      'Pending',
      'Picking',
      'Packing',
      'QC',
      'Ready to Ship',
      'Completed',
      'On Hold',
      'Cancelled'
    )
  ),
  constraint warehouse_tasks_priority_check check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  constraint warehouse_tasks_quantity_check check (quantity >= 0)
);

create trigger set_warehouse_tasks_updated_at
before update on public.warehouse_tasks
for each row execute function public.set_updated_at();

create index products_barcode_idx on public.products (client_id, barcode) where barcode is not null and deleted_at is null;
create index request_boxes_barcode_idx on public.request_boxes (box_barcode) where box_barcode is not null and deleted_at is null;
create index warehouse_tasks_client_idx on public.warehouse_tasks (client_id, created_at desc) where deleted_at is null;
create index warehouse_tasks_request_idx on public.warehouse_tasks (service_request_id, status) where deleted_at is null;
create index warehouse_tasks_status_priority_idx on public.warehouse_tasks (status, priority, due_date) where deleted_at is null;
create index warehouse_tasks_assigned_idx on public.warehouse_tasks (assigned_to, status) where deleted_at is null;
create index warehouse_tasks_product_idx on public.warehouse_tasks (product_id) where deleted_at is null;

create or replace function public.set_warehouse_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Completed' and old.status is distinct from 'Completed' then
    new.completed_at = now();
  elsif new.status <> 'Completed' then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

create trigger set_warehouse_task_completed_at
before update of status on public.warehouse_tasks
for each row execute function public.set_warehouse_task_completed_at();

create or replace function public.create_tasks_for_approved_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Approved' and old.status is distinct from 'Approved' then
    insert into public.warehouse_tasks (
      client_id,
      service_request_id,
      request_item_id,
      product_id,
      task_type,
      status,
      priority,
      quantity,
      barcode,
      internal_notes
    )
    select
      new.client_id,
      new.id,
      item.id,
      item.product_id,
      task_type.value,
      'Pending',
      'Normal',
      item.requested_quantity,
      coalesce(product.barcode, product.fnsku, product.sku, product.asin),
      'Generated from approved request ' || new.request_number
    from public.request_items item
    join public.products product on product.id = item.product_id
    cross join (values ('picking'), ('packing'), ('qc')) as task_type(value)
    where item.request_id = new.id
      and item.deleted_at is null
      and not exists (
        select 1
        from public.warehouse_tasks existing
        where existing.service_request_id = new.id
          and existing.request_item_id = item.id
          and existing.task_type = task_type.value
          and existing.deleted_at is null
      );

    insert into public.warehouse_tasks (
      client_id,
      service_request_id,
      request_box_id,
      task_type,
      status,
      priority,
      barcode,
      internal_notes
    )
    select
      new.client_id,
      new.id,
      box.id,
      'ready_to_ship',
      'Pending',
      'Normal',
      box.box_barcode,
      'Verify labels and handoff for box ' || box.box_number
    from public.request_boxes box
    where box.request_id = new.id
      and box.deleted_at is null
      and not exists (
        select 1
        from public.warehouse_tasks existing
        where existing.service_request_id = new.id
          and existing.request_box_id = box.id
          and existing.task_type = 'ready_to_ship'
          and existing.deleted_at is null
      );
  end if;

  return new;
end;
$$;

create trigger create_tasks_after_request_approval
after update of status on public.service_requests
for each row execute function public.create_tasks_for_approved_request();

create or replace function public.log_warehouse_task_activity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_activity_notification(
      new.client_id,
      'warehouse task created',
      'service_requests',
      coalesce(new.service_request_id, new.id),
      'Warehouse task created',
      initcap(replace(new.task_type, '_', ' ')) || ' task is ready.',
      'warehouse_task_created',
      jsonb_build_object('task_id', new.id, 'task_type', new.task_type, 'status', new.status)
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.record_activity_notification(
      new.client_id,
      'warehouse task status changed',
      'service_requests',
      coalesce(new.service_request_id, new.id),
      'Warehouse task updated',
      initcap(replace(new.task_type, '_', ' ')) || ' moved to ' || new.status || '.',
      'warehouse_task_status_changed',
      jsonb_build_object(
        'task_id', new.id,
        'task_type', new.task_type,
        'from_status', old.status,
        'to_status', new.status,
        'assigned_to', new.assigned_to
      )
    );
  end if;

  return new;
end;
$$;

create trigger log_warehouse_task_after_insert
after insert on public.warehouse_tasks
for each row execute function public.log_warehouse_task_activity();

create trigger log_warehouse_task_after_status_update
after update of status on public.warehouse_tasks
for each row execute function public.log_warehouse_task_activity();

alter table public.warehouse_tasks enable row level security;

create policy "Admins can manage warehouse tasks"
on public.warehouse_tasks
for all
to authenticated
using (public.is_wms_admin())
with check (public.is_wms_admin());

create policy "Warehouse operators can read warehouse tasks"
on public.warehouse_tasks
for select
to authenticated
using (public.is_warehouse_operator() and deleted_at is null);

create policy "Warehouse operators can create warehouse tasks"
on public.warehouse_tasks
for insert
to authenticated
with check (public.is_warehouse_operator());

create policy "Warehouse operators can update warehouse tasks"
on public.warehouse_tasks
for update
to authenticated
using (public.is_warehouse_operator() and deleted_at is null)
with check (public.is_warehouse_operator());

create policy "Clients can read their warehouse tasks"
on public.warehouse_tasks
for select
to authenticated
using (client_id = public.current_client_id() and deleted_at is null);

create policy "Warehouse operators can update inventory quantities"
on public.inventory
for update
to authenticated
using (public.is_warehouse_operator() and deleted_at is null)
with check (public.is_warehouse_operator());

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
