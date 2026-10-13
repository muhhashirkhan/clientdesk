import Link from "next/link";
import { adminSession, check } from "@/lib/data";
import { PageHeader, BackLink, Empty } from "@/components/ui";
import { Form } from "@/components/forms";
import { ProjectFields } from "@/components/project-fields";
import { createProject } from "@/app/actions";
import type { Client } from "@/lib/types";

export default async function NewProject() {
  const { db } = await adminSession();
  const result = await db.from("clients").select("*").order("name");
  check(result.error);
  const clients = result.data as Client[];
  return (
    <div className="project-new-workspace">
      <div className="project-back-row">
        <BackLink href="/projects">Back to projects</BackLink>
      </div>
      <PageHeader
        eyebrow="A NEW BEGINNING"
        title="Start something great."
        description="Define the scope, choose the client and set a direction."
        action={
          <Link href="/projects" className="button secondary glass-button">
            Cancel
          </Link>
        }
      />
      {clients.length ? (
        <section className="panel form-panel project-create-panel glass-container">
          <div className="project-form-header">
            <p className="eyebrow">PROJECT SPECIFICATION</p>
            <h2>Workspace configuration</h2>
            <p className="muted">
              Once created, you can add milestones, upload deliverables, and
              collaborate with the client.
            </p>
          </div>
          <Form action={createProject} submit="Create project">
            <ProjectFields clients={clients} />
          </Form>
        </section>
      ) : (
        <Empty
          title="Add a client first."
          description="Every project belongs to a client. Create their client record, then come back here."
          href="/clients"
          action="Add a client"
        />
      )}
    </div>
  );
}

