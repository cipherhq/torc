-- Granular staff roles and service availability rules.
alter type public.user_role add value if not exists 'support';

create or replace function public.is_support_or_admin(actor_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = actor_id and role in ('admin'::public.user_role, 'support'::public.user_role)
  );
$$;

grant execute on function public.is_support_or_admin(uuid) to authenticated;

-- Support staff can investigate and resolve operational issues, but existing
-- admin-only ALL policies still protect financial and configuration writes.
drop policy if exists "Support can view profiles" on public.profiles;
create policy "Support can view profiles" on public.profiles for select to authenticated
using (public.is_support_or_admin(auth.uid()));
drop policy if exists "Support can view documents" on public.documents;
create policy "Support can view documents" on public.documents for select to authenticated
using (public.is_support_or_admin(auth.uid()));
drop policy if exists "Support can view provider profiles" on public.provider_profiles;
create policy "Support can view provider profiles" on public.provider_profiles for select to authenticated
using (public.is_support_or_admin(auth.uid()));
drop policy if exists "Support can view jobs" on public.jobs;
create policy "Support can view jobs" on public.jobs for select to authenticated
using (public.is_support_or_admin(auth.uid()));
drop policy if exists "Support can manage tickets" on public.support_tickets;
create policy "Support can manage tickets" on public.support_tickets for all to authenticated
using (public.is_support_or_admin(auth.uid()))
with check (public.is_support_or_admin(auth.uid()));

create table if not exists public.service_availability_rules (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.services(id) on delete cascade,
  scope text not null check (scope in ('country','region','state')),
  country_code text,
  region_code text,
  state_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_availability_rule_location check (
    (scope = 'country' and country_code is not null and region_code is null and state_code is null)
    or (scope = 'region' and country_code is not null and region_code is not null and state_code is null)
    or (scope = 'state' and country_code is not null and state_code is not null)
  )
);

alter table public.service_availability_rules enable row level security;
drop policy if exists "Anyone can view active service availability" on public.service_availability_rules;
create policy "Anyone can view active service availability" on public.service_availability_rules
for select to anon, authenticated using (is_active = true or public.is_admin(auth.uid()));
drop policy if exists "Admins manage service availability" on public.service_availability_rules;
create policy "Admins manage service availability" on public.service_availability_rules
for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create index if not exists service_availability_rules_service_idx
  on public.service_availability_rules(service_id, is_active);
create index if not exists service_availability_rules_location_idx
  on public.service_availability_rules(country_code, region_code, state_code);

grant select on public.service_availability_rules to anon, authenticated;
grant insert, update, delete on public.service_availability_rules to authenticated;
