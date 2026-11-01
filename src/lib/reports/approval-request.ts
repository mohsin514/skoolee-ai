/** A remark save: edits only, which clears any approval on the current version. */
export const remarkBody = (remarksEn: string) => ({ remarksEn });

/** An approval: the exact current version and no edit fields, so the server can approve it as it stands. */
export const approvalBody = (versionId: string) => ({ approve: true, versionId });
