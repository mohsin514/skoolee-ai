import { NextRequest } from "next/server";
import { getObjectStream } from "@/lib/storage/s3";
import { requireAuthUser } from "@/lib/api/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.join("/");

  if (!key) return new Response("Not found", { status: 404, headers: NO_STORE });

  if (key.startsWith("logos/")) {
    return streamObject(key, "public", 86400);
  }

  if (key.startsWith("profile-images/")) {
    try {
      const user = await requireAuthUser();
      const parts = key.split("/");
      const keySchoolId = parts[1];
      if (keySchoolId !== user.schoolId) {
        return new Response("Not found", { status: 404, headers: NO_STORE });
      }
      return streamObject(key, "private", 3600);
    } catch {
      return new Response("Unauthorized", { status: 401, headers: NO_STORE });
    }
  }

  return new Response("Not found", { status: 404, headers: NO_STORE });
}

async function streamObject(key: string, scope: "public" | "private", maxAge: number) {
  try {
    const { body, contentType, contentLength } = await getObjectStream(key);
    const headers: Record<string, string> = {
      "Cache-Control": `${scope}, max-age=${maxAge}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    if (contentLength) headers["Content-Length"] = String(contentLength);

    return new Response(body as unknown as ReadableStream, { status: 200, headers });
  } catch {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
}
