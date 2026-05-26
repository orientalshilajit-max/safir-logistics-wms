-- Product thumbnails stored in Supabase Storage.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Admins can manage product image files" on storage.objects;
create policy "Admins can manage product image files"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-images' and public.is_wms_admin())
with check (bucket_id = 'product-images' and public.is_wms_admin());

drop policy if exists "Clients can upload their product image files" on storage.objects;
create policy "Clients can upload their product image files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = public.current_client_id()::text
);
