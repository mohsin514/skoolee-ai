"use client";

/**
 * @deprecated Billing & plan is one workspace now (role-ux F2): status, plan grid, checkout, payment method,
 * consequential requests and history live in `SubscriptionWorkspace`, without the window events that used to
 * couple this panel to the lifecycle panel. Mount `SubscriptionWorkspace` instead.
 *
 * Kept for one release so screens that still mount `<SubscriptionLifecyclePanel /><PlansPanel />` side by side
 * render the workspace once (the lifecycle export renders it; this one renders nothing).
 */
export function PlansPanel() {
  return null;
}
