import { assertTestTarget } from "./test-target.mjs";
assertTestTarget();
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const base = process.env.CLIENTDESK_PREVIEW_URL || "http://localhost:3012";
if (!["localhost","127.0.0.1"].includes(new URL(base).hostname)) throw Error("Browser test is local only.");
const email = "clientdesk-login-" + randomUUID() + "@example.test",
  password = randomBytes(24).toString("base64url");
const user = must(
  await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Disposable browser login test" },
  }),
).user;
let browser, adminUser, customer, project;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(25000);
  const login = async () => {
    await page.goto(base + "/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
  };
  await login();
  await page.getByRole("heading", { name: /Hello.*Let’s move things forward/ }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: /Hello.*Let’s move things forward/ }).waitFor();
  await page.goto(base + "/settings");
  await page
    .locator(".settings-signout")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.waitForURL("**/login");
  await login();
  assert.equal(
    await page.getByRole("link", { name: "Clients", exact: true }).count(),
    0,
  );
  const adminEmail = "clientdesk-browser-admin-" + randomUUID() + "@example.test";
  const adminPassword = randomBytes(24).toString("base64url");
  adminUser = must(await service.auth.admin.createUser({email:adminEmail,password:adminPassword,email_confirm:true})).user;
  must(await service.from("profiles").update({role:"admin"}).eq("id",adminUser.id));
  const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
  must(await adminDb.auth.signInWithPassword({email:adminEmail,password:adminPassword}));
  customer = must(await adminDb.from("clients").insert({name:"Browser test client",email}).select().single());
  project = must(await adminDb.from("projects").insert({name:"Phase 7 browser project",client_id:customer.id,status:"active"}).select().single());
  must(await service.from("client_members").insert({client_id:customer.id,user_id:user.id}));
  const milestone = must(await adminDb.from("milestones").insert({project_id:project.id,title:"Browser milestone"}).select().single());
  const submission = must(await adminDb.rpc("submit_milestone",{milestone:milestone.id,work_notes:"Real browser review fixture",work_url:""}));
  await mkdir("test-results",{recursive:true});
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({width,height:950});
    for (const path of ["/dashboard", "/projects?page=1.5", "/approvals", "/notifications", "/settings", `/projects/${project.id}`, `/projects/${project.id}?tab=milestones`, `/projects/${project.id}?tab=files`, `/projects/${project.id}?tab=discussion`, `/projects/${project.id}?tab=approvals`]) {
      await page.goto(base + path);
      await page.locator("#main").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} overflows at ${width}`);
    }
  }
  await page.goto(base + `/projects/${project.id}?tab=discussion`);
  await page.getByLabel("Your message",{exact:true}).fill("Phase 7 persisted browser comment");
  await page.getByRole("button",{name:"Post comment",exact:true}).click();
  await page.getByText("Comment posted.",{exact:true}).waitFor();
  assert.equal(must(await service.from("comments").select("body").eq("project_id",project.id).single()).body,"Phase 7 persisted browser comment");
  await page.goto(base + `/projects/${project.id}?tab=files`);
  await page.getByLabel("Choose file",{exact:true}).setInputFiles({name:"phase7.txt",mimeType:"text/plain",buffer:Buffer.from("Real browser upload")});
  await page.getByRole("button",{name:"Upload file",exact:true}).click();
  await page.getByText("File uploaded and saved.",{exact:true}).waitFor();
  assert.equal(must(await service.from("project_files").select("original_name").eq("project_id",project.id).single()).original_name,"phase7.txt");
  await page.goto(base + `/projects/${project.id}?tab=approvals`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button",{name:"Approve work",exact:true}).click();
  await page.getByText(/approved this work/).waitFor();
  assert.equal(must(await adminDb.from("decisions").select("decision").eq("submission_id",submission).single()).decision,"approved");
  await page.goto(base + "/settings");
  await page.getByLabel("Full name",{exact:true}).fill("Phase 7 browser client");
  await page.getByRole("button",{name:"Save profile",exact:true}).click();
  await page.getByText("Profile updated.",{exact:true}).waitFor();
  assert.equal(must(await service.from("profiles").select("full_name").eq("id",user.id).single()).full_name,"Phase 7 browser client");
  await page.goto(base + "/dashboard");
  await page.screenshot({path:"test-results/phase7-dashboard.png",fullPage:true});
  for (const path of ["/clients", "/projects/new"]) {
    await page.goto(base + path);
    await page.getByRole("heading", {name:"This page isn’t in your workspace.",exact:true}).waitFor();
  }
  const adminPage = await browser.newPage();
  adminPage.on("pageerror", error => errors.push(error.message));
  await adminPage.goto(base + "/login");
  await adminPage.getByLabel("Email address",{exact:true}).fill(adminEmail);
  await adminPage.getByLabel("Password",{exact:true}).fill(adminPassword);
  await adminPage.getByRole("button",{name:"Sign in",exact:true}).click();
  await adminPage.waitForURL("**/dashboard");
  for (const width of [390,768,1440]) {
    await adminPage.setViewportSize({width,height:950});
    for (const path of ["/clients","/projects/new","/settings",`/projects/${project.id}?tab=milestones`]) {
      await adminPage.goto(base + path);
      await adminPage.locator("#main").waitFor();
      assert.equal(await adminPage.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`${path} overflows for admin at ${width}`);
    }
  }
  await adminPage.close();
  assert.deepEqual(errors, []);
  await page.goto(base + "/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("intentionally-wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert(page.url().endsWith("/login"));
  console.log(
    "PASS: real browser login/session/sign-out/re-login, 42 responsive admin/client page checks, comment/upload/approval/profile persistence, admin-route denial and invalid-password error.",
  );
} finally {
  await browser?.close();
  if (project) {
    const objects = must(await service.storage.from("project-files").list(`${project.id}/${user.id}`));
    if(objects.length) must(await service.storage.from("project-files").remove(objects.map(o => `${project.id}/${user.id}/${o.name}`)));
    for(const table of ["decisions","submissions","comments","project_files","milestones","notifications"]) must(await service.from(table).delete().eq("project_id",project.id));
    must(await service.from("projects").delete().eq("id",project.id));
  }
  if(customer) must(await service.from("clients").delete().eq("id",customer.id));
  must(await service.auth.admin.deleteUser(user.id));
  if(adminUser) must(await service.auth.admin.deleteUser(adminUser.id));
}
