-- Aiquor's single-business portal. All customer access is enforced in PostgreSQL.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 120),
  role text not null default 'client' check (role in ('admin','client')),
  created_at timestamptz not null default now()
);
create table public.business_settings (
  id boolean primary key default true check (id),
  name text not null default 'Aiquor' check (length(name) between 1 and 120),
  support_email text not null default '',
  website text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.business_settings(id) values (true);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  company text not null default '' check (length(company) <= 160),
  created_at timestamptz not null default now(),
  unique(email)
);
create table public.client_members (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(client_id,user_id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  invited_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  email_sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  accepted_by uuid references public.profiles(id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  name text not null check (length(trim(name)) between 1 and 160),
  scope text not null default '' check (length(scope) <= 12000),
  status text not null default 'active' check (status in ('draft','active','on_hold','completed')),
  deadline date,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 8000),
  due_date date,
  status text not null default 'planned' check (status in ('planned','in_review','changes_requested','approved')),
  created_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones(id),
  project_id uuid not null references public.projects(id),
  notes text not null check (length(trim(notes)) between 1 and 8000),
  preview_url text not null default '' check (preview_url = '' or preview_url ~ '^https?://'),
  submitted_by uuid not null references public.profiles(id),
  author_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','changes_requested'))
);
create unique index one_pending_submission on public.submissions(milestone_id) where status = 'pending';
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id),
  project_id uuid not null references public.projects(id),
  decision text not null check (decision in ('approved','changes_requested')),
  feedback text not null default '' check (length(feedback) <= 8000),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null,
  created_at timestamptz not null default now(),
  check(decision <> 'changes_requested' or length(trim(feedback)) > 0)
);
create table public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  storage_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 255),
  size bigint not null check (size > 0 and size <= 52428800),
  mime_type text not null,
  uploaded_by uuid not null references public.profiles(id),
  author_name text not null,
  created_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  parent_id uuid references public.comments(id),
  body text not null check (length(trim(body)) between 1 and 8000),
  author_id uuid not null default auth.uid() references public.profiles(id),
  author_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('comment','review','decision')),
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index projects_client_idx on public.projects(client_id);
create index members_user_idx on public.client_members(user_id);
create index milestones_project_idx on public.milestones(project_id);
create index submissions_project_idx on public.submissions(project_id,created_at desc);
create index decisions_project_idx on public.decisions(project_id);
create index files_project_idx on public.project_files(project_id);
create index comments_project_idx on public.comments(project_id,created_at);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create index invitations_email_idx on public.invitations(email);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',''),120));
  return new;
end; $$;
create trigger clientdesk_new_user after insert on auth.users for each row execute function public.handle_new_user();
-- Also permit installation into a project where the owner already has an account.
insert into public.profiles(id,full_name) select id,left(coalesce(raw_user_meta_data->>'full_name',''),120) from auth.users on conflict do nothing;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
create function public.can_access_project(project uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id = project and
    (public.is_admin() or exists(select 1 from public.client_members m where m.client_id = p.client_id and m.user_id = auth.uid())));
$$;
create function public.can_write_project(project uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_project(project) and exists(select 1 from public.projects where id = project and not archived and status <> 'completed');
$$;
create function public.storage_project_id(path text) returns uuid language plpgsql immutable set search_path = '' as $$
begin return split_part(path,'/',1)::uuid; exception when invalid_text_representation then return null; end; $$;

create function public.notify_project(project uuid, actor uuid, event_kind text, event_message text) returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(recipient_id,project_id,kind,message)
  select distinct p.id, project, event_kind, event_message from public.profiles p
  where p.id <> actor and (p.role = 'admin' or exists(
    select 1 from public.client_members m join public.projects j on j.client_id=m.client_id
    where j.id=project and m.user_id=p.id));
$$;
create function public.prepare_comment() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id <> auth.uid() or not public.can_write_project(new.project_id) then raise exception 'Not allowed'; end if;
  if new.parent_id is not null and not exists(select 1 from public.comments where id=new.parent_id and project_id=new.project_id) then raise exception 'Reply must belong to the same project'; end if;
  select coalesce(nullif(full_name,''),'Team member') into new.author_name from public.profiles where id=auth.uid();
  return new;
end; $$;
create trigger prepare_comment before insert on public.comments for each row execute function public.prepare_comment();
create function public.notify_comment() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform public.notify_project(new.project_id,new.author_id,'comment',new.author_name || ' posted a comment.'); return new; end; $$;
create trigger notify_comment after insert on public.comments for each row execute function public.notify_comment();
create function public.touch_project() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger touch_project before update on public.projects for each row execute function public.touch_project();

create function public.accept_invitation(invitation uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.invitations; account_email text;
begin
  select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into row from public.invitations where id=invitation for update;
  if row.id is null or account_email is null or row.email <> account_email or row.revoked_at is not null or row.expires_at < now() then raise exception 'This invitation is invalid, expired, or belongs to another email address.'; end if;
  if row.accepted_at is not null then
    if row.accepted_by = auth.uid() and exists(select 1 from public.client_members where client_id=row.client_id and user_id=auth.uid()) then return row.client_id; end if;
    raise exception 'Invitation already used';
  end if;
  insert into public.client_members(client_id,user_id) values(row.client_id,auth.uid()) on conflict do nothing;
  update public.invitations set accepted_at=coalesce(accepted_at,now()),accepted_by=auth.uid() where id=row.id;
  return row.client_id;
end; $$;

create function public.submit_milestone(milestone uuid, work_notes text, work_url text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.milestones; submission_id uuid; name text;
begin
  if not public.is_admin() then raise exception 'Only the Aiquor team can submit work'; end if;
  select * into row from public.milestones where id=milestone for update;
  if row.id is null or not public.can_write_project(row.project_id) then raise exception 'Project is unavailable or read-only'; end if;
  if row.status not in ('planned','changes_requested') then raise exception 'This milestone is already submitted or approved'; end if;
  select coalesce(nullif(full_name,''),'Aiquor team') into name from public.profiles where id=auth.uid();
  insert into public.submissions(milestone_id,project_id,notes,preview_url,submitted_by,author_name)
  values(row.id,row.project_id,trim(work_notes),trim(work_url),auth.uid(),name) returning id into submission_id;
  update public.milestones set status='in_review' where id=row.id;
  perform public.notify_project(row.project_id,auth.uid(),'review','Work is ready for review: ' || row.title);
  return submission_id;
end; $$;

create function public.decide_submission(submission uuid, choice text, response text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare row public.submissions; decision_id uuid; name text;
begin
  select * into row from public.submissions where id=submission for update;
  if row.id is null or not public.can_write_project(row.project_id) or public.is_admin() then raise exception 'Only the assigned client can review this work'; end if;
  if row.status <> 'pending' then raise exception 'This submission already has a decision'; end if;
  if choice not in ('approved','changes_requested') then raise exception 'Invalid decision'; end if;
  select coalesce(nullif(full_name,''),'Client') into name from public.profiles where id=auth.uid();
  insert into public.decisions(submission_id,project_id,decision,feedback,actor_id,actor_name)
  values(row.id,row.project_id,choice,trim(response),auth.uid(),name) returning id into decision_id;
  update public.submissions set status=choice where id=row.id;
  update public.milestones set status=choice where id=row.milestone_id;
  perform public.notify_project(row.project_id,auth.uid(),'decision',name || case when choice='approved' then ' approved submitted work.' else ' requested changes.' end);
  return decision_id;
end; $$;

create function public.finalize_upload(project uuid, path text, filename text) returns uuid language plpgsql security definer set search_path = '' as $$
declare object_metadata jsonb; file_id uuid; name text;
begin
  if not public.can_write_project(project) or public.storage_project_id(path) <> project or split_part(path,'/',2) <> auth.uid()::text then raise exception 'Not allowed'; end if;
  select metadata into object_metadata from storage.objects where bucket_id='project-files' and storage.objects.name=path;
  if object_metadata is null then raise exception 'The uploaded file could not be verified'; end if;
  select coalesce(nullif(full_name,''),'Team member') into name from public.profiles where id=auth.uid();
  insert into public.project_files(project_id,storage_path,original_name,size,mime_type,uploaded_by,author_name)
  values(project,path,filename,(object_metadata->>'size')::bigint,coalesce(object_metadata->>'mimetype','application/octet-stream'),auth.uid(),name) returning id into file_id;
  return file_id;
end; $$;

alter table public.profiles enable row level security;
alter table public.business_settings enable row level security;
alter table public.clients enable row level security;
alter table public.client_members enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.submissions enable row level security;
alter table public.decisions enable row level security;
alter table public.project_files enable row level security;
alter table public.comments enable row level security;
alter table public.notifications enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy business_read on public.business_settings for select to authenticated using(true);
create policy business_update on public.business_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy clients_read on public.clients for select to authenticated using(public.is_admin() or exists(select 1 from public.client_members m where m.client_id=id and m.user_id=auth.uid()));
create policy clients_add on public.clients for insert to authenticated with check(public.is_admin());
create policy clients_edit on public.clients for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy members_read on public.client_members for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy members_remove on public.client_members for delete to authenticated using(public.is_admin());
create policy invitations_read on public.invitations for select to authenticated using(public.is_admin() or email=lower(auth.jwt()->>'email'));
create policy invitations_add on public.invitations for insert to authenticated with check(public.is_admin() and invited_by=auth.uid());
create policy invitations_edit on public.invitations for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy projects_read on public.projects for select to authenticated using(public.can_access_project(id));
create policy projects_add on public.projects for insert to authenticated with check(public.is_admin() and created_by=auth.uid());
create policy projects_edit on public.projects for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy milestones_read on public.milestones for select to authenticated using(public.can_access_project(project_id));
create policy milestones_add on public.milestones for insert to authenticated with check(public.is_admin() and public.can_write_project(project_id));
create policy milestones_edit on public.milestones for update to authenticated using(public.is_admin() and public.can_write_project(project_id)) with check(public.is_admin() and public.can_write_project(project_id));
create policy submissions_read on public.submissions for select to authenticated using(public.can_access_project(project_id));
create policy decisions_read on public.decisions for select to authenticated using(public.can_access_project(project_id));
create policy files_read on public.project_files for select to authenticated using(public.can_access_project(project_id));
create policy files_remove on public.project_files for delete to authenticated using(public.can_write_project(project_id) and (uploaded_by=auth.uid() or public.is_admin()));
create policy comments_read on public.comments for select to authenticated using(public.can_access_project(project_id));
create policy comments_add on public.comments for insert to authenticated with check(public.can_write_project(project_id) and author_id=auth.uid());
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and public.can_access_project(project_id));
create policy notifications_edit on public.notifications for update to authenticated using(recipient_id=auth.uid() and public.can_access_project(project_id)) with check(recipient_id=auth.uid() and public.can_access_project(project_id));

insert into storage.buckets(id,name,public,file_size_limit) values('project-files','project-files',false,52428800);
create policy project_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and public.can_access_project(public.storage_project_id(name)));
create policy project_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and split_part(name,'/',2)=auth.uid()::text and public.can_write_project(public.storage_project_id(name)));
create policy project_storage_delete on storage.objects for delete to authenticated using(bucket_id='project-files' and public.can_write_project(public.storage_project_id(name)) and (split_part(name,'/',2)=auth.uid()::text or public.is_admin()));

-- Restrict columns as well as rows. A profile update cannot make someone an admin.
revoke all on public.profiles,public.business_settings,public.clients,public.client_members,public.invitations,public.projects,public.milestones,public.submissions,public.decisions,public.project_files,public.comments,public.notifications from anon,authenticated;
grant select on public.profiles,public.business_settings,public.clients,public.client_members,public.invitations,public.projects,public.milestones,public.submissions,public.decisions,public.project_files,public.comments,public.notifications to authenticated;
grant update(full_name) on public.profiles to authenticated;
grant update(name,support_email,website,updated_at) on public.business_settings to authenticated;
grant insert(name,email,company),update(name,email,company) on public.clients to authenticated;
grant delete on public.client_members to authenticated;
grant insert(client_id,email,invited_by),update(email_sent_at,revoked_at) on public.invitations to authenticated;
grant insert(client_id,name,scope,status,deadline),update(client_id,name,scope,status,deadline,archived) on public.projects to authenticated;
grant insert(project_id,title,description,due_date),update(title,description,due_date) on public.milestones to authenticated;
grant insert(project_id,parent_id,body) on public.comments to authenticated;
grant delete on public.project_files to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on function public.handle_new_user(),public.notify_project(uuid,uuid,text,text),public.prepare_comment(),public.notify_comment(),public.touch_project() from public,anon,authenticated;
revoke execute on function public.is_admin(),public.can_access_project(uuid),public.can_write_project(uuid),public.storage_project_id(text),public.accept_invitation(uuid),public.submit_milestone(uuid,text,text),public.decide_submission(uuid,text,text),public.finalize_upload(uuid,text,text) from public,anon;
grant execute on function public.is_admin(),public.can_access_project(uuid),public.can_write_project(uuid),public.storage_project_id(text),public.accept_invitation(uuid),public.submit_milestone(uuid,text,text),public.decide_submission(uuid,text,text),public.finalize_upload(uuid,text,text) to authenticated;
commit;
