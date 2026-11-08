import { InstitutionPreview } from "@/components/auth/InstitutionPreview";
import type { PlateProps } from "../types";

/** Cover plate for the review step: the compact letterhead with the charter's key lines. Decorative. */
export function ReviewPlate({ t, language, data }: PlateProps) {
  const details = [
    data.regId ? { label: data.idLabel, value: data.regId, ltr: true } : null,
    data.city ? { label: t.city, value: data.city } : null,
    data.planName ? { label: t.currentPackage, value: data.planName } : null,
  ].filter((row): row is { label: string; value: string; ltr?: boolean } => row !== null);
  return (
    <div className="sk-plate" data-layer="review">
      <InstitutionPreview
        variant="card"
        density="compact"
        language={language}
        schoolName={data.name}
        regId={data.regId}
        kicker={t.types[data.type].short}
        crest={data.logoPreview ?? undefined}
        tagline={data.tagline || undefined}
        details={details}
        badge={false}
      />
    </div>
  );
}
