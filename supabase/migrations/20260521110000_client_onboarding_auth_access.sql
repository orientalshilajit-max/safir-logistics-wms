-- Client onboarding auth linkage.

alter table public.clients
add column if not exists auth_user_id uuid references auth.users(id) on update cascade on delete set null,
add column if not exists login_status text not null default 'no login';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_login_status_check'
  ) then
    alter table public.clients
    add constraint clients_login_status_check
    check (login_status in ('no login', 'invited', 'active'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'clients_auth_user_id_key'
  ) then
    alter table public.clients
    add constraint clients_auth_user_id_key unique (auth_user_id);
  end if;
end;
$$;

create index if not exists clients_login_status_idx
on public.clients (login_status)
where deleted_at is null;

create index if not exists clients_auth_user_id_idx
on public.clients (auth_user_id)
where auth_user_id is not null and deleted_at is null;
