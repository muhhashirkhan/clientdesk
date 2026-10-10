import Link from "next/link";
import { Bell, ArrowUpRight } from "lucide-react";
import { session, check } from "@/lib/data";
import { PageHeader, Empty } from "@/components/ui";
import { Form, Hidden } from "@/components/forms";
import { markRead, markAllRead } from "@/app/actions";
import { timestamp } from "@/lib/utils";
import type { Notice } from "@/lib/types";
export default async function Notifications() {
  const { db } = await session();
  const result = await db
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  check(result.error);
  const notices = result.data as Notice[];
  return (
    <>
      <PageHeader
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        description="New conversations, review requests and decisions in one place."
        action={
          notices.some((n) => !n.read_at) ? (
            <Form action={markAllRead} submit="Mark all as read" />
          ) : undefined
        }
      />
      {notices.length ? (
        <section className="panel notifications-list">
          {notices.map((n) => (
            <article
              key={n.id}
              className={
                n.read_at ? "notification-row" : "notification-row unread"
              }
            >
              <span className="notification-icon">
                <Bell size={18} />
              </span>
              <div>
                <Link href={"/projects/" + n.project_id}>
                  {n.message}
                  <ArrowUpRight size={14} />
                </Link>
                <small>{timestamp(n.created_at)}</small>
              </div>
              {!n.read_at && (
                <Form
                  action={markRead}
                  submit="Mark as read"
                  className="small-form"
                >
                  <Hidden name="id" value={n.id} />
                </Form>
              )}
            </article>
          ))}
          <p className="muted small">
            Showing your latest {notices.length} notifications.
          </p>
        </section>
      ) : (
        <Empty
          title="You’re all caught up."
          description="Comments, submitted work and client decisions will create real notifications here."
        />
      )}
    </>
  );
}
