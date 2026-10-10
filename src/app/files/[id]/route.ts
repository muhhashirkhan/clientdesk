import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuid.safeParse(id).success)
    return new NextResponse("File not found", { status: 404 });
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return new NextResponse("Sign in to download files.", { status: 401 });
  const file = await db
    .from("project_files")
    .select("storage_path,original_name")
    .eq("id", id)
    .maybeSingle();
  if (file.error || !file.data)
    return new NextResponse("File not found", { status: 404 });
  const signed = await db.storage
    .from("project-files")
    .createSignedUrl(file.data.storage_path, 60, {
      download: file.data.original_name,
    });
  if (signed.error)
    return new NextResponse("File unavailable. Please contact Aiquor.", {
      status: 404,
    });
  const response = NextResponse.redirect(signed.data.signedUrl, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
