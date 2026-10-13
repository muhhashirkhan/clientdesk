import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const admin = "11111111-1111-4111-8111-111111111111",
  alice = "22222222-2222-4222-8222-222222222222",
  bob = "33333333-3333-4333-8333-333333333333";
const clientA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clientB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  project = "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  other = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  milestone = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const emails = {
  [admin]: "admin@example.test",
  [alice]: "alice@example.test",
  [bob]: "bob@example.test",
};

test("PostgreSQL policies enforce the complete review workflow and client isolation", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const filename of (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(filename, migrationDir), "utf8"));
  }
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('${admin}','${emails[admin]}',now(),'{"full_name":"Aiquor Admin"}'),('${alice}','${emails[alice]}',now(),'{"full_name":"Alice Client"}'),('${bob}','${emails[bob]}',now(),'{"full_name":"Bob Client"}');
 update public.profiles set role='admin' where id='${admin}';
 insert into clients(id,name,email) values('${clientA}','Client A','${emails[alice]}'),('${clientB}','Client B','${emails[bob]}');
 insert into client_members(client_id,user_id) values('${clientB}','${bob}');
 insert into projects(id,client_id,name,created_by) values('${project}','${clientA}','Website','${admin}'),('${other}','${clientB}','Other client','${admin}');
 insert into milestones(id,project_id,title) values('${milestone}','${project}','Website design');`);
  async function asUser<T>(id: string, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: id, email: emails[id as keyof typeof emails] }),
      ]);
      return (await tx.query<T>(sql, params)).rows;
    });
  }
  await t.test(
    "admin can create a project and return the saved record in one request",
    async () => {
      const rows = await asUser<{ id: string }>(
        admin,
        "insert into projects(client_id,name) values($1,'Returning regression') returning id",
        [clientA],
      );
      assert.equal(rows.length, 1);
      await db.query("delete from projects where id=$1", [rows[0].id]);
    },
  );
  await t.test("anonymous accounts cannot read project data", async () => {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query("select * from projects");
      }),
      /permission denied/,
    );
  });
  await t.test("new client has an honest empty project list", async () => {
    assert.deepEqual(await asUser(alice, "select * from projects"), []);
  });
  const invitation = (
    await asUser<{ id: string }>(
      admin,
      "insert into invitations(client_id,email,invited_by) values($1,$2,$3) returning id",
      [clientA, emails[alice], admin],
    )
  )[0].id;
  await t.test(
    "an invitation cannot be claimed by a different account",
    async () => {
      await assert.rejects(
        asUser(bob, "select accept_invitation($1)", [invitation]),
        /another email/,
      );
    },
  );
  await t.test(
    "the verified invited client can accept and see the assigned project",
    async () => {
      await asUser(alice, "select accept_invitation($1)", [invitation]);
      assert.equal((await asUser(alice, "select * from projects")).length, 1);
      assert.equal((await asUser(admin, "select * from projects")).length, 2);
    },
  );
  await t.test(
    "clients cannot elevate their role or create projects",
    async () => {
      await assert.rejects(
        asUser(alice, "update profiles set role='admin' where id=$1", [alice]),
        /permission denied/,
      );
      await assert.rejects(
        asUser(
          alice,
          "insert into projects(client_id,name) values($1,'Intrusion')",
          [clientA],
        ),
        /row-level security/,
      );
    },
  );
  await t.test(
    "clients cannot read other clients, projects or files",
    async () => {
      assert.deepEqual(
        await asUser(bob, "select * from projects where id=$1", [project]),
        [],
      );
      assert.deepEqual(
        await asUser(bob, "select * from clients where id=$1", [clientA]),
        [],
      );
      assert.deepEqual(
        await asUser(bob, "select * from milestones where project_id=$1", [
          project,
        ]),
        [],
      );
    },
  );
  const path = `${project}/${alice}/test-logo.txt`;
  await t.test(
    "private storage accepts an assigned client upload and rejects a different client",
    async () => {
      await asUser(
        alice,
        'insert into storage.objects(bucket_id,name,metadata) values(\'project-files\',$1,\'{"size":25,"mimetype":"text/plain"}\')',
        [path],
      );
      await assert.rejects(
        asUser(
          bob,
          "insert into storage.objects(bucket_id,name,metadata) values('project-files',$1,'{}')",
          [`${project}/${bob}/unauthorized.txt`],
        ),
        /row-level security/,
      );
      assert.deepEqual(
        await asUser(bob, "select * from storage.objects where name=$1", [
          path,
        ]),
        [],
      );
    },
  );
  await t.test(
    "upload metadata is based on an existing private object",
    async () => {
      await asUser(alice, "select finalize_upload($1,$2,$3)", [
        project,
        path,
        "test-logo.txt",
      ]);
      await assert.rejects(
        asUser(alice, "select finalize_upload($1,$2,$3)", [
          project,
          `${project}/${alice}/missing.txt`,
          "missing.txt",
        ]),
        /could not be verified/,
      );
      assert.equal(
        (
          await asUser<{ size: number }>(
            alice,
            "select size from project_files",
          )
        )[0].size,
        25,
      );
      assert.deepEqual(await asUser(bob, "select * from project_files"), []);
    },
  );
  await t.test(
    "comments and replies persist and reject cross-project parents",
    async () => {
      const root = (
        await asUser<{ id: string }>(
          alice,
          "insert into comments(project_id,body) values($1,'Here is our logo.') returning id",
          [project],
        )
      )[0].id;
      await asUser(
        admin,
        "insert into comments(project_id,parent_id,body) values($1,$2,'Received, thank you.')",
        [project, root],
      );
      assert.equal((await asUser(alice, "select * from comments")).length, 2);
      await assert.rejects(
        asUser(
          bob,
          "insert into comments(project_id,parent_id,body) values($1,$2,'Cross-project reply')",
          [other, root],
        ),
        /same project/,
      );
      assert.deepEqual(await asUser(bob, "select * from comments"), []);
    },
  );
  let submission = "";
  await t.test(
    "admin submits work, notifications are scoped, and clients cannot self-submit",
    async () => {
      submission = (
        await asUser<{ submit_milestone: string }>(
          admin,
          "select submit_milestone($1,$2,$3)",
          [milestone, "Design is ready.", "https://example.com/preview"],
        )
      )[0].submit_milestone;
      assert.equal(
        (
          await asUser<{ status: string }>(
            alice,
            "select status from milestones",
          )
        )[0].status,
        "in_review",
      );
      await assert.rejects(
        asUser(alice, "select submit_milestone($1,$2,$3)", [
          milestone,
          "Bypass",
          "",
        ]),
        /Only the Aiquor/,
      );
      await assert.rejects(
        asUser(alice, "update milestones set status='approved' where id=$1", [
          milestone,
        ]),
        /permission denied/,
      );
      assert.deepEqual(await asUser(bob, "select * from notifications"), []);
      assert((await asUser(alice, "select * from notifications")).length > 0);
    },
  );
  await t.test(
    "a different client and the admin cannot approve client work",
    async () => {
      for (const actor of [bob, admin])
        await assert.rejects(
          asUser(actor, "select decide_submission($1,'approved','')", [
            submission,
          ]),
          /Only the assigned client/,
        );
    },
  );
  await t.test(
    "the client requests changes; the saved decision records the name and time",
    async () => {
      await assert.rejects(
        asUser(alice, "select decide_submission($1,'changes_requested','')", [
          submission,
        ]),
        /check constraint/,
      );
      await asUser(
        alice,
        "select decide_submission($1,'changes_requested','Please enlarge the logo.')",
        [submission],
      );
      const rows = await asUser<{
        actor_name: string;
        created_at: string;
        feedback: string;
      }>(alice, "select * from decisions");
      assert.equal(rows[0].actor_name, "Alice Client");
      assert(rows[0].created_at);
      assert.equal(rows[0].feedback, "Please enlarge the logo.");
    },
  );
  await t.test(
    "revised work can be approved once and audit history is immutable",
    async () => {
      const revised = (
        await asUser<{ submit_milestone: string }>(
          admin,
          "select submit_milestone($1,$2,$3)",
          [milestone, "Logo enlarged.", "https://example.com/revised"],
        )
      )[0].submit_milestone;
      await asUser(
        alice,
        "select decide_submission($1,'approved','Looks good.')",
        [revised],
      );
      await assert.rejects(
        asUser(
          alice,
          "select decide_submission($1,'changes_requested','Again')",
          [revised],
        ),
        /already has a decision/,
      );
      assert.equal((await asUser(alice, "select * from decisions")).length, 2);
      assert.equal(
        (
          await asUser<{ status: string }>(
            alice,
            "select status from milestones",
          )
        )[0].status,
        "approved",
      );
      await assert.rejects(
        asUser(admin, "delete from decisions where submission_id=$1", [
          revised,
        ]),
        /permission denied/,
      );
    },
  );
  await t.test(
    "fresh authenticated requests see saved state; another account still sees none",
    async () => {
      assert.equal(
        (await asUser(alice, "select * from project_files")).length,
        1,
      );
      for (const table of [
        "submissions",
        "decisions",
        "comments",
        "project_files",
      ])
        assert.deepEqual(await asUser(bob, `select * from ${table}`), []);
    },
  );
  await t.test(
    "archive makes both comments and storage writes read-only",
    async () => {
      await asUser(admin, "update projects set archived=true where id=$1", [
        project,
      ]);
      await assert.rejects(
        asUser(
          alice,
          "insert into comments(project_id,body) values($1,'No write')",
          [project],
        ),
        /Not allowed/,
      );
      await assert.rejects(
        asUser(
          alice,
          "insert into storage.objects(bucket_id,name) values('project-files',$1)",
          [`${project}/${alice}/archived.txt`],
        ),
        /row-level security/,
      );
      assert.equal(
        (await asUser(alice, "select * from project_files")).length,
        1,
      );
      await asUser(admin, "update projects set archived=false where id=$1", [
        project,
      ]);
    },
  );
  await t.test(
    "completed projects enforce read-only rules on milestones, comments and storage",
    async () => {
      await asUser(
        admin,
        "update projects set status='completed' where id=$1",
        [project],
      );
      await assert.rejects(
        asUser(
          admin,
          "insert into milestones(project_id,title) values($1,'Late milestone')",
          [project],
        ),
        /row-level security/,
      );
      await assert.rejects(
        asUser(
          alice,
          "insert into comments(project_id,body) values($1,'Post-completion write')",
          [project],
        ),
        /Not allowed/,
      );
      await assert.rejects(
        asUser(
          alice,
          "insert into storage.objects(bucket_id,name) values('project-files',$1)",
          [`${project}/${alice}/completed.txt`],
        ),
        /row-level security/,
      );
      await asUser(admin, "update projects set status='active' where id=$1", [
        project,
      ]);
    },
  );
  await t.test(
    "notifications and business settings enforce recipient and admin boundaries",
    async () => {
      const unreadBefore = await asUser<{ id: string; read_at: string | null }>(
        alice,
        "select id,read_at from notifications where read_at is null",
      );
      assert(unreadBefore.length > 0);
      await asUser(
        alice,
        "update notifications set read_at=now() where id=$1",
        [unreadBefore[0].id],
      );
      const afterMark = await asUser<{ read_at: string | null }>(
        alice,
        "select read_at from notifications where id=$1",
        [unreadBefore[0].id],
      );
      assert(afterMark[0].read_at !== null);
      const unauthorizedBizUpdate = await asUser<{ id: boolean }>(
        alice,
        "update business_settings set name='Unauthorized' where id=true returning id",
      );
      assert.deepEqual(unauthorizedBizUpdate, []);
      assert.equal(
        (
          await asUser<{ name: string }>(
            alice,
            "select name from business_settings where id=true",
          )
        )[0].name,
        "Aiquor",
      );
      await asUser(
        admin,
        "update business_settings set name='Aiquor Studio' where id=true",
      );
      const biz = await asUser<{ name: string }>(
        alice,
        "select name from business_settings where id=true",
      );
      assert.equal(biz[0].name, "Aiquor Studio");
    },
  );
  await t.test(
    "removing access revokes storage and cannot be undone by replaying an accepted invitation",
    async () => {
      await asUser(
        admin,
        "delete from client_members where client_id=$1 and user_id=$2",
        [clientA, alice],
      );
      assert.deepEqual(await asUser(alice, "select * from projects"), []);
      assert.deepEqual(
        await asUser(alice, "select * from storage.objects where name=$1", [
          path,
        ]),
        [],
      );
      await assert.rejects(
        asUser(alice, "select accept_invitation($1)", [invitation]),
        /already used/,
      );
    },
  );
  await t.test(
    "paginated history preserves invitations and approval decisions beyond 200 records",
    async () => {
      const reInvite = (
        await asUser<{ id: string }>(
          admin,
          "insert into invitations(client_id,email,invited_by) values($1,$2,$3) returning id",
          [clientA, emails[alice], admin],
        )
      )[0].id;
      await asUser(alice, "select accept_invitation($1)", [reInvite]);

      const oldInvite = (
        await asUser<{ id: string }>(
          admin,
          "insert into invitations(client_id,email,invited_by) values($1,$2,$3) returning id",
          [clientB, emails[bob], admin],
        )
      )[0].id;
      await db.query(
        "update invitations set created_at = now() - interval '3 days' where id = $1",
        [oldInvite],
      );
      await db.query(
        "insert into invitations(client_id,email,invited_by,created_at,revoked_at) select $1,$2,$3,now() - (g || ' seconds')::interval,now() from generate_series(1,210) g",
        [clientA, emails[alice], admin],
      );
      const scopedInvites = await asUser<{ id: string; client_id: string }>(
        admin,
        "select id,client_id from invitations where client_id = any($1::uuid[]) order by created_at desc, id desc",
        [[clientB]],
      );
      assert.equal(scopedInvites.length, 1);
      assert.equal(scopedInvites[0].id, oldInvite);

      await db.query(
        `with gen as (
           select g, gen_random_uuid() as sub_id
           from generate_series(1, 205) g
         ),
         ins_sub as (
           insert into public.submissions(id,milestone_id,project_id,notes,preview_url,submitted_by,author_name,status,created_at)
           select sub_id, $1, $2, 'Batch deliverable ' || g, 'https://example.com/' || g, $3, 'Ada Admin', 'approved', now() - ((g + 10) || ' minutes')::interval
           from gen
           returning id
         )
         insert into public.decisions(submission_id,project_id,decision,feedback,actor_id,actor_name,created_at)
         select sub_id, $2, 'approved', 'Approved batch ' || g, $4, 'Alice Client', now() - ((g + 9) || ' minutes')::interval
         from gen`,
        [milestone, project, admin, alice],
      );

      const totalApproved = (
        await asUser<{ count: string }>(
          alice,
          "select count(*)::text as count from submissions where status='approved'",
        )
      )[0].count;
      assert(Number(totalApproved) >= 206);

      // Fetch the last page (records beyond #200) as authenticated client and verify each submission still resolves its immutable decision
      const oldestPage = await asUser<{ id: string }>(
        alice,
        "select id from submissions where status='approved' order by created_at desc, id desc limit 24 offset 192",
      );
      assert(oldestPage.length >= 14);
      const oldestIds = oldestPage.map((r) => r.id);
      const matchedDecisions = await asUser<{ submission_id: string }>(
        alice,
        "select submission_id from decisions where submission_id = any($1::uuid[])",
        [oldestIds],
      );
      assert.equal(matchedDecisions.length, oldestIds.length);
    },
  );
  await db.close();
});


