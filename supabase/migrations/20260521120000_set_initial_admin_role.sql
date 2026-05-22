-- Set initial admin role for the manually-created Supabase Auth user.

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where email = 'rybinn@mail.com';
