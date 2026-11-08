import { ApiError } from "@/lib/api/scope";
import { requestHasSameOrigin } from "./same-origin-policy";
export function assertSameOrigin(request: Request) {
  if (!requestHasSameOrigin(request)) throw new ApiError("Cross-site request refused", 403);
}
