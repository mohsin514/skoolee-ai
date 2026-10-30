import { InstitutionPreview, type InstitutionPreviewDetail } from "@/components/auth/InstitutionPreview";
import { fill } from "../../copy";
import type { PlateProps } from "../types";

/** Cover plate for the identity step: the extended letterhead. Decorative. */
export function IdentityPlate({ t, language, data }: PlateProps) {
  const details: InstitutionPreviewDetail[] = [
    { label: data.idLabel, value: data.regId, ltr: true },
    ...(data.city
      ? [{ label: t.city, value: data.establishedYear ? `${data.city} · ${fill(t.charter.established, data.establishedYear)}` : data.city }]
      : []),
    ...(data.website ? [{ label: t.website, value: data.website, ltr: true }] : []),
  ];
  return (
    <div className="sk-plate" data-layer="identity">
      <InstitutionPreview
        variant="card"
        language={language}
        schoolName={data.name}
        regId={data.regId}
        kicker={t.types[data.type].short}
        crest={data.logoPreview ?? undefined}
        tagline={data.tagline || undefined}
        details={details}
      />
    </div>
  );
}
