import Link from "next/link";
import {
  User,
  Shield,
  Building2,
  Mail,
  Globe,
  KeyRound,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { session, check } from "@/lib/data";
import { Badge } from "@/components/ui";
import { Form, Field } from "@/components/forms";
import { saveProfile, saveBusiness, signOut } from "@/app/actions";
import { date } from "@/lib/utils";

export default async function Settings() {
  const { db, user, profile } = await session();
  const business = await db
    .from("business_settings")
    .select("*")
    .eq("id", true)
    .single();
  check(business.error);

  const admin = profile.role === "admin";
  const initial = (profile.full_name || user.email || "A")[0].toUpperCase();

  return (
    <div className="settings-workspace">
      <header className="command-header page-heading settings-workspace-header glass-container">
        <div className="command-header-main">
          <div className="command-eyebrow-row">
            <p className="eyebrow">MAKE YOURSELF AT HOME</p>
            <Badge value={admin ? "active" : "approved"} />
          </div>
          <h1>Settings</h1>
          <p className="muted">
            Your account details, security controls and the way your business
            shows up.
          </p>

          <div
            className="command-summary-pills"
            aria-label="Account and workspace summary"
          >
            <span className="command-summary-pill">
              <User size={13} aria-hidden="true" />
              <span>
                <strong>{profile.full_name || "Account"}</strong> ·{" "}
                {admin ? "Admin" : "Client"}
              </span>
            </span>

            {user.email && (
              <span className="command-summary-pill">
                <Mail size={13} aria-hidden="true" />
                <span>{user.email}</span>
              </span>
            )}

            <span className="command-summary-pill is-clear">
              <Building2 size={13} aria-hidden="true" />
              <span>
                <strong>{business.data.name}</strong>
              </span>
            </span>
          </div>
        </div>
      </header>

      <div className="settings-grid">
        <div className="settings-column">
          <section className="panel settings-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">ACCOUNT IDENTITY</p>
                <h2>Your profile</h2>
              </div>
              <span className="avatar large glass-container glass-container-circle">
                {initial}
              </span>
            </div>
            <p className="muted">
              Your name appears on project comments, submissions and recorded
              decisions.
            </p>

            <Form action={saveProfile} submit="Save profile">
              <Field
                label="Full name"
                name="full_name"
                value={profile.full_name}
                maxLength={120}
              />
              <label className="field">
                Account email
                <span className="optional">Verified</span>
                <input value={user.email || ""} readOnly aria-readonly="true" />
                <small>
                  Used for workspace authentication and security notifications.
                </small>
              </label>
            </Form>
          </section>

          <section className="panel settings-panel settings-security-panel glass-container">
            <div className="settings-panel-header">
              <div>
                <p className="eyebrow">AUTHENTICATION & SESSION</p>
                <h2>Password & security</h2>
              </div>
              <span
                className="settings-section-icon glass-container glass-container-circle"
                aria-hidden="true"
              >
                <Shield size={18} />
              </span>
            </div>

            <div className="settings-security-block">
              <div className="settings-security-item">
                <div>
                  <h3>
                    <KeyRound size={15} aria-hidden="true" />
                    Password recovery
                  </h3>
                  <p>
                    Request a secure password-reset link sent to your verified
                    account email.
                  </p>
                </div>
                <Link href="/forgot-password" className="text-link">
                  Reset your password →
                </Link>
              </div>

              <div className="settings-security-item is-session">
                <div>
                  <h3>
                    <LogOut size={15} aria-hidden="true" />
                    Active session
                  </h3>
                  <p>
                    Signed in as <strong>{user.email}</strong>. Sign out to end
                    your current session on this device.
                  </p>
                </div>
                <Form
                  action={signOut}
                  submit="Sign out"
                  className="settings-signout"
                />
              </div>
            </div>
          </section>
        </div>

        <div className="settings-column">
          {admin && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">WORKSPACE CONFIGURATION</p>
                  <h2>Business details</h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <Building2 size={18} />
                </span>
              </div>
              <p className="muted">
                The organization name and contact details clients see across the
                workspace.
              </p>

              <Form action={saveBusiness} submit="Save business details">
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
                  placeholder="support@aiquor.com"
                />
                <Field
                  label="Website"
                  name="website"
                  type="url"
                  value={business.data.website}
                  required={false}
                  placeholder="https://aiquor.com"
                />
              </Form>

              {business.data.updated_at && (
                <div className="settings-panel-footer">
                  <span>Workspace Role: Administrator</span>
                  <span>Updated {date(business.data.updated_at)}</span>
                </div>
              )}
            </section>
          )}

          {profile.role === "client" && (
            <section className="panel settings-panel glass-container">
              <div className="settings-panel-header">
                <div>
                  <p className="eyebrow">WORKSPACE TEAM</p>
                  <h2>Your team at {business.data.name}</h2>
                </div>
                <span
                  className="settings-section-icon glass-container glass-container-circle"
                  aria-hidden="true"
                >
                  <Building2 size={18} />
                </span>
              </div>
              <p className="muted">
                Project questions belong in your project discussion so everyone
                has the context.
              </p>

              <div className="settings-contact-list">
                {business.data.support_email && (
                  <a
                    className="settings-contact-row"
                    href={"mailto:" + business.data.support_email}
                  >
                    <Mail size={16} aria-hidden="true" />
                    <div>
                      <span>Direct support email</span>
                      <strong>{business.data.support_email}</strong>
                    </div>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}

                {business.data.website && (
                  <a
                    className="settings-contact-row"
                    href={business.data.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Globe size={16} aria-hidden="true" />
                    <div>
                      <span>Organization website</span>
                      <strong>Visit website ↗</strong>
                    </div>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )}
              </div>

              <div className="settings-panel-footer">
                <span>Workspace Role: Client Member</span>
                <Link href="/projects" className="text-link">
                  Open your projects →
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
