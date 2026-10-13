import Link from "next/link";
import { Form } from "@/components/forms";
import { registerCompany } from "@/app/actions";
import { configured } from "@/lib/supabase/server";

export default function RegisterPage() {
  const ready = configured();
  return (
    <div className="auth-login-flow">
      <div className="auth-stagger-1">
        <p className="eyebrow">COMPANY ONBOARDING · OBSIDIAN OS</p>
        <h2 className="auth-title">
          Create your
          <br />
          company workspace.
        </h2>
        <p className="muted auth-subtitle">
          Launch an isolated, multi-tenant client portal for your team and
          clients.
        </p>
      </div>

      {!ready && (
        <div className="notice auth-stagger-2">
          ClientDesk is being configured. Registration will open shortly.
        </div>
      )}

      <div className="auth-stagger-3">
        <Form
          action={registerCompany}
          submit="Create workspace & continue"
          disabled={!ready}
        >
          <label className="field auth-field">
            Your full name
            <input
              type="text"
              name="full_name"
              autoComplete="name"
              required
              maxLength={120}
              placeholder="e.g. Elena Vance"
            />
          </label>
          <label className="field auth-field">
            Work email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="elena@vancestudio.com"
            />
          </label>
          <label className="field auth-field">
            Password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              placeholder="At least 8 characters"
            />
          </label>
          <label className="field auth-field">
            Company or studio name
            <input
              type="text"
              name="company_name"
              required
              maxLength={120}
              placeholder="e.g. Vance Studio"
            />
          </label>
          <label className="field auth-field">
            Workspace URL slug
            <input
              type="text"
              name="company_slug"
              required
              maxLength={63}
              pattern="[a-z0-9][a-z0-9-]{1,62}"
              placeholder="e.g. vance-studio"
            />
            <small>Lowercase letters, numbers, and hyphens.</small>
          </label>
          <label className="field auth-field">
            Company tagline <span className="optional">Optional</span>
            <input
              type="text"
              name="company_tagline"
              maxLength={240}
              placeholder="e.g. Product design & engineering partner"
            />
          </label>
          <label className="field auth-field">
            Company website <span className="optional">Optional</span>
            <input
              type="url"
              name="company_website"
              placeholder="https://vancestudio.com"
            />
          </label>
        </Form>
      </div>

      <p className="auth-bottom auth-stagger-4">
        Already have a ClientDesk account?{" "}
        <Link href="/login" className="forgot-link">
          Sign in →
        </Link>
      </p>
    </div>
  );
}

