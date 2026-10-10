import { session } from "@/lib/data";
import { Form, Field } from "@/components/forms";
import { updatePassword } from "@/app/actions";
export default async function Reset() {
  await session();
  return (
    <>
      <p className="eyebrow">A FRESH START</p>
      <h1 className="auth-title">
        Choose a new
        <br />
        password.
      </h1>
      <p className="muted">
        Use at least 12 characters and a password you don’t use elsewhere.
      </p>
      <Form action={updatePassword} submit="Update password">
        <Field label="New password" name="password" type="password" />
        <Field label="Confirm password" name="confirm" type="password" />
      </Form>
    </>
  );
}
