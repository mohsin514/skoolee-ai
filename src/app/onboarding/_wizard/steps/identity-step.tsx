import { useState } from "react";
import { Building2, CalendarDays, Globe, GraduationCap, Mail, MapPin, Phone, Tag } from "lucide-react";
import { FieldGroup } from "@/components/auth/FieldGroup";
import { InstitutionPreview } from "@/components/auth/InstitutionPreview";
import { CrestUpload } from "@/components/onboarding/CrestUpload";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { MoreDetails } from "@/components/onboarding/MoreDetails";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { useCompactForm } from "@/components/onboarding/use-compact-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CountrySelect } from "@/components/ui/country-select";
import { Input } from "@/components/ui/input";
import { InputGroup } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { FieldError, InputField, PhoneField } from "../fields";
import { generateId } from "../helpers";
import type { IdentityStepProps } from "../types";

/* ═══ STEP: Institution details (Charter Desk §6.2) ═══ */
export function IdentityStep({ t, local, language, headingRef, folio, notices, busy, back, isGroup, school, setSchool, errors, logo, preview, onContinue }: IdentityStepProps) {
  const s = school;
  const compact = useCompactForm();
  const [userOpen, setUserOpen] = useState(() => Boolean(s.phone || s.establishedYear || s.website));
  const forced = Boolean(errors.phone || errors.establishedYear || errors.website);
  const idLabel = isGroup ? t.schoolId : t.campusId;
  const auto = isGroup ? s.autoId : s.primaryCampusAutoId;

  const contactFields = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 @min-[26rem]:grid-cols-[minmax(0,1fr)_6.5rem]">
        <PhoneField field="phone" error={errors.phone && t.errors[errors.phone]} label={t.phone} value={s.phone} onChange={(phone) => setSchool({ phone })} country={s.country} language={language} />
        <InputField field="establishedYear" error={errors.establishedYear && t.errors[errors.establishedYear]} label={t.established} value={s.establishedYear} onChange={(val) => setSchool({ establishedYear: val.replace(/[^\d]/g, '').slice(0, 4) })} placeholder="1998" icon={CalendarDays} inputMode="numeric" />
      </div>
      <InputField field="website" error={errors.website && t.errors[errors.website]} label={t.website} value={s.website} onChange={(val) => setSchool({ website: val })} placeholder="www.school.edu.pk" icon={Globe} type="url" />
      <div className="space-y-1.5">
        <p className="sk-field-label">{t.contactEmail}</p>
        <p className="sk-address-plate">
          <Mail aria-hidden="true" className="w-4 h-4 shrink-0 text-ink-subtle" />
          <bdi dir="ltr">{s.email}</bdi>
        </p>
        <p id="contact-email-hint" className="text-xs leading-relaxed text-ink-subtle">{local.contactEmailHint}</p>
      </div>
    </div>
  );

  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={isGroup ? t.identityTitleGroup : t.identityTitleSchool}
      intro={isGroup ? t.identityIntroGroup : t.identityIntroSchool}
      notices={notices}
      dock={(
        <StepDock
          back={back}
          primary={(
            <Button onClick={onContinue} disabled={busy} loading={busy} className="sk-nudge-trigger gap-2">
              {t.continue} <ForwardArrow />
            </Button>
          )}
        />
      )}
    >
      <div className="grid gap-6 @min-[46rem]:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <FieldGroup level={2} id="grp-name" icon={Building2} title={t.charter.groups.nameLogo}>
            <div className="space-y-5">
              <CrestUpload
                preview={logo.preview ?? undefined}
                uploading={logo.uploading}
                hasLogo={logo.hasLogo}
                onFile={logo.onFile}
                onRemove={logo.onRemove}
                labels={{ title: t.logo, optional: t.optional, hint: t.logoHint, choose: t.chooseLogo, uploading: t.uploading, remove: t.remove, drop: t.charter.dropLogo }}
              />
              <InputField field="name" error={errors.name && t.errors[errors.name]} label={isGroup ? t.groupName : t.schoolName} value={s.name} onChange={(val) => setSchool({ name: val })} placeholder="Horizon Academy" icon={GraduationCap} required />
              <InstitutionPreview variant="strip" className="lg:hidden" language={language} schoolName={preview.schoolName} regId={preview.regId} kicker={preview.kicker} />
              <InputField field="tagline" label={t.tagline} value={s.tagline} onChange={(val) => setSchool({ tagline: val })} placeholder={t.optional} icon={Tag} />
            </div>
          </FieldGroup>
          <FieldGroup level={2} id="grp-location" icon={MapPin} title={t.charter.groups.location}>
            <div className="space-y-5">
              <div className="space-y-1.5" data-form-field="country">
                <Label htmlFor="field-country" className="sk-field-label">{local.country}</Label>
                <InputGroup>
                  <Globe data-field-affix="start" className="h-4 w-4" />
                  <CountrySelect id="field-country" language={language} value={s.country || "PK"} onChange={(country) => setSchool({ country })} aria-describedby="field-country-hint" className="w-full" />
                </InputGroup>
                <p id="field-country-hint" className="text-xs leading-relaxed text-ink-subtle">{local.countryHint}</p>
              </div>
              <InputField field="city" error={errors.city && t.errors[errors.city]} label={t.city} value={s.city} onChange={(val) => setSchool({ city: val })} placeholder="Lahore" icon={MapPin} required />
              <InputField field="address" label={t.address} value={s.address} onChange={(val) => setSchool({ address: val })} placeholder={t.optional} icon={MapPin} isArea />
            </div>
          </FieldGroup>
        </div>
        <div className="min-w-0 space-y-6">
          {compact ? (
            <MoreDetails title={t.charter.moreDetails} open={forced || userOpen} onOpenChange={setUserOpen}>
              {contactFields}
            </MoreDetails>
          ) : (
            <FieldGroup level={2} id="grp-contact" icon={Phone} title={t.charter.groups.contact}>
              {contactFields}
            </FieldGroup>
          )}
          <div className="sk-id-plate">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="field-regId" className="text-sm font-semibold text-ink-strong">{idLabel}</Label>
              <div className="bg-white rounded-xl p-1 flex gap-1 border border-border-subtle shadow-xs" role="group" aria-label={idLabel}>
                <Button size="sm" aria-pressed={auto} variant="choice" onClick={() => isGroup ? setSchool({ autoId: true, regId: generateId('SKL') }) : setSchool({ primaryCampusAutoId: true, primaryCampusRegId: generateId('BR') })}>{t.auto}</Button>
                <Button size="sm" aria-pressed={!auto} variant="choice" onClick={() => isGroup ? setSchool({ autoId: false }) : setSchool({ primaryCampusAutoId: false })}>{t.manual}</Button>
              </div>
            </div>
            <Input id="field-regId" dir="ltr" aria-invalid={!!errors.regId} aria-describedby={errors.regId ? "regId-hint field-regId-error" : "regId-hint"}
              value={isGroup ? s.regId : s.primaryCampusRegId}
              onChange={(e) => isGroup ? setSchool({ regId: e.target.value.toUpperCase() }) : setSchool({ primaryCampusRegId: e.target.value.toUpperCase() })}
              readOnly={auto}
              className="text-center font-mono tabular-nums" />
            <p id="regId-hint" className="text-xs leading-relaxed text-ink-subtle">{isGroup ? t.idHintGroup : t.idHintCampus}</p>
            {errors.regId && <FieldError id="field-regId-error" live={false}>{t.errors[errors.regId]}</FieldError>}
          </div>
          {!isGroup && (
            <Alert tone="success" live="off">{t.primaryCampusNote}</Alert>
          )}
        </div>
      </div>
    </StepCard>
  );
}
