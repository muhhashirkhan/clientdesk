import { assertTestTarget } from "./test-target.mjs";
assertTestTarget();
// Run against a separate disposable Supabase test project, never production.
// This tests the real Auth, PostgREST and Storage APIs. It does NOT prove email
// delivery or browser flows; the two-inbox acceptance check remains mandatory.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
if (process.env.CLIENTDESK_TEST_PROJECT !== "true")
  throw Error(
    "Set CLIENTDESK_TEST_PROJECT=true only for a dedicated test project.",
  );
for (const k of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
])
  if (!process.env[k]) throw Error(`Missing ${k}`);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const fresh = () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [],
  clients = [],
  projects = [],
  paths = [];
const run = randomUUID();
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
try {
  for (const role of ["admin", "client", "other"]) {
    const email = `clientdesk-${role}-${run}@example.test`,
      password = randomBytes(32).toString("base64url");
    const { user } = must(
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Test ${role}` },
      }),
    );
    users.push({ id: user.id, email, password, db: fresh() });
    if (role === "admin")
      must(
        await service
          .from("profiles")
          .update({ role: "admin" })
          .eq("id", user.id),
      );
    must(await users.at(-1).db.auth.signInWithPassword({ email, password }));
  }
  const [admin, client, other] = users;
  const anonymous = fresh();
  const anonymousRead = await anonymous.from("projects").select();
  assert(anonymousRead.error || anonymousRead.data.length === 0);
  const customer = must(
    await admin.db
      .from("clients")
      .insert({ name: "Disposable acceptance test", email: client.email })
      .select()
      .single(),
  );
  clients.push(customer.id);
  const project = must(
    await admin.db
      .from("projects")
      .insert({
        name: "Acceptance test",
        client_id: customer.id,
        scope: "Verify persistence and isolation",
        status: "active",
      })
      .select()
      .single(),
  );
  projects.push(project.id);
  assert.equal(must(await client.db.from("projects").select()).length, 0);
  const invitation = must(
    await admin.db
      .from("invitations")
      .insert({
        client_id: customer.id,
        email: client.email,
        invited_by: admin.id,
      })
      .select()
      .single(),
  );
  assert(
    (await other.db.rpc("accept_invitation", { invitation: invitation.id }))
      .error,
  );
  must(await client.db.rpc("accept_invitation", { invitation: invitation.id }));
  for (const invalid of [{expires_at:new Date(Date.now()-86400000).toISOString()}, {revoked_at:new Date().toISOString()}]) {
    const expired = must(await service.from("invitations").insert({client_id:customer.id,email:client.email,invited_by:admin.id,...invalid}).select().single());
    assert((await client.db.rpc("accept_invitation",{invitation:expired.id})).error);
  }
  assert((await client.db.rpc("accept_invitation",{invitation:randomUUID()})).error);
  const path = `${project.id}/${client.id}/${randomUUID()}-acceptance.txt`,
    contents = `Saved ClientDesk file ${run}`;
  paths.push(path);
  must(
    await client.db.storage
      .from("project-files")
      .upload(path, new Blob([contents], { type: "text/plain" })),
  );
  must(
    await client.db.rpc("finalize_upload", {
      project: project.id,
      path,
      filename: "acceptance.txt",
    }),
  );
  assert.equal(
    await must(
      await client.db.storage.from("project-files").download(path),
    ).text(),
    contents,
  );
  assert((await other.db.storage.from("project-files").download(path)).error);
  assert(
    (await other.db.storage.from("project-files").createSignedUrl(path, 60))
      .error,
  );
  const comment = must(
    await client.db
      .from("comments")
      .insert({ project_id: project.id, body: "Here is the brief." })
      .select()
      .single(),
  );
  must(
    await admin.db.from("comments").insert({
      project_id: project.id,
      parent_id: comment.id,
      body: "Received.",
    }),
  );
  const milestone = must(
    await admin.db
      .from("milestones")
      .insert({ project_id: project.id, title: "First delivery" })
      .select()
      .single(),
  );
  const submission = must(
    await admin.db.rpc("submit_milestone", {
      milestone: milestone.id,
      work_notes: "First revision",
      work_url: "",
    }),
  );
  assert(
    (
      await other.db.rpc("decide_submission", {
        submission,
        choice: "approved",
        response: "",
      })
    ).error,
  );
  must(
    await client.db.rpc("decide_submission", {
      submission,
      choice: "changes_requested",
      response: "Make the logo larger.",
    }),
  );
  const revision = must(
    await admin.db.rpc("submit_milestone", {
      milestone: milestone.id,
      work_notes: "Updated logo",
      work_url: "",
    }),
  );
  must(
    await client.db.rpc("decide_submission", {
      submission: revision,
      choice: "approved",
      response: "Approved.",
    }),
  );
  assert(
    (
      await client.db.rpc("decide_submission", {
        submission: revision,
        choice: "approved",
        response: "",
      })
    ).error,
  );
  must(await client.db.auth.signOut());
  client.db = fresh();
  must(
    await client.db.auth.signInWithPassword({
      email: client.email,
      password: client.password,
    }),
  );
  assert.equal(
    must(
      await client.db
        .from("milestones")
        .select("status")
        .eq("id", milestone.id)
        .single(),
    ).status,
    "approved",
  );
  const decisions = must(
    await client.db.from("decisions").select().eq("project_id", project.id),
  );
  assert.equal(decisions.length, 2);
  assert(
    decisions.every((d) => d.actor_name === "Test client" && d.created_at),
  );
  assert.equal(
    must(await client.db.from("comments").select().eq("project_id", project.id))
      .length,
    2,
  );
  assert.equal(
    must(
      await client.db
        .from("project_files")
        .select()
        .eq("project_id", project.id),
    ).length,
    1,
  );
  for (const table of [
    "projects",
    "milestones",
    "comments",
    "submissions",
    "decisions",
    "project_files",
  ])
    assert.equal(
      must(await other.db.from(table).select()).length,
      0,
      `${table} leaked`,
    );
  // Settings, notification mutations, project edits and read-only enforcement.
  const profileUpdate = must(await client.db.from("profiles").update({full_name:"Updated test client"}).eq("id",client.id).select("full_name").single());
  assert.equal(profileUpdate.full_name,"Updated test client");
  assert((await client.db.from("profiles").update({role:"admin"}).eq("id",client.id)).error);
  const business = must(await admin.db.from("business_settings").select().single());
  assert.equal(must(await client.db.from("business_settings").update({name:"Unauthorized"}).eq("id",true).select()).length,0);
  try {
    must(await admin.db.from("business_settings").update({name:"Disposable test studio"}).eq("id",true));
    assert.equal(must(await client.db.from("business_settings").select("name").single()).name,"Disposable test studio");
  } finally {
    must(await service.from("business_settings").update({name:business.name}).eq("id",true));
  }
  const notices = must(await client.db.from("notifications").select().is("read_at",null));
  assert(notices.length > 0);
  must(await client.db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",notices[0].id));
  assert(must(await client.db.from("notifications").select().eq("id",notices[0].id).single()).read_at);
  assert.equal(must(await other.db.from("notifications").select()).length,0);
  must(await admin.db.from("projects").update({scope:"Edited persisted scope"}).eq("id",project.id));
  assert.equal(must(await client.db.from("projects").select("scope").eq("id",project.id).single()).scope,"Edited persisted scope");
  for (const state of [{archived:true},{archived:false,status:"completed"}]) {
    must(await admin.db.from("projects").update(state).eq("id",project.id));
    assert((await client.db.from("comments").insert({project_id:project.id,body:"Blocked write"})).error);
    assert((await admin.db.from("milestones").insert({project_id:project.id,title:"Blocked milestone"})).error);
  }
  must(await admin.db.from("projects").update({archived:false,status:"active"}).eq("id",project.id));
  must(await client.db.storage.from("project-files").remove([path]));
  const file = must(await client.db.from("project_files").select("id").eq("project_id",project.id).single());
  must(await client.db.from("project_files").delete().eq("id",file.id));
  assert.equal(must(await client.db.from("project_files").select().eq("id",file.id)).length,0);
  must(
    await admin.db
      .from("client_members")
      .delete()
      .eq("client_id", customer.id)
      .eq("user_id", client.id),
  );
  assert.equal(must(await client.db.from("projects").select()).length, 0);
  assert(
    (await client.db.rpc("accept_invitation", { invitation: invitation.id }))
      .error,
  );
  console.log(
    "PASS: real API login, membership, file upload/download/delete, replies, changes, approval, profile/business settings, notifications, project edits/archive/completion, re-login persistence and third-account isolation. Email/browser acceptance still required.",
  );
} finally {
  const errors = [];
  const clean = async (query) => {
    try {
      const result = await query;
      if (result.error) errors.push(result.error.message);
    } catch (e) {
      errors.push(e.message);
    }
  };
  if (paths.length)
    await clean(service.storage.from("project-files").remove(paths));
  for (const id of projects) {
    // Audit rows deliberately restrict project deletion. Only this script's
    // disposable project IDs are removed, in foreign-key dependency order.
    for (const table of [
      "decisions",
      "submissions",
      "comments",
      "project_files",
      "milestones",
      "notifications",
    ]) {
      await clean(service.from(table).delete().eq("project_id", id));
    }
    await clean(service.from("projects").delete().eq("id", id));
  }
  for (const id of clients)
    await clean(service.from("clients").delete().eq("id", id));
  for (const user of users) await clean(service.auth.admin.deleteUser(user.id));
  if (errors.length)
    throw Error("Test cleanup incomplete: " + errors.join("; "));
}
