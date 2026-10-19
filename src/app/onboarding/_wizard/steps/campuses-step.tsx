import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building, CheckCircle2, Mail, MapPin, Pencil, Plus, Trash2, UserRound, Users,
} from "lucide-react";
import { BoardSelect } from "@/components/ui/board-select";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { MoreDetails } from "@/components/onboarding/MoreDetails";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { useCompactForm } from "@/components/onboarding/use-compact-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fill } from "../../copy";
import { FieldError, InputField, PhoneField } from "../fields";
import { generateId } from "../helpers";
import type { CampusForm } from "../helpers";
import type { CampusesStepProps } from "../types";

const pad2 = (n: number) => String(n).padStart(2, "0");

/* ═══ STEP: Campuses (group only) ═══ */
export function CampusesStep({
  t, local, language, headingRef, folio, notices, busy, back, campuses, limit, draftsBeyond, canPurchase, compareHref, country,
  form, setForm, formErrors, rowErrors, editingKey, savingCampus, institutionCity, onSaveCampus, onEditCampus, onCancelEdit,
  deleting, deleteError, onAskDelete, onCancelDelete, onConfirmDelete, onContinue,
}: CampusesStepProps) {
  const compact = useCompactForm();
  const empty = campuses.length === 0;
  const reasonId = "campuses-continue-reason";
  const showReason = empty && !busy;
  const set = (patch: Partial<CampusForm>) => setForm({ ...form, ...patch });
  const err = (key: string) => (formErrors[key] ? t.errors[formErrors[key]] : undefined);

  /* Optional fields fold away on phones; open when editing a campus that has any, forced open on error. */
  const editingHasOptional = !!editingKey && !!(form.phone || form.email || form.principalName || form.address);
  const [userOpen, setUserOpen] = useState(editingHasOptional);
  const [openFor, setOpenFor] = useState(editingKey);
  if (openFor !== editingKey) { setOpenFor(editingKey); setUserOpen(editingHasOptional); }
  const forced = !!(formErrors.campusPhone || formErrors.campusEmail);

  /* After a successful add, the composer is ready for the next campus. */
  const prevCount = useRef(campuses.length);
  useEffect(() => {
    if (campuses.length > prevCount.current && !editingKey) document.getElementById("field-campusName")?.focus();
    prevCount.current = campuses.length;
  }, [campuses.length, editingKey]);

  const cityHint = form.city && form.city === institutionCity && !editingKey ? t.charter.cityPrefilled : undefined;
  const firstDraft = limit >= 0 && campuses.length > limit ? limit : -1;

  const optional = (
    <div className="grid grid-cols-1 @min-[24rem]:grid-cols-2 gap-3">
      <PhoneField field="campusPhone" error={err("campusPhone")} label={t.phone} value={form.phone} onChange={(v) => set({ phone: v })} country={country} language={language} />
      <InputField field="campusEmail" error={err("campusEmail")} label={t.campusEmail} value={form.email} onChange={(v) => set({ email: v })} placeholder="campus@school.edu.pk" icon={Mail} type="email" />
      <InputField field="campusPrincipal" label={t.headOfCampus} value={form.principalName} onChange={(v) => set({ principalName: v })} placeholder={t.optional} icon={UserRound} />
      <InputField field="campusAddress" label={t.address} value={form.address} onChange={(v) => set({ address: v })} placeholder={t.optional} icon={MapPin} />
    </div>
  );

  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={t.campusesTitle}
      intro={t.campusesIntro}
      notices={notices}
      dock={(
        <StepDock
          back={back}
          primary={(
            <Button type="button" onClick={onContinue} disabled={busy || empty} loading={busy} aria-describedby={showReason ? reasonId : undefined} className="sk-nudge-trigger gap-2">
              {t.continue} <ForwardArrow />
            </Button>
          )}
          reason={showReason ? { id: reasonId, text: t.errors["campuses.required"] } : undefined}
        />
      )}
    >
      <div className="grid gap-6 @min-[42rem]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form
          data-composer
          noValidate
          className="@container min-w-0"
          aria-labelledby="campus-composer-title"
          onSubmit={(e) => { e.preventDefault(); onSaveCampus(); }}
          onKeyDown={(e) => { if (e.key === "Escape" && editingKey) { e.preventDefault(); onCancelEdit(); } }}
        >
          <h2 id="campus-composer-title" className="text-md font-bold text-ink-strong [overflow-wrap:anywhere]">
            {editingKey ? fill(t.charter.editingCampus, form.name) : t.charter.newCampus}
          </h2>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 @min-[24rem]:grid-cols-2 gap-3">
              <InputField field="campusName" error={err("campusName")} label={t.campusName} value={form.name} onChange={(v) => set({ name: v })} placeholder="North Campus" icon={Building} required />
              <InputField field="campusCity" error={err("campusCity")} label={t.city} value={form.city} onChange={(v) => set({ city: v })} placeholder="Lahore" icon={MapPin} required hint={cityHint} />
            </div>
            <div className="grid grid-cols-1 @min-[24rem]:grid-cols-2 gap-3 items-start">
              <div className="space-y-1.5 min-w-0">
                <div className="flex min-h-11 items-center"><Label htmlFor="field-campusBoard" className="sk-field-label">{t.board}</Label></div>
                <BoardSelect
                  id="field-campusBoard"
                  country={country}
                  value={form.board}
                  onChange={(board) => set({ board })}
                  nameLabel={local.boardName}
                  namePlaceholder={local.boardNamePlaceholder}
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex min-h-11 flex-wrap justify-between items-center gap-2">
                  <Label htmlFor="field-campusRegId" className="sk-field-label">{t.campusId}</Label>
                  <div className="flex gap-1" role="group" aria-label={t.campusId}>
                    <Button type="button" size="sm" aria-pressed={form.autoId} variant="choice" onClick={() => set({ autoId: true, regId: generateId("BR") })}>{t.auto}</Button>
                    <Button type="button" size="sm" aria-pressed={!form.autoId} variant="choice" onClick={() => set({ autoId: false })}>{t.manual}</Button>
                  </div>
                </div>
                <Input id="field-campusRegId" dir="ltr" aria-invalid={!!formErrors.campusRegId} aria-describedby={formErrors.campusRegId ? "field-campusRegId-error" : undefined} value={form.regId} readOnly={form.autoId}
                  onChange={(e) => set({ regId: e.target.value.toUpperCase() })} placeholder="BR-XXXX" className="text-center font-mono tabular-nums" />
                {formErrors.campusRegId && <FieldError id="field-campusRegId-error" live={false}>{t.errors[formErrors.campusRegId]}</FieldError>}
              </div>
            </div>
            {compact ? (
              <MoreDetails title={t.charter.moreDetails} open={forced || userOpen} onOpenChange={setUserOpen}>{optional}</MoreDetails>
            ) : optional}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {editingKey && <Button type="button" variant="secondary" onClick={() => onCancelEdit()}>{t.cancel}</Button>}
              <Button type="submit" variant={empty ? "default" : "secondary"} disabled={busy} loading={savingCampus} className="gap-2">
                {!savingCampus && (editingKey ? <CheckCircle2 aria-hidden="true" className="w-4 h-4" /> : <Plus aria-hidden="true" className="w-4 h-4" />)}
                {editingKey ? t.updateCampus : t.addCampus}
              </Button>
            </div>
          </div>
        </form>

        <div className="min-w-0 self-start lg:sticky lg:top-24 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-ink-strong"><Users className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" /> {t.yourCampuses}</h2>
            <Badge variant="secondary" size="sm" className="shrink-0 tabular-nums">{fill(t.added, campuses.length)}</Badge>
          </div>
          <div className="mt-3 mb-4 pb-4 border-b border-border-subtle space-y-2">
            <CapacityMeter planned={campuses.length} limit={limit} />
            <p className="text-xs text-ink-muted">
              {t.activatedCapacity}{" "}
              <bdi className="tabular-nums">{fill(t.capacityValue, limit < 0 ? campuses.length : Math.min(campuses.length, limit), limit < 0 ? "∞" : limit)}</bdi>
            </p>
          </div>
          {draftsBeyond > 0 && (
            <Alert
              tone="warning"
              className="mb-4"
              data-mascot-anchor="capacity"
              actions={canPurchase ? <Link href={compareHref} className="sk-link text-sm">{t.comparePackages}</Link> : undefined}
            >
              {fill(t.overLimit, draftsBeyond)}
            </Alert>
          )}
          <ul className="sk-campus-list" aria-label={t.yourCampuses}>
            {campuses.map((c, i) => {
              const isDraft = limit >= 0 && i >= limit;
              const editing = editingKey === c.key;
              return (
                <li
                  key={c.key}
                  id={`campus-${c.key}`}
                  tabIndex={-1}
                  className="sk-campus-ticket sk-enter"
                  data-editing={editing || undefined}
                  data-invalid={rowErrors[`campus:${c.key}`] ? true : undefined}
                  data-first-draft={i === firstDraft || undefined}
                  data-limit-label={i === firstDraft ? fill(t.covers, t.campusCount(limit)) : undefined}
                >
                  <span className="sk-folio text-ink-subtle tabular-nums pt-0.5" aria-hidden="true">{pad2(i + 1)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-strong leading-snug break-words">{c.name}</p>
                    <p className="text-xs text-ink-subtle mt-1 break-words"><span>{c.city}</span> <span className="whitespace-nowrap">· <bdi dir="ltr" className="font-mono">{c.regId}</bdi></span></p>
                    <Badge variant={isDraft ? "warning" : "success"} size="sm" dot className="mt-2">{isDraft ? t.draftBadge : t.activateBadge}</Badge>
                  </div>
                  <div className="flex shrink-0 -me-1.5 -mt-1">
                    <IconButton variant="ghost" label={`${t.editCampus}: ${c.name}`} onClick={() => onEditCampus(c)} disabled={editing}><Pencil aria-hidden="true" /></IconButton>
                    <IconButton variant="ghost" label={`${t.deleteCampus}: ${c.name}`} onClick={() => onAskDelete(c)} className="actionable-hover:text-destructive"><Trash2 aria-hidden="true" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {empty && (
            <EmptyState size="sm" icon={Building} title={t.noCampuses} description={local.noCampusesHint} />
          )}
        </div>
      </div>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && !busy && onCancelDelete()}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t.deleteCampusTitle}</DialogTitle>
            <DialogDescription>{fill(t.deleteCampusBody, deleting?.name ?? "")}</DialogDescription>
          </DialogHeader>
          {deleteError && <Alert tone="danger">{deleteError}</Alert>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => onCancelDelete()}>{t.cancel}</Button>
            <Button variant="destructive" disabled={busy} loading={busy} onClick={() => onConfirmDelete()}>{t.deleteCampus}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepCard>
  );
}
