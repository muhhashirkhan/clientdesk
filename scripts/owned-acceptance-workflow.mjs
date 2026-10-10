// Explicitly authorized acceptance workflow using the owner's two inboxes.
// No passwords or session tokens are stored or printed.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const fixture = JSON.parse(
  await readFile("test-results/owned-acceptance.json", "utf8"),
);
const { projectId, clientId } = fixture,
  base = process.env.CLIENTDESK_ACCEPTANCE_ORIGIN || "http://localhost:3012",
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const userList = must(
  await service.auth.admin.listUsers({ perPage: 1000 }),
).users;
const clientUser = userList.find((u) => u.email === "imeanhashir88@gmail.com");
if (!clientUser?.email_confirmed_at)
  throw Error("The owned client must accept the invitation first.");
const member = must(
  await service
    .from("client_members")
    .select("user_id")
    .eq("client_id", clientId)
    .eq("user_id", clientUser.id)
    .maybeSingle(),
);
if (!member)
  throw Error("The owned client has not accepted project membership yet.");
const browser = await chromium.launch();
const contexts = [];
const errors = [];
let otherId;
async function account(email) {
  const link = must(
    await service.auth.admin.generateLink({ type: "magiclink", email }),
  );
  let cookies = [];
  const auth = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies,
      setAll: (v) => {
        cookies = v;
      },
    },
  });
  must(
    await auth.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    }),
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: new URL(base).hostname,
      path: "/",
      sameSite: "Lax",
      httpOnly: false,
      secure: base.startsWith("https:"),
    })),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  return { page, context, db: auth };
}
const route = (tab = "overview") =>
  base + "/projects/" + projectId + "?tab=" + tab;
const suffix = randomUUID().slice(0, 8),
  fileName = "acceptance-" + suffix + ".txt",
  contents = "ClientDesk real upload, " + suffix + "\n";
try {
  const admin = await account("hello@getaiquor.com"),
    client = await account("imeanhashir88@gmail.com");
  await client.page.goto(route("files"));
  await client.page
    .locator('input[type="file"]')
    .setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(contents),
    });
  await client.page
    .getByRole("button", { name: "Upload file", exact: true })
    .click();
  await client.page
    .getByText("File uploaded and saved.", { exact: true })
    .waitFor();
  await client.page.reload();
  await client.page.getByText(fileName, { exact: true }).waitFor();
  const file = must(
    await client.db
      .from("project_files")
      .select("id,storage_path")
      .eq("project_id", projectId)
      .eq("original_name", fileName)
      .single(),
  );
  const download = await client.context.request.get(base + "/files/" + file.id);
  assert.equal(download.status(), 200);
  assert.equal(await download.text(), contents);
  await client.page.goto(route("discussion"));
  await client.page
    .getByLabel("Your message", { exact: true })
    .fill("Acceptance " + suffix + ": uploaded the requirements.");
  await client.page
    .getByRole("button", { name: "Post comment", exact: true })
    .click();
  await client.page.getByText("Comment posted.", { exact: true }).waitFor();
  await admin.page.goto(route("discussion"));
  const comment = admin.page
    .locator(".comment")
    .filter({
      hasText: "Acceptance " + suffix + ": uploaded the requirements.",
    })
    .first();
  const replySummary = comment.locator("summary").filter({ hasText: "Reply" });
  await replySummary.click();
  await comment
    .getByLabel("Your reply", { exact: true })
    .fill("Acceptance " + suffix + ": received and reviewed.");
  await comment
    .getByRole("button", { name: "Post reply", exact: true })
    .click();
  await comment.getByText("Comment posted.", { exact: true }).waitFor();
  await admin.page.goto(route("milestones"));
  await admin.page.locator(".create-panel summary").click();
  const add = admin.page.locator(".create-panel form");
  await add
    .getByLabel("Milestone title", { exact: true })
    .fill("Acceptance delivery " + suffix);
  await add
    .getByLabel("Deliverables", { exact: true })
    .fill("Verify saved client feedback and approval.");
  await add.getByRole("button", { name: "Add milestone", exact: true }).click();
  await admin.page.getByText("Milestone added.", { exact: true }).waitFor();
  let card = admin.page
    .locator(".milestone-card")
    .filter({ hasText: "Acceptance delivery " + suffix });
  await card.getByText("Submit work for review", { exact: true }).click();
  await card
    .getByLabel("What is ready for review?", { exact: true })
    .fill("Acceptance first version " + suffix);
  await card
    .getByRole("button", { name: "Submit for client review", exact: true })
    .click();
  await card
    .locator(".badge.in_review")
    .waitFor();
  await client.page.goto(route("approvals"));
  let review = client.page
    .locator(".review-card")
    .filter({ hasText: "Acceptance first version " + suffix });
  await review
    .locator("summary")
    .filter({ hasText: "Request changes" })
    .click();
  await review
    .getByLabel("What needs to change?", { exact: true })
    .fill("Acceptance " + suffix + ": increase the logo size.");
  await review
    .getByRole("button", { name: "Send change request", exact: true })
    .click();
  await review
    .locator(".decision-record")
    .waitFor();
  await admin.page.goto(route("milestones"));
  card = admin.page
    .locator(".milestone-card")
    .filter({ hasText: "Acceptance delivery " + suffix });
  await card.getByText("Submit revised work", { exact: true }).click();
  await card
    .getByLabel("What is ready for review?", { exact: true })
    .fill("Acceptance revised version " + suffix);
  await card
    .getByRole("button", { name: "Submit for client review", exact: true })
    .click();
  await card
    .locator(".badge.in_review")
    .waitFor();
  await client.page.goto(route("approvals"));
  review = client.page
    .locator(".review-card")
    .filter({ hasText: "Acceptance revised version " + suffix });
  await review
    .getByRole("button", { name: "Approve work", exact: true })
    .click();
  await review
    .locator(".decision-record")
    .waitFor();
  await client.page.reload();
  await client.page
    .getByText("Acceptance " + suffix + ": increase the logo size.", {
      exact: true,
    })
    .waitFor();
  const milestone = must(
    await client.db
      .from("milestones")
      .select("id,status")
      .eq("project_id", projectId)
      .eq("title", "Acceptance delivery " + suffix)
      .single(),
  );
  assert.equal(milestone.status, "approved");
  const submissions = must(
    await client.db
      .from("submissions")
      .select("id")
      .eq("milestone_id", milestone.id),
  );
  const decisions = must(
    await client.db
      .from("decisions")
      .select("actor_id,actor_name,created_at")
      .in(
        "submission_id",
        submissions.map((s) => s.id),
      ),
  );
  assert.equal(decisions.length, 2);
  assert(
    decisions.every(
      (d) => d.actor_id === clientUser.id && d.actor_name && d.created_at,
    ),
  );
  await mkdir("test-results", { recursive: true });
  await client.page.screenshot({
    path: "test-results/owned-approvals-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 768, 1440]) {
    await client.page.setViewportSize({ width, height: 950 });
    for (const tab of [
      "overview",
      "milestones",
      "files",
      "discussion",
      "approvals",
    ]) {
      await client.page.goto(route(tab));
      await client.page.getByRole("heading", { name: "ClientDesk acceptance test", exact: true }).waitFor();
      assert.equal(
        await client.page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${tab} overflows at ${width}`,
      );
    }
    if (width === 390)
      await client.page.screenshot({
        path: "test-results/owned-project-mobile.png",
        fullPage: true,
      });
  }
  await client.page.goto(base + "/settings");
  await client.page
    .locator(".settings-signout")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await client.page.waitForURL("**/login");
  const returned = await account("imeanhashir88@gmail.com");
  await returned.page.goto(route("files"));
  await returned.page.getByText(fileName, { exact: true }).waitFor();
  await returned.page.goto(route("approvals"));
  await returned.page
    .getByText("Acceptance revised version " + suffix, { exact: true })
    .waitFor();
  const otherEmail = "clientdesk-isolation-" + randomUUID() + "@example.test";
  otherId = must(
    await service.auth.admin.createUser({
      email: otherEmail,
      email_confirm: true,
      user_metadata: { full_name: "Disposable isolation account" },
    }),
  ).user.id;
  const other = await account(otherEmail);
  await other.page.goto(route());
  // Next.js can stream notFound content with a 200 response after headers flush.
  await other.page.getByRole("heading", { name: "This page isn’t in your workspace." }).waitFor();
  assert.equal(
    must(await other.db.from("projects").select("id").eq("id", projectId))
      .length,
    0,
  );
  assert(
    (
      await other.db.storage
        .from("project-files")
        .createSignedUrl(file.storage_path, 60)
    ).error,
  );
  assert.equal(
    (await other.context.request.get(base + "/files/" + file.id)).status(),
    404,
  );
  await admin.page.goto(base + "/settings");
  const business = admin.page
    .locator(".panel")
    .filter({
      has: admin.page.getByRole("heading", {
        name: "Business details",
        exact: true,
      }),
    });
  await business.getByLabel("Business name", { exact: true }).fill("Aiquor");
  await business
    .getByLabel(/^Support email/)
    .fill("hello@getaiquor.com");
  await business
    .getByLabel(/^Website/)
    .fill("https://getaiquor.com");
  await business
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await business
    .getByText("Business details updated.", { exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/owned-acceptance-report.json",
    JSON.stringify(
      {
        projectId,
        date: new Date().toISOString(),
        fileName,
        milestoneId: milestone.id,
        checks: [
          "real browser upload",
          "download content equality",
          "saved comment and reply",
          "change request",
          "revised approval with name/time",
          "reload persistence",
          "sign-out and new authenticated session",
          "15 authenticated viewport checks",
          "other-client URL/API/private-file denial",
          "business settings saved",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: owned-account browser workflow, saved uploads and approvals, responsive layouts and third-client isolation. Password-reset delivery still needs its separate test.",
  );
} finally {
  await browser.close();
  if (otherId) must(await service.auth.admin.deleteUser(otherId));
}
