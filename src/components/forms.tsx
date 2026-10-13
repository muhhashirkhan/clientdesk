"use client";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import type { Action, ActionResult } from "@/lib/types";
import { browserClient } from "@/lib/supabase/client";
const initial: ActionResult = { ok: false, message: "" };
export function Form({
  action,
  children,
  submit = "Save changes",
  className = "",
  danger = false,
  confirm,
  disabled = false,
  reset = false,
}: {
  action: Action;
  children?: ReactNode;
  submit?: string;
  className?: string;
  danger?: boolean;
  confirm?: string;
  disabled?: boolean;
  reset?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const ref = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!state.message) return;
    if (state.ok && state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    } else {
      resultRef.current?.focus();
      if (state.ok && reset) ref.current?.reset();
    }
  }, [state, router, reset]);
  return (
    <form
      ref={ref}
      action={dispatch}
      className={`form ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending || disabled}>
        {children}
        <button
          type="submit"
          className={danger ? "button danger glass-button" : "button primary glass-button"}
        >
          {pending ? <LoaderCircle size={16} className="spin" /> : null}
          {pending ? "Saving…" : submit}
          {!pending && !danger && <ArrowUpRight size={16} />}
        </button>
      </fieldset>
      {state.message && (
        <p
          ref={resultRef}
          tabIndex={-1}
          role={state.ok ? "status" : "alert"}
          className={`form-message ${state.ok ? "success" : "error"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
export function Field({
  label,
  name,
  type = "text",
  value = "",
  required = true,
  maxLength,
  placeholder,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      {!required && <span className="optional">Optional</span>}
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={
          type === "password"
            ? "new-password"
            : type === "email"
              ? "email"
              : name === "full_name"
                ? "name"
                : "off"
        }
      />
      {help && <small>{help}</small>}
    </label>
  );
}
export function Textarea({
  label,
  name,
  value = "",
  required = false,
  maxLength = 8000,
  placeholder,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      {label}
      <textarea
        id={id}
        name={name}
        defaultValue={value}
        rows={4}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
export function RefreshButton() {
  const router = useRouter();
  return (
    <button
      className="icon-button glass-button glass-button-circle"
      title="Refresh current data"
      aria-label="Refresh current data"
      onClick={() => router.refresh()}
    >
      <RefreshCw size={17} />
    </button>
  );
}
export function UploadForm({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [isError, setIsError] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setIsError(false);
    const file = new FormData(e.currentTarget).get("file");
    if (!(file instanceof File) || !file.size) {
      setIsError(true);
      setMessage("Choose a non-empty file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setIsError(true);
      setMessage("Choose a file under 50 MB.");
      return;
    }
    setBusy(true);
    const db = browserClient();
    const path = `${projectId}/${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;
    try {
      const uploaded = await db.storage
        .from("project-files")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (uploaded.error) throw uploaded.error;
      const stored = await db.rpc("finalize_upload", {
        project: projectId,
        path,
        filename: file.name.slice(0, 255),
      });
      if (stored.error) {
        const cleanup = await db.storage.from("project-files").remove([path]);
        throw new Error(
          cleanup.error
            ? "Upload metadata failed and cleanup is pending. Contact Aiquor."
            : stored.error.message,
        );
      }
      setIsError(false);
      setMessage("File uploaded and saved.");
      ref.current?.reset();
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form ref={ref} onSubmit={upload} className="upload-form glass-container">
      <Upload size={25} aria-hidden="true" />
      <div>
        <h3>Add files to this project</h3>
        <p>
          Logos, briefs, screenshots and deliverables. Up to 50 MB per file.
        </p>
      </div>
      <label className="sr-only" htmlFor="project-upload">
        Choose file
      </label>
      <input
        id="project-upload"
        type="file"
        name="file"
        required
        disabled={busy}
      />
      <button className="button primary glass-button" disabled={busy}>
        {busy ? (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        ) : (
          <Upload size={16} aria-hidden="true" />
        )}{" "}
        {busy ? "Uploading and saving…" : "Upload file"}
      </button>
      {message && (
        <p
          role={isError ? "alert" : "status"}
          className={`form-message ${isError ? "error" : "success"}`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
