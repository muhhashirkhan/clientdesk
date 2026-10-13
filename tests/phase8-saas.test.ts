import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const ownerA = "10000000-0000-4000-8000-000000000001";
const memberA = "10000000-0000-4000-8000-000000000002";
const clientUserA = "10000000-0000-4000-8000-000000000003";
const ownerB = "20000000-0000-4000-8000-000000000001";

const emails: Record<string, string> = {
  [ownerA]: "owner@northstar.test",
  [memberA]: "designer@northstar.test",
  [clientUserA]: "client@acme.test",
  [ownerB]: "founder@vanguard.test",
};

test("Phase 8 Multi-Company SaaS: onboarding, tenant isolation, roles, tasks, and subscription entitlements", async (t) => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users(
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb default '{}'
    );
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant select, insert, delete on storage.objects to authenticated;
  `);

  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const filename of (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(filename, migrationDir), "utf8"));
  }

  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
      ('${ownerA}', '${emails[ownerA]}', now(), '{"full_name":"Nora Northstar"}'),
      ('${memberA}', '${emails[memberA]}', now(), '{"full_name":"Devon Designer"}'),
      ('${clientUserA}', '${emails[clientUserA]}', now(), '{"full_name":"Clara Client"}'),
      ('${ownerB}', '${emails[ownerB]}', now(), '{"full_name":"Victor Vanguard"}');
  `);

  async function asUser<T>(id: string, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: id, email: emails[id] }),
      ]);
      return (await tx.query<T>(sql, params)).rows;
    });
  }

  let companyA = "";
  let companyB = "";

  await t.test("Stage 8.1: Business owners can register and create isolated company workspaces", async () => {
    const resA = await asUser<{ create_company_workspace: string }>(
      ownerA,
      "select create_company_workspace($1, $2, $3, $4, $5, $6)",
      [
        "Northstar Digital",
        "northstar-digital",
        "Enterprise product studio",
        "support@northstar.test",
        "https://northstar.test",
        "#10b981",
      ],
    );
    companyA = resA[0].create_company_workspace;
    assert.ok(companyA);

    // Duplicate slug is rejected
    await assert.rejects(
      asUser(
        ownerB,
        "select create_company_workspace('Another Northstar', 'northstar-digital')",
      ),
      /already taken/,
    );

    const resB = await asUser<{ create_company_workspace: string }>(
      ownerB,
      "select create_company_workspace($1, $2, $3, $4, $5, $6)",
      [
        "Vanguard Labs",
        "vanguard-labs",
        "AI systems engineering",
        "hello@vanguard.test",
        "https://vanguard.test",
        "#059669",
      ],
    );
    companyB = resB[0].create_company_workspace;
    assert.ok(companyB);
    assert.notEqual(companyA, companyB);

    const profileA = (
      await asUser<{ role: string; active_company_id: string }>(
        ownerA,
        "select role, active_company_id from profiles where id = $1",
        [ownerA],
      )
    )[0];
    assert.equal(profileA.role, "admin");
    assert.equal(profileA.active_company_id, companyA);
  });

  let clientA = "";
  let projectA = "";
  let milestoneA = "";

  await t.test("Stage 8.2: Strict multi-company tenant isolation blocks cross-company reads and writes", async () => {
    clientA = (
      await asUser<{ id: string }>(
        ownerA,
        "insert into clients(company_id, name, email, company) values ($1, 'Acme Corp', $2, 'Acme Holdings') returning id",
        [companyA, emails[clientUserA]],
      )
    )[0].id;

    projectA = (
      await asUser<{ id: string }>(
        ownerA,
        "insert into projects(company_id, client_id, name, scope, status) values ($1, $2, 'Obsidian Portal v2', 'Full SaaS build', 'active') returning id",
        [companyA, clientA],
      )
    )[0].id;

    milestoneA = (
      await asUser<{ id: string }>(
        ownerA,
        "insert into milestones(project_id, title, description) values ($1, 'Architecture & RLS', 'Multi-tenant schema') returning id",
        [projectA],
      )
    )[0].id;

    // Owner B is an admin/owner of Company B, but CANNOT see Company A's company, clients, projects, or milestones
    assert.deepEqual(
      await asUser(ownerB, "select id from companies where id = $1", [companyA]),
      [],
    );
    assert.deepEqual(
      await asUser(ownerB, "select id from clients where id = $1", [clientA]),
      [],
    );
    assert.deepEqual(
      await asUser(ownerB, "select id from projects where id = $1", [projectA]),
      [],
    );
    assert.deepEqual(
      await asUser(ownerB, "select id from milestones where id = $1", [milestoneA]),
      [],
    );

    // Owner B cannot insert a project into Company A or update Company A
    await assert.rejects(
      asUser(
        ownerB,
        "insert into projects(company_id, client_id, name) values ($1, $2, 'Cross-tenant breach')",
        [companyA, clientA],
      ),
      /Client not found|row-level security/,
    );

    // Same client email can exist independently in Company B without colliding with Company A
    const clientB = (
      await asUser<{ id: string }>(
        ownerB,
        "insert into clients(company_id, name, email, company) values ($1, 'Acme Corp (Vanguard)', $2, 'Acme') returning id",
        [companyB, emails[clientUserA]],
      )
    )[0].id;
    assert.ok(clientB);
    assert.notEqual(clientA, clientB);
  });

  await t.test("Stage 8.2 & 8.4: Team invitations, role permissions (owner/admin/member/client), and workspace switching", async () => {
    const teamInviteId = (
      await asUser<{ id: string }>(
        ownerA,
        "insert into company_invitations(company_id, email, role, invited_by) values ($1, $2, 'member', $3) returning id",
        [companyA, emails[memberA], ownerA],
      )
    )[0].id;

    // Wrong user cannot accept team invite
    await assert.rejects(
      asUser(ownerB, "select accept_company_invitation($1)", [teamInviteId]),
      /another email/,
    );

    // Invited team member accepts invitation
    const joinedCompany = (
      await asUser<{ accept_company_invitation: string }>(
        memberA,
        "select accept_company_invitation($1)",
        [teamInviteId],
      )
    )[0].accept_company_invitation;
    assert.equal(joinedCompany, companyA);

    // Owner A receives an invitation notification
    const ownerNotifs = await asUser<{ kind: string; message: string }>(
      ownerA,
      "select kind, message from notifications where company_id = $1 and kind = 'invitation'",
      [companyA],
    );
    assert.equal(ownerNotifs.length, 1);
    assert.match(ownerNotifs[0].message, /accepted the team invitation/);

    // Member A ('member' role) can read and create milestones/tasks in Company A, but CANNOT update company settings or invite team members
    const updatedCompanies = await asUser(
      memberA,
      "update companies set name = 'Hijacked Name' where id = $1 returning id",
      [companyA],
    );
    assert.deepEqual(updatedCompanies, []);

    await assert.rejects(
      asUser(
        memberA,
        "insert into company_invitations(company_id, email, role, invited_by) values ($1, 'extra@northstar.test', 'member', $2)",
        [companyA, memberA],
      ),
      /row-level security/,
    );

    // Invite clientUserA to Company A's clientA
    const clientInviteId = (
      await asUser<{ id: string }>(
        ownerA,
        "insert into invitations(company_id, client_id, email, invited_by) values ($1, $2, $3, $4) returning id",
        [companyA, clientA, emails[clientUserA], ownerA],
      )
    )[0].id;
    await asUser(clientUserA, "select accept_invitation($1)", [clientInviteId]);

    // Client can switch to Company A (where they are a client), and their profile role stays 'client'
    await asUser(clientUserA, "select switch_company_workspace($1)", [companyA]);
    const clientProf = (
      await asUser<{ role: string; active_company_id: string }>(
        clientUserA,
        "select role, active_company_id from profiles where id = $1",
        [clientUserA],
      )
    )[0];
    assert.equal(clientProf.role, "client");
    assert.equal(clientProf.active_company_id, companyA);

    // Client cannot switch to Company B (until invited there)
    await assert.rejects(
      asUser(clientUserA, "select switch_company_workspace($1)", [companyB]),
      /do not have access/,
    );
  });

  await t.test("Stage 8.3: Project tasks CRUD, assignment, status tracking, and client read-only visibility", async () => {
    const task = (
      await asUser<{ id: string; company_id: string; status: string }>(
        memberA,
        `insert into project_tasks(project_id, milestone_id, title, description, status, priority, assignee_id, assignee_name, due_date, created_by)
         values ($1, $2, 'Implement multi-company RLS', 'Verify zero cross-tenant leakage', 'in_progress', 'high', $3, 'Devon Designer', '2026-11-15', $3)
         returning id, company_id, status`,
        [projectA, milestoneA, memberA],
      )
    )[0];
    assert.equal(task.company_id, companyA);
    assert.equal(task.status, "in_progress");

    // Assigned client can view project tasks
    const clientTasks = await asUser<{ id: string; title: string }>(
      clientUserA,
      "select id, title from project_tasks where project_id = $1",
      [projectA],
    );
    assert.equal(clientTasks.length, 1);

    // Assigned client CANNOT create, update, or delete tasks
    await assert.rejects(
      asUser(
        clientUserA,
        "insert into project_tasks(project_id, title, created_by) values ($1, 'Unauthorized task', $2)",
        [projectA, clientUserA],
      ),
      /row-level security/,
    );
    assert.deepEqual(
      await asUser(
        clientUserA,
        "update project_tasks set status = 'done' where id = $1 returning id",
        [task.id],
      ),
      [],
    );

    // Team member can mark task as done
    const updated = await asUser<{ status: string }>(
      memberA,
      "update project_tasks set status = 'done' where id = $1 returning status",
      [task.id],
    );
    assert.equal(updated[0].status, "done");
  });

  await t.test("Stage 8.6: Subscription plans and feature entitlement limits enforce Free vs Pro quotas", async () => {
    // Company A starts on 'free' plan (max_projects = 3) after create_company_workspace
    // Already has 1 active project (projectA). Create 2 more active projects (total = 3):
    await asUser(
      ownerA,
      "insert into projects(company_id, client_id, name, status) values ($1, $2, 'Project Two', 'active'), ($1, $2, 'Project Three', 'active')",
      [companyA, clientA],
    );

    const canCreateFourthOnFree = (
      await asUser<{ check_company_entitlement: boolean }>(
        ownerA,
        "select check_company_entitlement($1, 'projects')",
        [companyA],
      )
    )[0].check_company_entitlement;
    assert.equal(canCreateFourthOnFree, false);

    // Attempting to insert a 4th active project on Free plan is blocked by PostgreSQL RLS!
    await assert.rejects(
      asUser(
        ownerA,
        "insert into projects(company_id, client_id, name, status) values ($1, $2, 'Project Four (Exceeds Free Plan)', 'active')",
        [companyA, clientA],
      ),
      /row-level security/,
    );

    // Upgrading Company A subscription to 'pro' (max_projects = 25) unlocks creating the 4th project
    await asUser(
      ownerA,
      "update company_subscriptions set plan_id = 'pro', updated_at = now() where company_id = $1",
      [companyA],
    );

    const fourthProject = await asUser<{ id: string }>(
      ownerA,
      "insert into projects(company_id, client_id, name, status) values ($1, $2, 'Project Four (Pro Plan)', 'active') returning id",
      [companyA, clientA],
    );
    assert.equal(fourthProject.length, 1);
  });

  await db.close();
});

