import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeNext,
  progress,
  dueLabel,
  getProjectNextAction,
  parsePage,
  pageHref,
  selectLatestInvitations,
} from "../src/lib/utils.ts";
import {
  uuid,
  name,
  email,
  password,
  previewUrl,
  optionalDate,
} from "../src/lib/validation.ts";
test("redirects stay inside the portal", () => {
  for (const path of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\n/evil.example",
  ])
    assert.equal(safeNext(path), "/dashboard");
  assert.equal(
    safeNext("/accept-invitation?invitation=123"),
    "/accept-invitation?invitation=123",
  );
});
test("progress comes only from approved milestones", () => {
  assert.equal(progress([]), 0);
  assert.equal(progress([{ status: "approved" }, { status: "in_review" }]), 50);
});
test("dueLabel formats deadlines cleanly without 'Due No deadline'", () => {
  assert.equal(dueLabel(null), "No deadline set");
  assert.equal(dueLabel(undefined), "No deadline set");
  assert.equal(dueLabel(""), "No deadline set");
  assert.equal(dueLabel("2026-10-14"), "Due Oct 14, 2026");
});
test("validates credentials and review links", () => {
  assert.equal(email.parse(" CLIENT@EXAMPLE.COM "), "client@example.com");
  assert.equal(password.safeParse("short").success, false);
  assert.equal(previewUrl.safeParse("javascript:alert(1)").success, false);
  assert.equal(optionalDate.parse(""), null);
});

test("rejects impossible dates and malformed or credential-bearing links", () => {
  for (const date of ["2026-02-31", "2026-13-01"])
    assert.equal(optionalDate.safeParse(date).success, false);
  for (const url of ["https://", "https://user:secret@example.com"])
    assert.equal(previewUrl.safeParse(url).success, false);
  assert.equal(optionalDate.parse("2028-02-29"), "2028-02-29");
});

test("validates UUIDs, required names, and project next-action states", () => {
  assert.equal(uuid.safeParse("not-a-uuid").success, false);
  assert.equal(
    uuid.safeParse("c9d2ae1c-a72d-4a41-a26b-2ec3f266918e").success,
    true,
  );
  assert.equal(name.safeParse("   ").success, false);
  assert.equal(name.safeParse("x".repeat(121)).success, false);
  assert.equal(name.parse("  Aiquor Client  "), "Aiquor Client");

  assert.equal(
    getProjectNextAction({ status: "active", archived: true }, [], true).text,
    "Archived · Read-only",
  );
  assert.equal(
    getProjectNextAction({ status: "completed", archived: false }, [], true).text,
    "Delivery complete",
  );
  assert.equal(
    getProjectNextAction(
      { status: "active", archived: false },
      [{ title: "Phase 1", status: "approved" }],
      true,
    ).text,
    "Ready to mark complete",
  );
});

test("parsePage and pageHref compute deterministic bounds and preserve filters", () => {
  const empty = parsePage(undefined, 0, 24);
  assert.equal(empty.page, 1);
  assert.equal(empty.totalPages, 1);
  assert.equal(empty.from, 0);
  assert.equal(empty.to, 23);
  assert.equal(empty.hasPrev, false);
  assert.equal(empty.hasNext, false);

  const page2 = parsePage("2", 250, 24);
  assert.equal(page2.page, 2);
  assert.equal(page2.totalPages, 11);
  assert.equal(page2.from, 24);
  assert.equal(page2.to, 47);
  assert.equal(page2.hasPrev, true);
  assert.equal(page2.hasNext, true);

  const clampedHigh = parsePage("999", 50, 24);
  assert.equal(clampedHigh.page, 3);
  assert.equal(clampedHigh.from, 48);
  assert.equal(clampedHigh.to, 71);
  assert.equal(clampedHigh.hasPrev, true);
  assert.equal(clampedHigh.hasNext, false);

  const clampedInvalid = parsePage("-4", 50, 24);
  assert.equal(clampedInvalid.page, 1);

  assert.equal(
    pageHref("/approvals", { status: "approved" }, 1),
    "/approvals?status=approved",
  );
  assert.equal(
    pageHref("/approvals", { status: "approved" }, 3),
    "/approvals?status=approved&page=3",
  );
  assert.equal(pageHref("/clients", {}, 2), "/clients?page=2");
  assert.equal(pageHref("/clients", {}, 1), "/clients");
});

test("selectLatestInvitations deterministically picks newest invitation per client", () => {
  const latestMap = selectLatestInvitations([
    {
      id: "00000000-0000-4000-8000-000000000001",
      client_id: "client-1",
      created_at: "2026-10-01T10:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      client_id: "client-1",
      created_at: "2026-10-05T10:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      client_id: "client-1",
      created_at: "2026-10-05T10:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000009",
      client_id: "client-2",
      created_at: "2026-09-15T08:00:00Z",
    },
  ]);

  assert.equal(
    latestMap.get("client-1")?.id,
    "00000000-0000-4000-8000-000000000003",
  );
  assert.equal(
    latestMap.get("client-2")?.id,
    "00000000-0000-4000-8000-000000000009",
  );
});

