"use client";

import { useRef, useState } from "react";
import { ShieldAlert, UtensilsCrossed } from "lucide-react";
import { ParentPage } from "@/components/parent/parent-page";
import { FamilyCanteen } from "@/components/campus-packages/campus-packages";

export const dynamic = "force-dynamic";

/**
 * Canteen (M93): ordering and allergies for every child whose campus runs the canteen package.
 * Shown in the navigation only when `pkgCanteen` is on; the canteen API keeps its own check.
 *
 * §4.4b: **Order** ("Order a meal") is the page's one primary (it brings the first orderable meal into view and
 * focuses it); **Allergies** jumps to the first child's allergy field. The panel renders its own
 * loading, error and empty states here (`hideWhenEmpty={false}`) and no second title (`embedded`).
 */
export default function ParentCanteenPage() {
  const [orderRequest, setOrderRequest] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const focusAllergies = () => {
    const field = panelRef.current?.querySelector<HTMLInputElement>('input[id^="field-al-"]');
    if (!field) return;
    field.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    field.focus({ preventScroll: true });
  };

  return (
    <ParentPage
      icon={UtensilsCrossed}
      title="Canteen"
      description="Order meals for your children and keep their allergy information up to date."
      primaryAction={{ id: "order", label: "Order a meal", icon: UtensilsCrossed, onClick: () => setOrderRequest((n) => n + 1) }}
      secondaryActions={[{ id: "allergies", label: "Allergies", icon: ShieldAlert, onClick: focusAllergies }]}
    >
      <div ref={panelRef}>
        <FamilyCanteen hideWhenEmpty={false} embedded orderRequest={orderRequest} />
      </div>
    </ParentPage>
  );
}
