import { useState } from "react";
import { ClipboardCheck, LayoutGrid } from "lucide-react";
import { CampusDiorama } from "@/components/auth/CampusDiorama";
import { ConfirmedChoice } from "@/components/onboarding/ConfirmedChoice";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { OptionCard } from "@/components/onboarding/OptionCard";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fill } from "../../copy";
import { FieldError } from "../fields";
import type { StructureStepProps } from "../types";

/* ═══ STEP: Institution type & adoption mode ═══ */
export function StructureStep({
  t, local, headingRef, folio, notices, busy, mode, type, savedType, registeredType, campusDraftCount, limit, modeError, onModeChange, onTypeChange, onContinue,
}: StructureStepProps) {
  const typeChanged = type !== savedType;
  // The shape picked at registration is shown as settled; "Change" reopens the two cards.
  const [changing, setChanging] = useState(false);
  const settled = registeredType !== null && type === registeredType && !changing;
  const diorama = (option: "STANDALONE" | "GROUP", className: string) => (
    <CampusDiorama type={option === "GROUP" ? "school_group" : "single_campus"} size="glyph" className={className} />
  );
  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={t.structureTitle}
      intro={t.structureIntro}
      notices={notices}
      dock={(
        <StepDock
          primary={(
            <Button onClick={onContinue} disabled={busy} loading={busy} className="sk-nudge-trigger gap-2">
              {t.continue} <ForwardArrow />
            </Button>
          )}
        />
      )}
    >
      <div className="space-y-8">
        <fieldset>
          <legend className="mb-3 text-md font-bold text-ink-strong">{t.typeQuestion}</legend>
          {settled ? (
            <ConfirmedChoice
              title={t.types[type].label}
              description={t.types[type].example}
              tag={local.registeredTitle}
              note={local.registeredBody}
              art={diorama(type, "size-10")}
              action={<Button variant="outline" size="sm" onClick={() => setChanging(true)}>{local.changeType}</Button>}
            />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 @min-[36rem]:grid-cols-2">
                {(["STANDALONE", "GROUP"] as const).map((option) => (
                  <OptionCard key={option} name="institutionType" value={option} checked={type === option} onSelect={() => onTypeChange(option)}
                    title={t.types[option].label} description={t.types[option].example} art={diorama(option, "size-9")} />
                ))}
              </div>
              {registeredType !== null && (
                <Button variant="link" size="sm" className="px-0" onClick={() => { onTypeChange(registeredType); setChanging(false); }}>
                  {local.keepType} · {t.types[registeredType].short}
                </Button>
              )}
            </div>
          )}
        </fieldset>
        <fieldset id="field-adoptionMode" tabIndex={-1}>
          <legend className="mb-3 text-md font-bold text-ink-strong">{t.modeQuestion}</legend>
          {modeError ? <div className="mb-3"><FieldError live={false}>{modeError}</FieldError></div> : null}
          <div className="grid gap-3 @min-[36rem]:grid-cols-2">
            {(["EXAM_STUDIO", "FULL_OPERATIONS"] as const).map((option) => {
              const Art = option === "EXAM_STUDIO" ? ClipboardCheck : LayoutGrid;
              return (
                <OptionCard key={option} name="adoptionMode" value={option} checked={mode === option} onSelect={() => onModeChange(option)}
                  title={t.modes[option].label} description={t.modes[option].desc} art={<Art aria-hidden />} />
              );
            })}
          </div>
        </fieldset>
        {typeChanged && (
          <Alert tone="info" title={fill(t.shapePreviewTitle, t.types[type].label)} className="sk-enter" data-testid="shape-preview">
            <div className="space-y-1 text-ink-muted">
              <p>{type === "STANDALONE" ? fill(t.shapeToStandalone, campusDraftCount) : t.shapeToGroup}</p>
              <p>{fill(t.shapeCapacity, t.campusCount(limit))}</p>
              <p>{t.shapeReopen}</p>
            </div>
          </Alert>
        )}
      </div>
    </StepCard>
  );
}
