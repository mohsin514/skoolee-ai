import type { Language } from "@/lib/locale/package";
import type { SetupGenerationResult } from "@/lib/school-ai/setup-generation";
import { workspaceRequest } from "./workspace-client";

/** A reload can reconnect to a preparation already running on the server. */
export async function restoreSetupGeneration(input: { recordId: string; expectedVersion: number; language: Language }, signal: AbortSignal, onProcessing: () => void) {
  const query = new URLSearchParams({ recordId: input.recordId, expectedVersion: String(input.expectedVersion), language: input.language });
  for (let attempt = 0; attempt < 46; attempt++) {
    const result = await workspaceRequest<{ generation: SetupGenerationResult | null; processing: boolean }>(`/api/school-ai/setup/generate?${query}`, { signal });
    if (!result.processing) return result.generation;
    onProcessing();
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
      const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = window.setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, 2000);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  throw new Error("Preparation is still processing");
}
