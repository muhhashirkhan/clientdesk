// Only explicitly safe application messages may cross the server-action boundary.
export class PublicError extends Error {}
const businessMessages = new Set([
  "Not allowed", "Reply must belong to the same project",
  "This invitation is invalid, expired, or belongs to another email address.",
  "Invitation already used", "Only the Aiquor team can submit work",
  "Project is unavailable or read-only", "This milestone is already submitted or approved",
  "Only the assigned client can review this work", "This submission already has a decision",
  "Invalid decision", "The uploaded file could not be verified",
]);
export function operationMessage(error: {message?: string; code?: string}): string {
  if (error.code === "PGRST116") return "The record was not changed. It may no longer be available.";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message ?? ""))
    return "You don’t have permission to modify this record, or the project is read-only.";
  if (error.code === "P0001" && businessMessages.has(error.message ?? "")) return error.message!;
  if (/violates|invalid input syntax|PGRST|schema cache/i.test(error.message ?? ""))
    return "The change could not be saved. Please check your input and try again.";
  return "The change could not be saved. Please try again.";
}
