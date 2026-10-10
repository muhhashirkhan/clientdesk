// Authorized setup for the two owner-controlled accounts, without reading or
// changing either password. Sessions stay in memory; no auth state is saved.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const linked = must(
  await service.auth.admin.generateLink({
    type: "magiclink",
    email: "hello@getaiquor.com",
  }),
);
let cookies = [];
const auth = createServerClient(url, key, {
  cookies: {
    getAll: () => cookies,
    setAll: (values) => {
      cookies = values;
    },
  },
});
must(
  await auth.auth.verifyOtp({
    token_hash: linked.properties.hashed_token,
    type: "magiclink",
  }),
);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addCookies(
  cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  })),
);
try {
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.goto("http://localhost:3012/clients");
  const existing = must(
    await service
      .from("clients")
      .select("id")
      .eq("email", "imeanhashir88@gmail.com")
      .maybeSingle(),
  );
  let clientId = existing?.id;
  if (!clientId) {
    await page.getByText("Add a client", { exact: false }).first().click();
    await page
      .getByLabel("Client name", { exact: true })
      .fill("Hashir — portal acceptance test");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("imeanhashir88@gmail.com");
    await page
      .getByRole("button", { name: "Save client", exact: true })
      .click();
    await page
      .getByText(
        "Client saved. You can now create their project and invite them.",
      )
      .waitFor();
    clientId = must(
      await service
        .from("clients")
        .select("id")
        .eq("email", "imeanhashir88@gmail.com")
        .single(),
    ).id;
  }
  let project = must(
    await service
      .from("projects")
      .select("id")
      .eq("client_id", clientId)
      .eq("name", "ClientDesk acceptance test")
      .maybeSingle(),
  );
  if (!project) {
    await page.goto("http://localhost:3012/projects/new");
    await page
      .getByLabel("Project name", { exact: true })
      .fill("ClientDesk acceptance test");
    await page.locator('select[name="client_id"]').selectOption(clientId);
    await page
      .getByLabel("Agreed scope")
      .fill(
        "Owner-controlled verification of file uploads, saved discussions, milestone change requests, approval history and client isolation. This is an application test, not customer work.",
      );
    await page.locator('input[name="deadline"]').fill("2026-10-14");
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await page.waitForURL(/\/projects\/[a-f0-9-]{36}$/);
    project = { id: new URL(page.url()).pathname.split("/").at(-1) };
  }
  await page.goto("http://localhost:3012/clients");
  const card = page
    .locator(".client-card")
    .filter({ hasText: "imeanhashir88@gmail.com" });
  const previous = must(
    await service
      .from("invitations")
      .select("email_sent_at,accepted_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (!previous[0]?.email_sent_at) {
    await card
      .getByRole("button", { name: "Invite client", exact: true })
      .click();
    await card
      .getByText("Invitation email requested for imeanhashir88@gmail.com.")
      .waitFor();
  }
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/owned-acceptance.json",
    JSON.stringify({ projectId: project.id, clientId }, null, 2),
  );
  await page.goto("http://localhost:3012/projects/" + project.id);
  await page.screenshot({
    path: "test-results/owned-project-desktop.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      projectId: project.id,
      clientInvitationRequested: true,
      createdThroughBrowser: true,
    }),
  );
} finally {
  await browser.close();
}
