-- Catalog-only prep settings for products.

alter table public.products
add column if not exists prep_instructions text,
add column if not exists fragile boolean not null default false,
add column if not exists expiration_required boolean not null default false,
add column if not exists polybag_required boolean not null default false,
add column if not exists hazmat boolean not null default false;
