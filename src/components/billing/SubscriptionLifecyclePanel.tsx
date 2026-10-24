"use client";

import { SubscriptionWorkspace } from "@/components/billing/SubscriptionWorkspace";

/**
 * @deprecated SKO-373's lifecycle panel is part of `SubscriptionWorkspace` now (role-ux F2): the plain-language
 * state, cancellation preview, grace and refund requests and request history sit beside the plan grid in one
 * workspace. Mount `SubscriptionWorkspace` directly; this export renders it without its PageHeader so a screen
 * that still mounts the old pair keeps working for one release.
 */
export function SubscriptionLifecyclePanel() {
  return <SubscriptionWorkspace showHeader={false} />;
}
