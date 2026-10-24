import { ApiError } from "@/lib/api/scope";
export function assertSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site && site !== "same-origin" && site !== "none") || (origin && origin !== new URL(request.url).origin)) throw new ApiError("Cross-site request refused", 403);
}
