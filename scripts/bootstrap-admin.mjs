import { createClient } from "@supabase/supabase-js";
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLIENTDESK_ADMIN_EMAIL",
  "NEXT_PUBLIC_APP_URL",
];
for (const key of required)
  if (!process.env[key]) throw Error(`Set ${key} in .env.local first.`);
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const email = process.env.CLIENTDESK_ADMIN_EMAIL.trim().toLowerCase();
let user = null,
  page = 1;
while (!user) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (user || data.users.length < 100) break;
  page++;
}
if (!user) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo:
      process.env.NEXT_PUBLIC_APP_URL + "/auth/callback?next=%2Freset-password",
  });
  if (error) throw error;
  user = data.user;
  console.log("Admin setup email requested. Open it to set your own password.");
}
const { data, error } = await db
  .from("profiles")
  .update({ role: "admin", full_name: "Muhammad Hashir Khan" })
  .eq("id", user.id)
  .select("id")
  .single();
if (error || !data)
  throw (
    error || Error("Admin profile was not updated. Apply the migration first.")
  );
console.log(
  "Admin role configured for the approved email. No password has been generated or logged.",
);
