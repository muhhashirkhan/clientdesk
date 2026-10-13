-- Phase 8: Multi-Company SaaS Workspaces, Onboarding, Tasks, and Subscription Architecture
-- Preserves all Phase 1-6.1 tables, audit immutability, and RLS guarantees while enforcing strict multi-company tenant isolation.
begin;

-- 1. Core Companies table
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  tagline text not null default '' check (length(tagline) <= 200),
  support_email text not null default '',
  website text not null default '',
  brand_color text not null default '#10b981' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  onboarding_completed boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the default company from existing business_settings so legacy records map cleanly
insert into public.companies (id, name, slug, support_email, website, onboarding_completed)
select
  '00000000-0000-4000-8000-000000000001'::uuid,
  coalesce(nullif(trim(name), ''), 'Aiquor'),
  'aiquor',
  support_email,
  website,
  true
from public.business_settings
where id = true
on conflict (id) do nothing;

-- 2. Company Members (owner, admin, member)
create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members(user_id);

-- Backfill existing admin profiles as owners of the default company
insert into public.company_members (company_id, user_id, role)
select '00000000-0000-4000-8000-000000000001'::uuid, id, 'owner'
from public.profiles
where role = 'admin'
on conflict do nothing;

-- 3. Company Team Invitations
create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  accepted_by uuid references public.profiles(id)
);
create index company_invitations_company_idx on public.company_invitations(company_id, created_at desc);
create index company_invitations_email_idx on public.company_invitations(email);

-- 4. Subscription Plans & Company Subscriptions (Preparation Architecture — No Live Charges)
create table public.subscription_plans (
  id text primary key check (id in ('free', 'pro', 'business')),
  name text not null,
  description text not null default '',
  price_monthly_cents integer not null check (price_monthly_cents >= 0),
  price_annual_cents integer not null check (price_annual_cents >= 0),
  max_projects integer not null check (max_projects > 0),
  max_team_members integer not null check (max_team_members > 0),
  max_clients integer not null check (max_clients > 0),
  max_storage_bytes bigint not null check (max_storage_bytes > 0),
  features jsonb not null default '[]'::jsonb
);

insert into public.subscription_plans (
  id, name, description, price_monthly_cents, price_annual_cents,
  max_projects, max_team_members, max_clients, max_storage_bytes, features
) values
  (
    'free',
    'Starter Free',
    'For solo consultants launching their first client portal.',
    0,
    0,
    3,
    2,
    5,
    104857600,
    '["Up to 3 active projects", "Up to 2 team members", "5 client portals", "100 MB private storage", "Milestone approvals & audit trail"]'::jsonb
  ),
  (
    'pro',
    'Studio Pro',
    'For growing agencies managing multiple concurrent client engagements.',
    4900,
    3900,
    25,
    15,
    50,
    10737418240,
    '["Up to 25 active projects", "Up to 15 team members", "50 client portals", "10 GB private storage", "Custom workspace branding", "Task assignments & velocity analytics"]'::jsonb
  ),
  (
    'business',
    'Enterprise Business',
    'For established studios requiring high capacity and multi-team scale.',
    14900,
    11900,
    500,
    100,
    500,
    107374182400,
    '["Up to 500 active projects", "Up to 100 team members", "500 client portals", "100 GB private storage", "Priority audit & compliance exports", "Dedicated workspace controls"]'::jsonb
  )
on conflict (id) do nothing;

create table public.company_subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan_id text not null default 'pro' references public.subscription_plans(id),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  billing_email text not null default '',
  current_period_end timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now()
);

insert into public.company_subscriptions (company_id, plan_id, status)
values ('00000000-0000-4000-8000-000000000001'::uuid, 'pro', 'active')
on conflict (company_id) do nothing;

-- 5. Extend profiles with active_company_id and email_notifications preference
alter table public.profiles
  add column if not exists active_company_id uuid references public.companies(id) on delete set null,
  add column if not exists email_notifications boolean not null default true;

update public.profiles
set active_company_id = '00000000-0000-4000-8000-000000000001'::uuid
where role = 'admin' and active_company_id is null;

-- Keep legacy profile role='admin' updates in sync with default company membership
create or replace function public.sync_profile_admin_company()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' then
    if not exists (select 1 from public.company_members where user_id = new.id) then
      insert into public.company_members (company_id, user_id, role)
      values ('00000000-0000-4000-8000-000000000001'::uuid, new.id, 'owner')
      on conflict do nothing;
    end if;
    if new.active_company_id is null then
      select company_id into new.active_company_id
      from public.company_members
      where user_id = new.id
      order by joined_at asc
      limit 1;
    end if;
  end if;
  return new;
end;
$$;

create trigger profile_admin_company_sync
before insert or update on public.profiles
for each row execute function public.sync_profile_admin_company();

-- Helper function to resolve current user's active company workspace
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select active_company_id from public.profiles where id = auth.uid()),
    (select company_id from public.company_members where user_id = auth.uid() order by joined_at asc limit 1),
    '00000000-0000-4000-8000-000000000001'::uuid
  );
$$;

-- 6. Add company_id to tenant-scoped tables and scope constraints per company
alter table public.clients
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;
alter table public.clients drop constraint if exists clients_email_key;
create unique index if not exists clients_company_email_idx on public.clients(company_id, email);
create index if not exists clients_company_idx on public.clients(company_id, created_at desc);

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select active_company_id from public.profiles where id = auth.uid()),
    (select company_id from public.company_members where user_id = auth.uid() order by joined_at asc limit 1),
    (select c.company_id from public.client_members m join public.clients c on c.id = m.client_id where m.user_id = auth.uid() order by m.joined_at asc limit 1),
    '00000000-0000-4000-8000-000000000001'::uuid
  );
$$;

alter table public.invitations
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;
create index if not exists invitations_company_idx on public.invitations(company_id, created_at desc);

alter table public.projects
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;
create index if not exists projects_company_idx on public.projects(company_id, updated_at desc);

alter table public.milestones
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;

alter table public.submissions
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;

alter table public.decisions
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;

alter table public.project_files
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;

alter table public.comments
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;

alter table public.notifications
  add column if not exists company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade;
alter table public.notifications alter column project_id drop not null;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('comment', 'review', 'decision', 'project', 'invitation'));

-- 7. Project Tasks table (Stage 8.3)
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id() references public.companies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_name text not null default '',
  due_date date,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_tasks_project_idx on public.project_tasks(project_id, created_at asc);
create index project_tasks_company_idx on public.project_tasks(company_id, due_date asc);

-- 8. Integrity Triggers: Automatically inherit and validate company_id across child records
create or replace function public.inherit_client_company()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_company uuid;
begin
  select company_id into parent_company from public.clients where id = new.client_id;
  if parent_company is null then
    raise exception 'Client not found';
  end if;
  new.company_id := parent_company;
  return new;
end;
$$;

create trigger projects_inherit_company
before insert or update of client_id on public.projects
for each row execute function public.inherit_client_company();

create trigger invitations_inherit_company
before insert or update of client_id on public.invitations
for each row execute function public.inherit_client_company();

create or replace function public.inherit_project_company()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_company uuid;
begin
  if new.project_id is null then
    return new;
  end if;
  select company_id into parent_company from public.projects where id = new.project_id;
  if parent_company is null then
    raise exception 'Project not found';
  end if;
  new.company_id := parent_company;
  return new;
end;
$$;

create trigger milestones_inherit_company
before insert on public.milestones
for each row execute function public.inherit_project_company();

create trigger submissions_inherit_company
before insert on public.submissions
for each row execute function public.inherit_project_company();

create trigger decisions_inherit_company
before insert on public.decisions
for each row execute function public.inherit_project_company();

create trigger files_inherit_company
before insert on public.project_files
for each row execute function public.inherit_project_company();

create trigger comments_inherit_company
before insert on public.comments
for each row execute function public.inherit_project_company();

create trigger notifications_inherit_company
before insert on public.notifications
for each row execute function public.inherit_project_company();

create trigger tasks_inherit_company
before insert on public.project_tasks
for each row execute function public.inherit_project_company();

-- Synchronize business_settings updates with the active company
create or replace function public.sync_business_settings_to_company()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.companies
  set
    name = new.name,
    support_email = new.support_email,
    website = new.website,
    updated_at = new.updated_at
  where id = public.current_company_id();
  return new;
end;
$$;

create trigger business_settings_company_sync
after update on public.business_settings
for each row execute function public.sync_business_settings_to_company();

-- 9. Multi-Company Authorization Helper Functions
create or replace function public.is_active_workspace(comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select active_company_id = comp from public.profiles where id = auth.uid() and active_company_id is not null),
    true
  );
$$;

create or replace function public.is_company_member(comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_workspace(comp) and exists(
    select 1 from public.company_members m
    where m.company_id = comp and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_admin(comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_workspace(comp) and exists(
    select 1 from public.company_members m
    where m.company_id = comp
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_company_owner(comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_workspace(comp) and exists(
    select 1 from public.company_members m
    where m.company_id = comp
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

create or replace function public.can_access_company(comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.company_members m
    where m.company_id = comp and m.user_id = auth.uid()
  ) or exists(
    select 1 from public.client_members m
    join public.clients c on c.id = m.client_id
    where c.company_id = comp and m.user_id = auth.uid()
  );
$$;

-- Update is_admin() and can_access_project() so they enforce company membership boundaries
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) or exists(
    select 1 from public.company_members m
    where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.can_access_project(project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.projects p
    where p.id = project
      and public.is_active_workspace(p.company_id)
      and (
        public.is_company_member(p.company_id)
        or exists(
          select 1 from public.client_members m
          where m.client_id = p.client_id and m.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.notify_project(project uuid, actor uuid, event_kind text, event_message text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(company_id, recipient_id, project_id, kind, message)
  select distinct proj.company_id, u.user_id, project, event_kind, event_message
  from public.projects proj
  join (
    select company_id, user_id from public.company_members
    union
    select c.company_id, m.user_id
    from public.client_members m
    join public.clients c on c.id = m.client_id
    join public.projects pj on pj.client_id = m.client_id
    where pj.id = project
  ) u on u.company_id = proj.company_id
  where proj.id = project and u.user_id <> actor;
$$;

-- 10. Multi-Company Onboarding, Workspace Switching & Team Invitation RPCs
create or replace function public.create_company_workspace(
  company_name text,
  company_slug text,
  company_tagline text default '',
  company_support_email text default '',
  company_website text default '',
  company_brand_color text default '#10b981'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_company_id uuid;
  clean_slug text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  clean_slug := lower(trim(company_slug));
  if exists (select 1 from public.companies where slug = clean_slug) then
    raise exception 'This workspace URL slug is already taken. Please choose another.';
  end if;

  insert into public.companies (
    name, slug, tagline, support_email, website, brand_color, onboarding_completed, created_by
  ) values (
    trim(company_name),
    clean_slug,
    trim(coalesce(company_tagline, '')),
    lower(trim(coalesce(company_support_email, ''))),
    trim(coalesce(company_website, '')),
    coalesce(nullif(trim(company_brand_color), ''), '#10b981'),
    false,
    auth.uid()
  ) returning id into new_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, auth.uid(), 'owner');

  insert into public.company_subscriptions (company_id, plan_id, status, billing_email)
  values (
    new_company_id,
    'free',
    'active',
    coalesce(nullif(lower(trim(company_support_email)), ''), coalesce(lower(auth.jwt()->>'email'), ''))
  );

  update public.profiles
  set role = 'admin', active_company_id = new_company_id
  where id = auth.uid();

  return new_company_id;
end;
$$;

create or replace function public.switch_company_workspace(target_company uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  if not public.can_access_company(target_company) then
    raise exception 'You do not have access to that company workspace.';
  end if;

  update public.profiles
  set
    active_company_id = target_company,
    role = case
      when exists (
        select 1 from public.company_members m
        where m.company_id = target_company and m.user_id = auth.uid()
      ) then 'admin'
      else 'client'
    end
  where id = auth.uid();

  return target_company;
end;
$$;

create or replace function public.accept_company_invitation(invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.company_invitations;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  select coalesce(
    (select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null),
    lower(coalesce(auth.jwt()->>'email', ''))
  ) into account_email;
  select * into inv from public.company_invitations where id = invitation_id for update;
  if inv.id is null or account_email = '' or inv.revoked_at is not null or inv.expires_at <= now() or inv.email <> account_email then
    raise exception 'This team invitation is invalid, expired, or belongs to another email address.';
  end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = auth.uid() and exists (select 1 from public.company_members where company_id = inv.company_id and user_id = auth.uid()) then
      return inv.company_id;
    end if;
    raise exception 'This team invitation was already used.';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (inv.company_id, auth.uid(), inv.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update public.company_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = inv.id;

  update public.profiles
  set role = 'admin', active_company_id = inv.company_id
  where id = auth.uid();

  insert into public.notifications (company_id, recipient_id, project_id, kind, message)
  select inv.company_id, m.user_id, null, 'invitation', account_email || ' accepted the team invitation (' || inv.role || ').'
  from public.company_members m
  where m.company_id = inv.company_id and m.user_id <> auth.uid();

  return inv.company_id;
end;
$$;

-- Also update accept_invitation(uuid) so accepting a client invitation sets active_company_id if unset while preserving email_confirmed_at and idempotency rules
create or replace function public.accept_invitation(invitation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.invitations; account_email text;
begin
  select lower(email) into account_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  select * into row from public.invitations where id = invitation for update;
  if row.id is null or account_email is null or row.email <> account_email or row.revoked_at is not null or row.expires_at < now() then
    raise exception 'This invitation is invalid, expired, or belongs to another email address.';
  end if;
  if row.accepted_at is not null then
    if row.accepted_by = auth.uid() and exists(select 1 from public.client_members where client_id = row.client_id and user_id = auth.uid()) then
      return row.client_id;
    end if;
    raise exception 'Invitation already used';
  end if;
  insert into public.client_members(client_id, user_id) values(row.client_id, auth.uid()) on conflict do nothing;
  update public.invitations set accepted_at = coalesce(accepted_at, now()), accepted_by = auth.uid() where id = row.id;
  update public.profiles set active_company_id = coalesce(active_company_id, row.company_id) where id = auth.uid();

  insert into public.notifications (company_id, recipient_id, project_id, kind, message)
  select row.company_id, m.user_id, null, 'invitation', account_email || ' accepted the client workspace invitation.'
  from public.company_members m
  where m.company_id = row.company_id and m.user_id <> auth.uid();

  return row.client_id;
end;
$$;

-- Security definer helpers to prevent cross-table RLS recursion on profiles, clients, and client_members
create or replace function public.can_access_client(target_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.id = target_client
      and public.is_active_workspace(c.company_id)
      and (
        public.is_company_member(c.company_id)
        or exists (
          select 1 from public.client_members m
          where m.client_id = c.id and m.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_manage_client(target_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.id = target_client
      and public.is_company_member(c.company_id)
  );
$$;

create or replace function public.can_read_profile(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select target_user = auth.uid() or exists (
    select 1 from public.company_members my_m
    where my_m.user_id = auth.uid()
      and (
        exists (
          select 1 from public.company_members their_m
          where their_m.company_id = my_m.company_id and their_m.user_id = target_user
        )
        or exists (
          select 1 from public.client_members cm
          join public.clients c on c.id = cm.client_id
          where c.company_id = my_m.company_id and cm.user_id = target_user
        )
      )
  );
$$;

-- Plan Limit Check RPC (Stage 8.6)
create or replace function public.check_company_entitlement(comp uuid, resource_kind text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  plan_rec public.subscription_plans;
  sub_rec public.company_subscriptions;
  current_usage bigint;
begin
  select * into sub_rec from public.company_subscriptions where company_id = comp;
  if sub_rec.company_id is null then
    select * into plan_rec from public.subscription_plans where id = 'pro';
  else
    select * into plan_rec from public.subscription_plans where id = sub_rec.plan_id;
  end if;

  if resource_kind = 'projects' then
    select count(*) into current_usage from public.projects where company_id = comp and not archived and status <> 'completed';
    return current_usage < plan_rec.max_projects;
  elsif resource_kind = 'team_members' then
    select count(*) into current_usage from public.company_members where company_id = comp;
    return current_usage < plan_rec.max_team_members;
  elsif resource_kind = 'clients' then
    select count(*) into current_usage from public.clients where company_id = comp;
    return current_usage < plan_rec.max_clients;
  end if;
  return true;
end;
$$;

-- 11. Row Level Security Policies for Multi-Company Isolation
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invitations enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.project_tasks enable row level security;

-- Companies policies
create policy companies_read on public.companies
  for select to authenticated
  using (public.can_access_company(id));

create policy companies_update on public.companies
  for update to authenticated
  using (public.is_company_admin(id))
  with check (public.is_company_admin(id));

-- Company members policies
create policy company_members_read on public.company_members
  for select to authenticated
  using (user_id = auth.uid() or public.can_access_company(company_id));

create policy company_members_insert on public.company_members
  for insert to authenticated
  with check (public.is_company_admin(company_id) and public.check_company_entitlement(company_id, 'team_members'));

create policy company_members_update on public.company_members
  for update to authenticated
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy company_members_delete on public.company_members
  for delete to authenticated
  using (public.is_company_admin(company_id) and (role <> 'owner' or public.is_company_owner(company_id)));

-- Company invitations policies
create policy company_invitations_read on public.company_invitations
  for select to authenticated
  using (public.is_company_member(company_id) or email = lower(coalesce(auth.jwt()->>'email', '')));

create policy company_invitations_insert on public.company_invitations
  for insert to authenticated
  with check (
    public.is_company_admin(company_id)
    and invited_by = auth.uid()
    and public.check_company_entitlement(company_id, 'team_members')
  );

create policy company_invitations_update on public.company_invitations
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Subscription plans & company subscriptions policies
create policy subscription_plans_read on public.subscription_plans
  for select to authenticated
  using (true);

create policy company_subscriptions_read on public.company_subscriptions
  for select to authenticated
  using (public.can_access_company(company_id));

create policy company_subscriptions_update on public.company_subscriptions
  for update to authenticated
  using (public.is_company_admin(company_id))
  with check (public.is_company_admin(company_id));

-- Project tasks policies
create policy project_tasks_read on public.project_tasks
  for select to authenticated
  using (public.is_company_member(company_id) or public.can_access_project(project_id));

create policy project_tasks_insert on public.project_tasks
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and public.can_write_project(project_id)
    and created_by = auth.uid()
  );

create policy project_tasks_update on public.project_tasks
  for update to authenticated
  using (public.is_company_member(company_id) and public.can_write_project(project_id))
  with check (public.is_company_member(company_id) and public.can_write_project(project_id));

create policy project_tasks_delete on public.project_tasks
  for delete to authenticated
  using (public.is_company_member(company_id) and public.can_write_project(project_id));

-- Tighten existing table policies to enforce strict per-company boundaries!
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (public.can_read_profile(id));

drop policy if exists clients_read on public.clients;
drop policy if exists clients_add on public.clients;
drop policy if exists clients_edit on public.clients;
create policy clients_read on public.clients
  for select to authenticated
  using (public.is_company_member(company_id) or public.can_access_client(id));
create policy clients_add on public.clients
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and public.check_company_entitlement(company_id, 'clients')
  );
create policy clients_edit on public.clients
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists members_read on public.client_members;
drop policy if exists members_remove on public.client_members;
create policy members_read on public.client_members
  for select to authenticated
  using (user_id = auth.uid() or public.can_manage_client(client_id));
create policy members_remove on public.client_members
  for delete to authenticated
  using (public.can_manage_client(client_id));

drop policy if exists invitations_read on public.invitations;
drop policy if exists invitations_add on public.invitations;
drop policy if exists invitations_edit on public.invitations;
create policy invitations_read on public.invitations
  for select to authenticated
  using (public.is_company_member(company_id) or email = lower(coalesce(auth.jwt()->>'email', '')));
create policy invitations_add on public.invitations
  for insert to authenticated
  with check (public.is_company_member(company_id) and invited_by = auth.uid());
create policy invitations_edit on public.invitations
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists projects_read on public.projects;
drop policy if exists projects_add on public.projects;
drop policy if exists projects_edit on public.projects;
create policy projects_read on public.projects
  for select to authenticated
  using (public.is_company_member(company_id) or public.can_access_project(id));
create policy projects_add on public.projects
  for insert to authenticated
  with check (
    public.is_company_member(company_id)
    and created_by = auth.uid()
    and public.check_company_entitlement(company_id, 'projects')
  );
create policy projects_edit on public.projects
  for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

drop policy if exists milestones_add on public.milestones;
drop policy if exists milestones_edit on public.milestones;
create policy milestones_add on public.milestones
  for insert to authenticated
  with check (public.is_company_member(company_id) and public.can_write_project(project_id));
create policy milestones_edit on public.milestones
  for update to authenticated
  using (public.is_company_member(company_id) and public.can_write_project(project_id))
  with check (public.is_company_member(company_id) and public.can_write_project(project_id));

drop policy if exists files_remove on public.project_files;
create policy files_remove on public.project_files
  for delete to authenticated
  using (
    public.can_write_project(project_id)
    and (uploaded_by = auth.uid() or public.is_company_member(company_id))
  );

drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_edit on public.notifications;
create policy notifications_read on public.notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    and public.is_active_workspace(company_id)
    and (
      (project_id is not null and public.can_access_project(project_id))
      or (project_id is null and public.can_access_company(company_id))
    )
  );
create policy notifications_edit on public.notifications
  for update to authenticated
  using (
    recipient_id = auth.uid()
    and public.is_active_workspace(company_id)
    and (
      (project_id is not null and public.can_access_project(project_id))
      or (project_id is null and public.can_access_company(company_id))
    )
  )
  with check (
    recipient_id = auth.uid()
    and public.is_active_workspace(company_id)
    and (
      (project_id is not null and public.can_access_project(project_id))
      or (project_id is null and public.can_access_company(company_id))
    )
  );

drop policy if exists project_storage_delete on storage.objects;
create policy project_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_write_project(public.storage_project_id(name))
    and (
      split_part(name, '/', 2) = auth.uid()::text
      or exists (
        select 1 from public.projects p
        where p.id = public.storage_project_id(name)
          and public.is_company_member(p.company_id)
      )
    )
  );

-- Update submit_milestone and decide_submission so they check company_members per project rather than global is_admin()
create or replace function public.submit_milestone(milestone uuid, work_notes text, work_url text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.milestones; submission_id uuid; name text;
begin
  select * into row from public.milestones where id = milestone for update;
  if row.id is null then
    raise exception 'Project is unavailable or read-only';
  end if;
  if not public.is_company_member(row.company_id) then
    raise exception 'Only the Aiquor team can submit work';
  end if;
  if not public.can_write_project(row.project_id) then
    raise exception 'Project is unavailable or read-only';
  end if;
  if row.status not in ('planned', 'changes_requested') then
    raise exception 'This milestone is already submitted or approved';
  end if;
  select coalesce(nullif(full_name, ''), 'Workspace team') into name from public.profiles where id = auth.uid();
  insert into public.submissions(company_id, milestone_id, project_id, notes, preview_url, submitted_by, author_name)
  values(row.company_id, row.id, row.project_id, trim(work_notes), trim(work_url), auth.uid(), name)
  returning id into submission_id;
  update public.milestones set status = 'in_review' where id = row.id;
  perform public.notify_project(row.project_id, auth.uid(), 'review', 'Work is ready for review: ' || row.title);
  return submission_id;
end;
$$;

create or replace function public.decide_submission(submission uuid, choice text, response text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.submissions; decision_id uuid; name text;
begin
  select * into row from public.submissions where id = submission for update;
  if row.id is null or not public.can_write_project(row.project_id) or public.is_company_member(row.company_id) then
    raise exception 'Only the assigned client can review this work';
  end if;
  if row.status <> 'pending' then
    raise exception 'This submission already has a decision';
  end if;
  if choice not in ('approved', 'changes_requested') then
    raise exception 'Invalid decision';
  end if;
  select coalesce(nullif(full_name, ''), 'Client') into name from public.profiles where id = auth.uid();
  insert into public.decisions(company_id, submission_id, project_id, decision, feedback, actor_id, actor_name)
  values(row.company_id, row.id, row.project_id, choice, trim(response), auth.uid(), name)
  returning id into decision_id;
  update public.submissions set status = choice where id = row.id;
  update public.milestones set status = choice where id = row.milestone_id;
  perform public.notify_project(row.project_id, auth.uid(), 'decision', name || case when choice = 'approved' then ' approved submitted work.' else ' requested changes.' end);
  return decision_id;
end;
$$;

-- 12. Grants & Column-Level Privileges
revoke all on public.companies, public.company_members, public.company_invitations, public.subscription_plans, public.company_subscriptions, public.project_tasks from anon, authenticated;

grant select on public.companies, public.company_members, public.company_invitations, public.subscription_plans, public.company_subscriptions, public.project_tasks to authenticated;

grant update (full_name, active_company_id, email_notifications) on public.profiles to authenticated;
grant update (name, tagline, support_email, website, brand_color, onboarding_completed, updated_at) on public.companies to authenticated;
grant insert (company_id, user_id, role), update (role), delete on public.company_members to authenticated;
grant insert (company_id, email, role, invited_by), update (revoked_at) on public.company_invitations to authenticated;
grant update (plan_id, status, billing_cycle, billing_email, current_period_end, updated_at) on public.company_subscriptions to authenticated;
grant insert (company_id, name, email, company), update (name, email, company) on public.clients to authenticated;
grant insert (company_id, client_id, email, invited_by), update (email_sent_at, revoked_at) on public.invitations to authenticated;
grant insert (company_id, client_id, name, scope, status, deadline), update (client_id, name, scope, status, deadline, archived) on public.projects to authenticated;
grant insert (company_id, project_id, title, description, due_date), update (title, description, due_date) on public.milestones to authenticated;
grant insert (company_id, project_id, milestone_id, title, description, status, priority, assignee_id, assignee_name, due_date, created_by), update (milestone_id, title, description, status, priority, assignee_id, assignee_name, due_date, updated_at), delete on public.project_tasks to authenticated;
grant insert (company_id, project_id, parent_id, body) on public.comments to authenticated;

grant all on all tables in schema public to service_role;

revoke execute on function
  public.sync_profile_admin_company(),
  public.inherit_client_company(),
  public.inherit_project_company(),
  public.sync_business_settings_to_company()
from public, anon, authenticated;

revoke execute on function
  public.current_company_id(),
  public.is_active_workspace(uuid),
  public.is_company_member(uuid),
  public.is_company_admin(uuid),
  public.is_company_owner(uuid),
  public.can_access_company(uuid),
  public.can_access_client(uuid),
  public.can_manage_client(uuid),
  public.can_read_profile(uuid),
  public.create_company_workspace(text, text, text, text, text, text),
  public.switch_company_workspace(uuid),
  public.accept_company_invitation(uuid),
  public.check_company_entitlement(uuid, text)
from public, anon;

grant execute on function
  public.current_company_id(),
  public.is_active_workspace(uuid),
  public.is_company_member(uuid),
  public.is_company_admin(uuid),
  public.is_company_owner(uuid),
  public.can_access_company(uuid),
  public.can_access_client(uuid),
  public.can_manage_client(uuid),
  public.can_read_profile(uuid),
  public.create_company_workspace(text, text, text, text, text, text),
  public.switch_company_workspace(uuid),
  public.accept_company_invitation(uuid),
  public.check_company_entitlement(uuid, text)
to authenticated;

commit;
