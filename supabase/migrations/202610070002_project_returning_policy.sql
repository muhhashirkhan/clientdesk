-- INSERT ... RETURNING evaluates the SELECT policy before a STABLE helper can
-- observe the inserted row. Authorize administrators directly in that policy.
begin;
drop policy projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (public.is_admin() or public.can_access_project(id));
commit;
