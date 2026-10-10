import { z } from "zod";
export const uuid = z
  .string()
  .uuid("Invalid record. Refresh the page and try again.");
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(254);
export const name = z.string().trim().min(1, "Enter a name.").max(120);
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
export const optionalDate = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    "Enter a valid date.",
  )
  .transform((v) => v || null);
export const previewUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (v) =>
      v === "" ||
      (() => {
        try {
          const url = new URL(v);
          return (
            ["http:", "https:"].includes(url.protocol) &&
            !!url.hostname &&
            !url.username &&
            !url.password
          );
        } catch {
          return false;
        }
      })(),
    "Use a complete http or https link.",
  );
export function input(form: FormData) {
  return Object.fromEntries(form.entries());
}
