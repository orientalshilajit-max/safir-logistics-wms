-- Manual product ordering for compact catalog views.

alter table public.products
add column if not exists sort_order integer not null default 0;

with ranked_products as (
  select
    id,
    row_number() over (
      partition by client_id
      order by created_at desc, id
    ) as next_sort_order
  from public.products
)
update public.products product
set sort_order = ranked_products.next_sort_order
from ranked_products
where ranked_products.id = product.id
  and product.sort_order = 0;

create index if not exists products_client_sort_order_idx
on public.products (client_id, sort_order, created_at desc)
where deleted_at is null;

drop policy if exists "Clients can update their products" on public.products;
create policy "Clients can update their products"
on public.products
for update
to authenticated
using (client_id = public.current_client_id() and deleted_at is null)
with check (client_id = public.current_client_id());
