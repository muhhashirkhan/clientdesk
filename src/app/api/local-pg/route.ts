import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalSupabaseClient,
  getLocalPg,
  LOCAL_SESSION_COOKIE,
} from "@/lib/supabase/local-pg";

export async function GET(request: Request) {
  if (process.env.CLIENTDESK_LOCAL_PG !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket") || "project-files";
  const storagePath = url.searchParams.get("path");
  const download = url.searchParams.get("download") || "file";
  if (!storagePath || storagePath.includes("..")) {
    return new NextResponse("Invalid path", { status: 400 });
  }
  const diskTarget = path.join(process.cwd(), ".pglite-storage", bucket, storagePath);
  try {
    const data = await readFile(diskTarget);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${download.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("File not found", { status: 404 });
  }
}

export async function POST(request: Request) {
  if (process.env.CLIENTDESK_LOCAL_PG !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }
  const jar = await cookies();
  const db = createLocalSupabaseClient({
    getAll: () => jar.getAll(),
    setAll(values) {
      values.forEach(({ name, value, options }) =>
        jar.set(name, value, options as Record<string, unknown>),
      );
    },
  });

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const bucket = String(form.get("bucket") || "project-files");
    const storagePath = String(form.get("path") || "");
    const file = form.get("file");
    if (!(file instanceof File) || !storagePath) {
      return NextResponse.json(
        { data: null, error: { message: "Missing file or path" } },
        { status: 400 },
      );
    }
    const res = await db.storage.from(bucket).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
    });
    return NextResponse.json({
      data: res.data,
      error: res.error ? { message: res.error.message } : null,
    });
  }

  const body = (await request.json()) as {
    op: string;
    bucket?: string;
    paths?: string[];
    fn?: string;
    args?: Record<string, unknown>;
    email?: string;
  };

  if (body.op === "storage.remove") {
    const res = await db.storage
      .from(body.bucket || "project-files")
      .remove(body.paths || []);
    return NextResponse.json({
      data: res.data,
      error: res.error ? { message: res.error.message } : null,
    });
  }

  if (body.op === "rpc" && body.fn) {
    const res = await db.rpc(body.fn, body.args || {});
    return NextResponse.json(res);
  }

  if (body.op === "auth.impersonate" && body.email) {
    const pg = await getLocalPg();
    const cleanEmail = body.email.trim().toLowerCase();
    const found = await pg.query<{ id: string; email: string }>(
      "select id, email from auth.users where email = $1",
      [cleanEmail],
    );
    const user = found.rows[0];
    if (!user) {
      return NextResponse.json(
        { data: null, error: { message: "User not found" } },
        { status: 404 },
      );
    }
    jar.set(
      LOCAL_SESSION_COOKIE,
      JSON.stringify({ id: user.id, email: user.email }),
      { path: "/", httpOnly: false, sameSite: "lax" },
    );
    return NextResponse.json({ data: { user }, error: null });
  }

  return NextResponse.json(
    { data: null, error: { message: "Unsupported operation" } },
    { status: 400 },
  );
}

