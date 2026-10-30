import { CampusPlan, type PlanNodeState } from "@/components/onboarding/CampusPlan";
import { fill } from "../../copy";
import type { PlateProps } from "../types";

const MAX_NODES = 6;

/**
 * Cover plate for the campuses step: the group office with one place per
 * planned campus (active up to the package, drafts beyond, empty package
 * places as slots), plus the activate/draft split. Keys only, never names.
 * Decorative.
 */
export function CampusesPlate({ t, data }: PlateProps) {
  const planned = data.campusNodes;
  const active = planned.filter((n) => n.state === "active").length;
  const drafts = planned.length - active;
  const unlimited = data.limit < 0;
  const slotCount = unlimited ? (planned.length === 0 ? 1 : 0) : Math.max(0, data.limit - planned.length);
  const all: { key: string; state: PlanNodeState }[] = [
    ...planned,
    ...Array.from({ length: slotCount }, (_, i) => ({ key: `slot-${i}`, state: "slot" as const })),
  ];
  const nodes = all.slice(0, MAX_NODES);
  const more = all.length - nodes.length;
  return (
    <div className="sk-plate" data-layer="campuses">
      <CampusPlan nodes={nodes} more={more > 0 ? more : undefined} unlimited={unlimited && more <= 0} />
      {planned.length > 0 && (
        <p className="sk-plate-meta">
          <bdi>{fill(t.charter.campusSplit, active, drafts)}</bdi>
        </p>
      )}
    </div>
  );
}
