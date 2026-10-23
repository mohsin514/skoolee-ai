import { SchoolAiError } from "@/lib/school-ai/access";
import type { AutomaticAction, AutomaticJob } from "./schema";

/** The second model call must not change the action selected by the first. */
export function validateSelectedAction(selection: { type: string; tool?: string; operation?: string | null }, action: AutomaticAction) {
 if (selection.type !== "select" || selection.tool !== action.tool) throw new SchoolAiError("The AI changed its selected action. No action was saved; retry with the requested details.", 422);
 const operation = action.tool === "school.execute" ? action.data.proposal?.operation : action.tool === "school.inspect" ? action.data.operation : null;
 if (selection.operation && operation && selection.operation !== operation) throw new SchoolAiError("The AI changed its selected operation. No action was saved.", 422);
}

/** A read or saved planning brief is never evidence that operational work happened. */
export function validateCompletion(steps: AutomaticJob["steps"], outcome: "executed" | "answered" | "plan_saved") {
 const plans = new Set(["personal.save_plan", "work.save"]);
 const reads = new Set(["school.inspect", "platform.inspect"]);
 if (outcome === "executed" && !steps.some(step => !plans.has(step.tool) && !reads.has(step.tool))) throw new SchoolAiError("No operational changes have been completed. A read or saved plan does not complete the requested action.", 422);
 if (outcome === "plan_saved" && !steps.some(step => plans.has(step.tool))) throw new SchoolAiError("No requested plan has been saved yet.", 422);
 if (outcome === "answered" && steps.some(step => !reads.has(step.tool))) throw new SchoolAiError("This request made changes. Its completion must account for those changes.", 422);
}
