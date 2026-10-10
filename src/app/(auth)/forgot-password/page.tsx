import { Form, Field } from "@/components/forms";
import { forgotPassword } from "@/app/actions";
import { BackLink } from "@/components/ui";
import { configured } from "@/lib/supabase/server";
export default function Forgot() {
  return (
    <>
      <BackLink href="/login">Back to sign in</BackLink>
      <p className="eyebrow">ACCOUNT RECOVERY</p>
      <h1 className="auth-title">
        Let’s get you
        <br />
        back in.
      </h1>
      <p className="muted">
        Enter your account email. We’ll request a secure password-reset link.
      </p>
      <Form
        action={forgotPassword}
        submit="Send reset link"
        disabled={!configured()}
      >
        <Field label="Email address" name="email" type="email" />
      </Form>
    </>
  );
}
