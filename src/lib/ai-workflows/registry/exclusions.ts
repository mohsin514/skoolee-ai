import { defineExclusion } from "./define";
import type { Exclusion, ExclusionCategory } from "./types";

/**
 * Capabilities the AI must never run, each with its reason. A key that is neither a registry entry
 * nor excluded here is "not connected yet" and is tracked by the coverage ratchet instead.
 */
interface Rule { category: ExclusionCategory; reason: string; match(key: string): boolean; link?: string }

const RULES: Rule[] = [
  { category: "internal", reason: "Exam Studio owns the paper-to-gradebook handoff: an authorized exam-office user must review the mark conversion and current preview, confirm the transfer, and retain its receipt. The assistant must not autonomously write or publish these marks.", match: key => key === "exams.paper.gradebook_send", link: "/ai/studio" },
  { category: "internal", reason: "Knowledge authoring, audience changes and publication require a human review; the assistant cannot publish its own evidence.", match: key => ["knowledge.create", "knowledge.manage"].includes(key), link: "/ai/knowledge" },
  { category: "file-upload", reason: "Knowledge file extraction is user-initiated intake and must be reviewed before publication.", match: key => key === "knowledge.extract", link: "/ai/knowledge" },
  { category: "auth", reason: "Sign-in, sign-up, passwords, MFA and sessions belong to the person, never to an assistant acting for them.",
    match: key => key.startsWith("auth.") || ["account.manage_mfa", "onboarding.self_serve_signup", "governance.reset_user_password", "platform.reset_user_password"].includes(key) },
  { category: "webhook", reason: "Provider callbacks are verified machine-to-machine requests, not user actions.",
    match: key => /webhook|safepay_notification|safepay_simulate/.test(key) },
  { category: "cron", reason: "The scheduled notification sweep (SKAI-1128) runs under CRON_SECRET system authority, never as an assistant action.", match: key => key === "system.notification_automation_sweep" },
  { category: "cron", reason: "Scheduled system jobs run on their own schedule under system authority.", match: key => key.startsWith("system.") },
  { category: "candidate-only", reason: "A candidate starts, answers and submits their own exam attempt; secure-browser evidence comes from their device.",
    match: key => ["exams.attempt.start", "exams.attempt.save_or_submit", "exams.clarification.acknowledge"].includes(key) },
  { category: "file-upload", reason: "File and camera uploads are owned by the multimodal intake (SKO-460).",
    match: key => key.startsWith("uploads.") || /presign|upload_document|upload_clip|put_private_file|confirm_upload|intake\.upload|paperFromUpload/.test(key) },
  { category: "platform-console", reason: "Switching a school out of practice mode is a deliberate platform-owner decision; the AI must never lift its own practice gate.",
    match: key => key === "platform.set_ai_workflows_live" },
  { category: "platform-console", reason: "Pilot trust reviews, proposals, commercial evidence and go/no-go decisions are signed founder decisions; the AI must never record or approve its own pilot readiness.",
    match: key => key === "platform.record_pilot_readiness" || key === "platform.record_pack_expansion_decision" },
  { category: "platform-console", reason: "AI cost rates are founder-set figures from the OpenAI invoice that drive the margin report; the AI must never set the rates that judge its own cost.",
    match: key => key === "platform.set_ai_cost_rates" },
  { category: "internal", reason: "Curriculum pack evidence and approvals are human attestations by the school and a named educator; the AI must never attest rights or approve, activate or revoke its own source material.",
    match: key => key === "curriculum.record_pack_evidence" || key === "curriculum.transition_pack" || key === "curriculum.request_pack" },
  { category: "auth", reason: "Connecting the school's own WhatsApp Business Account is a Meta login in the administrator's browser and grants Meta-billed sending; buying managed-sending credit is a payment decision. Both stay with a person.",
    match: key => ["whatsapp.connect_waba", "whatsapp.disconnect_waba", "whatsapp.managed_settings", "whatsapp.managed_provision", "whatsapp.managed_top_up"].includes(key), link: "/admin" },
  { category: "internal", reason: "Unauthenticated public forms are completed by families on the public page, not from a signed-in assistant.",
    match: key => key.startsWith("public.") },
];

export function exclusionFor(key: string): Exclusion | null {
  const rule = RULES.find(item => item.match(key));
  return rule ? defineExclusion({ key, category: rule.category, reason: rule.reason, ...(rule.link ? { link: rule.link } : {}) }) : null;
}
