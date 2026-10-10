import Link from "next/link";
import { session, check } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { Form, Field } from "@/components/forms";
import { saveProfile, saveBusiness, signOut } from "@/app/actions";
export default async function Settings() {
  const { db, user, profile } = await session();
  const business = await db
    .from("business_settings")
    .select("*")
    .eq("id", true)
    .single();
  check(business.error);
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title="Settings"
        description="Your account details and the way your business shows up."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Your profile</h2>
          <p className="muted">
            Your name appears on comments and recorded decisions.
          </p>
          <Form action={saveProfile}>
            <Field
              label="Full name"
              name="full_name"
              value={profile.full_name}
              maxLength={120}
            />
            <label className="field">
              Account email
              <input value={user.email} readOnly aria-readonly="true" />
            </label>
          </Form>
          <div className="settings-security">
            <h3>Password & security</h3>
            <p>Request a secure reset link for your account.</p>
            <Link href="/forgot-password" className="text-link">
              Reset your password →
            </Link>
            <Form
              action={signOut}
              submit="Sign out"
              className="settings-signout"
            />
          </div>
        </section>
        {profile.role === "admin" && (
          <section className="panel">
            <h2>Business details</h2>
            <p className="muted">
              The contact details clients see in the workspace.
            </p>
            <Form action={saveBusiness}>
              <Field
                label="Business name"
                name="name"
                value={business.data.name}
                maxLength={120}
              />
              <Field
                label="Support email"
                name="support_email"
                value={business.data.support_email}
                type="email"
                required={false}
              />
              <Field
                label="Website"
                name="website"
                type="url"
                value={business.data.website}
                required={false}
              />
            </Form>
          </section>
        )}
        {profile.role === "client" && (
          <section className="panel">
            <h2>Your team at {business.data.name}</h2>
            <p className="muted">
              Project questions belong in your project discussion so everyone
              has the context.
            </p>
            {business.data.support_email && (
              <a
                className="text-link"
                href={"mailto:" + business.data.support_email}
              >
                {business.data.support_email}
              </a>
            )}
            {business.data.website && (
              <p>
                <a
                  className="text-link"
                  href={business.data.website}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visit website ↗
                </a>
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
