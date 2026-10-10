import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext, progress } from "../src/lib/utils.ts";
import {
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
