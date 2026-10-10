export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value))
    : "No deadline";
}
export function timestamp(value: string) {
  return (
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export function bytes(value: number) {
  return value < 1048576
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / 1048576).toFixed(1)} MB`;
}
export function safeNext(value: string | null) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !/[\x00-\x20\x7f]/.test(value)
    ? value
    : "/dashboard";
}
export function progress(milestones: { status: string }[]) {
  return milestones.length
    ? Math.round(
        (milestones.filter((m) => m.status === "approved").length /
          milestones.length) *
          100,
      )
    : 0;
}
