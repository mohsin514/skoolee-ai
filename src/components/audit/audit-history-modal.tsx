"use client";

import { History } from "lucide-react";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Modal } from "@/components/ui/modal";
import { AUDIT_HISTORY_HINT, AUDIT_HISTORY_TITLE, AuditHistoryPanel } from "@/components/audit/audit-history-panel";

/**
 * The activity log in a dialog — used where a screen opens it as a secondary action (campus detail
 * "Activity log", the campus console's change history). The panel itself lives in
 * `audit-history-panel.tsx` so the authority's Settings › Activity tab renders the same thing in place.
 * The dialog takes its direction from the document (Modal portals pass `dir`/`lang`, R8).
 */
export function AuditHistoryModal({ onClose, initialCampusId = "", lockCampus = false }: { onClose: () => void; initialCampusId?: string; lockCampus?: boolean }) {
  const t = useUiText();
  return (
    <Modal title={t(AUDIT_HISTORY_TITLE)} subtitle={t(AUDIT_HISTORY_HINT)} icon={History} size="lg" onClose={onClose}>
      <AuditHistoryPanel initialCampusId={initialCampusId} lockCampus={lockCampus} />
    </Modal>
  );
}
