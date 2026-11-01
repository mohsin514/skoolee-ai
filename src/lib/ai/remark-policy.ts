/** SKAI-738: approved, published or sent remarks stay as they are; only drafts are regenerated. */
export function isRemarkFrozen(card: { remarksApproved: boolean; status: string; publishedVersionId: string | null }) {
  return card.remarksApproved || card.publishedVersionId !== null || card.status === "PUBLISHED" || card.status === "SENT";
}
