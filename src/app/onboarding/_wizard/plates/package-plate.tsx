import { CampusDiorama } from "@/components/auth/CampusDiorama";
import { CampusPlan, type PlanNodeState } from "@/components/onboarding/CampusPlan";
import { fill } from "../../copy";
import type { PlateProps } from "../types";

const DRAWN = 6;

/**
 * Cover plate for the package step: the package drawn as places. A group shows
 * its planned campuses (active up to the package, drafts beyond) followed by
 * empty slots for unused places; a standalone school shows its single campus.
 * Decorative: keys only, never names.
 */
export function PackagePlate({ t, data }: PlateProps) {
  const unlimited = data.limit < 0;
  const isGroup = data.type === "GROUP";
  const planned: { key: string; state: PlanNodeState }[] = data.campusNodes.map((n) => ({ key: n.key, state: n.state }));
  const slots = unlimited ? 0 : Math.max(0, data.limit - planned.length);
  const all = [...planned, ...Array.from({ length: slots }, (_, i) => ({ key: `slot-${i}`, state: "slot" as const }))];
  const nodes = all.slice(0, DRAWN);
  const more = all.length - nodes.length;
  return (
    <div className="sk-plate" data-layer="package">
      {isGroup ? (
        <CampusPlan nodes={nodes} more={more > 0 ? more : undefined} unlimited={unlimited} />
      ) : (
        <CampusDiorama type="single_campus" size="cover" />
      )}
      <p className="sk-plate-meta">{fill(t.covers, t.campusCount(data.limit))}</p>
    </div>
  );
}
