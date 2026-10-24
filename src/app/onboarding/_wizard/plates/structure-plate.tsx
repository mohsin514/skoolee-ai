import { CampusDiorama } from "@/components/auth/CampusDiorama";
import { ModeLedger, type ModeLedgerKey } from "@/components/onboarding/ModeLedger";
import type { PlateProps } from "../types";

const MODULE_KEYS: ModeLedgerKey[] = ["classes", "assessments", "admissions", "fees"];

/**
 * Cover plate for the structure step: the campus diorama (re-flows when the
 * type changes) over the ModeLedger split of module families.
 * Decorative: the cover is aria-hidden, so plates carry short labels only, never names, links or ids.
 */
export function StructurePlate({ t, data }: PlateProps) {
  const c = t.charter;
  return (
    <div className="sk-plate" data-layer="structure">
      <CampusDiorama type={data.type === "GROUP" ? "school_group" : "single_campus"} size="cover" />
      <ModeLedger
        mode={data.mode ?? null}
        labels={{ inSkoolee: c.inSkoolee, stays: c.staysInSystems, modules: c.modulesLabel }}
        items={MODULE_KEYS.map((key) => ({ key, label: c.modules[key] }))}
      />
    </div>
  );
}
