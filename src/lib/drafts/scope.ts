/** Stable, purpose-scoped input only; the endpoint returns its digest, never
 * this permission map. Any authorization change conservatively retires drafts. */
export function draftAuthorizationFingerprint(user: {
  accessVersion?: number; isInstitutionOwner?: boolean; canPurchaseSubscription?: boolean; canManageMemberships?: boolean;
}, permissions: ReadonlyMap<string, { canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean }>) {
  return JSON.stringify([
    user.accessVersion ?? 0, !!user.isInstitutionOwner, !!user.canPurchaseSubscription, !!user.canManageMemberships,
    [...permissions].sort(([a], [b]) => a.localeCompare(b)).map(([module, flags]) => [module, flags.canView, flags.canAdd, flags.canEdit, flags.canDelete]),
  ]);
}
