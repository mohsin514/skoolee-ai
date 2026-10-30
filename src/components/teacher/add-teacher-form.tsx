"use client";

import { useState } from "react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Briefcase,
  Check,
  Loader2,
  Send,
  MapPin,
  Network,
  Phone,
  User,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { inviteStaff } from "@/app/actions/invite";
import { SpecialtyEditor } from "@/components/shared-admin";
import { EMPLOYMENT_TYPE_LABELS } from "@/lib/staff/hierarchy-presets";
import {
  PositionFields,
  emptyPosition,
  usePositionOptions,
  type PositionValue,
} from "@/components/staff/position-fields";
import {
  Field,
  FormSection,
  ReviewHero,
  ReviewRow,
  ReviewSection,
  WizardShell,
} from "@/components/shared-admin/wizard-shell";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";


interface AddTeacherFormProps {
  onSuccess: () => void;
  onClose: () => void;
}

const STEPS = [
  { label: "Personal info", icon: User, blurb: "Who they are and how the school reaches them." },
  { label: "Professional", icon: Briefcase, blurb: "What they teach, and their pay and contract." },
  { label: "Address & emergency", icon: MapPin, blurb: "Where they live and who to call in an emergency." },
  { label: "Review & submit", icon: Check, blurb: "Check everything, then send the invitation." },
];

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

const QUALIFICATIONS = [
  "Matric / SSC",
  "Intermediate / HSSC",
  "Bachelor's (BA / BSc / BEd)",
  "Master's (MA / MSc / MEd)",
  "MPhil",
  "PhD",
  "Other",
];

const CONTRACT_TYPES = [
  { value: "PERMANENT", label: "Permanent" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PART_TIME", label: "Part-time" },
] as const;

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  cnic: "",
  dateOfBirth: "",
  gender: "MALE",
  qualification: "",
  specialization: "",
  experience: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  joiningDate: new Date().toISOString().split("T")[0],
  emergencyContact: "",
  emergencyPhone: "",
  designation: "",
  contractType: "",
  basicSalary: "",
};

type FormData = typeof emptyForm;

export function AddTeacherForm({ onSuccess, onClose }: AddTeacherFormProps) {
  const locale = useLocale();
  const ui = useUiText();
  // The step list, contract types and option labels are EN keys translated at render; stored values stay EN.
  const steps = STEPS.map((item) => ({ ...item, label: ui(item.label), blurb: ui(item.blurb) }));
  const genderLabel = (g: string) => (g === "MALE" ? ui("Male") : g === "FEMALE" ? ui("Female") : ui("Other"));
  const contractLabel = (value: string) => {
    const match = CONTRACT_TYPES.find((c) => c.value === value);
    return match ? ui(match.label) : "";
  };
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [teachesAll, setTeachesAll] = useState(false);
  const [specialtyDraft, setSpecialtyDraft] = useState("");
  const [position, setPosition] = useState<PositionValue>({ ...emptyPosition });
  const positionOptions = usePositionOptions();

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateStep = (s: number): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};

    if (s === 0) {
      if (!form.fullName.trim()) errs.fullName = ui("Full name is required");
      if (!form.email.trim()) errs.email = ui("Email is required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = ui("Invalid email");
      if (!form.phone.trim()) errs.phone = ui("Phone is required");
    }

    setErrors((prev) => ({ ...prev, ...errs }));
    return Object.keys(errs).length === 0;
  };

  const nextStep = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep(0)) {
      toast.error(ui("Fix the highlighted fields, then try again."));
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteStaff({
        email: form.email.trim().toLowerCase(),
        fullName: form.fullName.trim(),
        role: "TEACHER",
        profile: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          cnic: form.cnic.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          qualification: form.qualification || undefined,
          specialization: teachesAll ? "All subjects" : specialties.join(", ") || undefined,
          subjectSpecialties: specialties,
          teachesAllSubjects: teachesAll,
          experience: form.experience.trim() || undefined,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          province: form.province || undefined,
          postalCode: form.postalCode.trim() || undefined,
          joiningDate: form.joiningDate || undefined,
          emergencyContact: form.emergencyContact.trim() || undefined,
          emergencyPhone: form.emergencyPhone.trim() || undefined,
          designation: form.designation.trim() || undefined,
          contractType: (form.contractType || undefined) as "PERMANENT" | "CONTRACT" | "PART_TIME" | undefined,
          basicSalary: Math.round(Number(form.basicSalary || 0) * 100) || undefined,
          // Where they will sit once they accept — applied to their profile,
          // their department and the first row of their service record.
          designationId: position.designationId || undefined,
          primaryDepartmentId: position.primaryDepartmentId || undefined,
          reportsToId: position.reportsToId || undefined,
          employmentType: (position.employmentType || undefined) as
            | "FULL_TIME" | "PART_TIME" | "VISITING" | "ADJUNCT" | "CONTRACT" | "INTERN" | "VOLUNTEER"
            | undefined,
          employeeCode: position.employeeCode.trim() || undefined,
        },
      });
      toast.success(ui("Invitation sent to {0}.", [form.email.trim().toLowerCase()]));
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? ui(error.message) : ui("Could not send invitation"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WizardShell
      eyebrow={ui("New teacher")}
      icon={Briefcase}
      steps={steps}
      step={step}
      onStepChange={setStep}
      onClose={onClose}
      onBack={prevStep}
      onNext={nextStep}
      onSubmit={handleSubmit}
      submitLabel={ui("Send invitation")}
      submitIcon={<Send className="h-4 w-4" />}
      submitting={isSubmitting}
      submittingLabel={ui("Sending…")}
    >
          {step === 0 && (
            <div className="space-y-5">
              <FormSection icon={User} title={ui("Identity")} hint={ui("The teacher's name as it should appear on records and timetables.")}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={ui("Full name")} required error={errors.fullName}>
                      <Input
                        value={form.fullName}
                        onChange={(e) => update("fullName", e.target.value)}
                        placeholder={ui("Teacher's full name")}
                      />
                    </Field>
                  </div>
                  <Field label={ui("CNIC")} hint={ui("National ID, if you record it")}>
                    <Input
                      value={form.cnic}
                      onChange={(e) => update("cnic", e.target.value)}
                      placeholder="XXXXX-XXXXXXX-X"
                    />
                  </Field>
                  <Field label={ui("Date of birth")}>
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => update("dateOfBirth", e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={ui("Gender")}>
                      <div className="flex gap-2">
                        {(["MALE", "FEMALE", "OTHER"] as const).map((g) => (
                          <Button aria-pressed={form.gender === g} variant="choice" size="sm"
                            key={g}
                            type="button"
                            className="flex-1"
                            onClick={() => update("gender", g)}
                          >
                            {genderLabel(g)}
                          </Button>
                        ))}
                      </div>
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={Phone}
                title={ui("Contact & Sign-in")}
                hint={ui("The invitation goes to this email. It becomes their sign-in address and cannot be changed later.")}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={ui("Email")} required error={errors.email}>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="teacher@school.edu"
                    />
                  </Field>
                  <Field label={ui("Phone")} required error={errors.phone}>
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="03XX-XXXXXXX"
                    />
                  </Field>
                </div>
              </FormSection>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <FormSection
                icon={Briefcase}
                title={ui("Qualifications & Subjects")}
                hint={ui("What they are qualified to teach. Subjects here are a starting point — actual class subjects are assigned under Classes & Subjects.")}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={ui("Qualification")}>
                    <Select
                      value={form.qualification}
                      onChange={(e) => update("qualification", e.target.value)}
                    >
                      <option value="">{ui("Select qualification")}</option>
                      {QUALIFICATIONS.map((q) => (
                        <option key={q} value={q}>{ui(q)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={ui("Experience")}>
                    <Input
                      value={form.experience}
                      onChange={(e) => update("experience", e.target.value)}
                      placeholder={ui("e.g. 5 years")}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <SpecialtyEditor
                      specialties={specialties}
                      teachesAll={teachesAll}
                      draft={specialtyDraft}
                      onDraftChange={setSpecialtyDraft}
                      onAdd={(name) => {
                        const clean = name.trim();
                        if (!clean) return;
                        setSpecialties((cur) => (cur.some((x) => x.toLowerCase() === clean.toLowerCase()) ? cur : [...cur, clean]));
                        setSpecialtyDraft("");
                      }}
                      onRemove={(name) => setSpecialties((cur) => cur.filter((x) => x !== name))}
                      onToggleAll={() => setTeachesAll((v) => !v)}
                    />
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={Network}
                title={ui("Position & Reporting")}
                hint={ui("Where this teacher sits in the institution. Setting it now means the org chart is right the moment they accept — all of it can be changed later.")}
              >
                <div className="space-y-4">
                  <PositionFields value={position} onChange={setPosition} options={positionOptions} />
                  {positionOptions.ready && positionOptions.designations.length === 0 ? (
                    <Field label={ui("Job title")} hint={ui("You have no rank ladder yet, so this is recorded as plain text.")}>
                      <Input
                        value={form.designation}
                        onChange={(e) => update("designation", e.target.value)}
                        placeholder={ui("e.g. Senior Maths Teacher")}
                      />
                    </Field>
                  ) : null}
                </div>
              </FormSection>

              <FormSection
                icon={Briefcase}
                title={ui("Contract & Pay")}
                hint={ui("Optional now — you can set this up later from the teacher's Staff Record. Only administrators can see it.")}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={ui("Joining date")}>
                    <Input
                      type="date"
                      value={form.joiningDate}
                      onChange={(e) => update("joiningDate", e.target.value)}
                    />
                  </Field>
                  <Field label={ui("Contract type")}>
                    <Select
                      value={form.contractType}
                      onChange={(e) => update("contractType", e.target.value)}
                    >
                      <option value="">{ui("Select type")}</option>
                      {CONTRACT_TYPES.map((c) => (
                        <option key={c.value} value={c.value}>{ui(c.label)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={ui("Basic salary")} hint={ui("Per month, in {0}", [locale.currency])}>
                    <Input
                      type="number"
                      value={form.basicSalary}
                      onChange={(e) => update("basicSalary", e.target.value)}
                      placeholder="e.g. 85000"
                    />
                  </Field>
                </div>
              </FormSection>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <FormSection icon={MapPin} title={ui("Address")} hint={ui("Where the teacher lives. Printed on official records.")}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={ui("Address")}>
                      <Textarea
                        value={form.address}
                        onChange={(e) => update("address", e.target.value)}
                        placeholder={ui("Full residential address")}
                        rows={2}
                      />
                    </Field>
                  </div>
                  <Field label={ui("City")}>
                    <Input
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder={ui("City")}
                    />
                  </Field>
                  <Field label={ui("Province")}>
                    <Select
                      value={form.province}
                      onChange={(e) => update("province", e.target.value)}
                    >
                      <option value="">{ui("Select province")}</option>
                      {PROVINCES.map((p) => (
                        <option key={p} value={p}>{ui(p)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={ui("Postal code")}>
                    <Input
                      value={form.postalCode}
                      onChange={(e) => update("postalCode", e.target.value)}
                      placeholder={ui("Postal code")}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={Phone} title={ui("Emergency contact")} hint={ui("Who the school calls if something happens at work.")}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={ui("Contact person")}>
                    <Input
                      value={form.emergencyContact}
                      onChange={(e) => update("emergencyContact", e.target.value)}
                      placeholder={ui("Contact name")}
                    />
                  </Field>
                  <Field label={ui("Emergency phone")}>
                    <Input
                      type="tel"
                      value={form.emergencyPhone}
                      onChange={(e) => update("emergencyPhone", e.target.value)}
                      placeholder="03XX-XXXXXXX"
                    />
                  </Field>
                </div>
              </FormSection>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <ReviewHero
                icon={Briefcase}
                eyebrow={ui("Ready to invite")}
                title={form.fullName || ui("Unnamed teacher")}
                meta={[form.email || ui("No email"), form.qualification ? ui(form.qualification) : "", form.designation].filter(Boolean).join(" · ")}
              />

              <ReviewSection title={ui("Personal information")} icon={User} onEdit={() => setStep(0)}>
                <ReviewRow label={ui("Full name")} value={form.fullName} required />
                <ReviewRow label={ui("Email")} value={form.email} required />
                <ReviewRow label={ui("Phone")} value={form.phone} required />
                <ReviewRow label={ui("CNIC")} value={form.cnic} />
                <ReviewRow label={ui("Date of birth")} value={form.dateOfBirth ? new Date(`${form.dateOfBirth}T00:00:00Z`).toLocaleDateString(localeTag(locale), { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : ""} />
                <ReviewRow label={ui("Gender")} value={genderLabel(form.gender)} />
              </ReviewSection>

              <ReviewSection title={ui("Professional details")} icon={Briefcase} onEdit={() => setStep(1)}>
                <ReviewRow label={ui("Qualification")} value={form.qualification ? ui(form.qualification) : ""} />
                <ReviewRow label={ui("Subjects")} value={teachesAll ? ui("All subjects") : specialties.join(", ")} />
                <ReviewRow label={ui("Experience")} value={form.experience} />
                <ReviewRow label={ui("Joining date")} value={form.joiningDate ? new Date(`${form.joiningDate}T00:00:00Z`).toLocaleDateString(localeTag(locale), { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }) : ""} />
                <ReviewRow label={ui("Contract type")} value={contractLabel(form.contractType)} />
                <ReviewRow
                  label={ui("Basic salary")}
                  value={form.basicSalary ? ui("{0} / month", [new Intl.NumberFormat(localeTag(locale), { style: "currency", currency: locale.currency }).format(Number(form.basicSalary))]) : ""}
                />
              </ReviewSection>

              <ReviewSection title={ui("Position & Reporting")} icon={Network} onEdit={() => setStep(1)}>
                <ReviewRow
                  label={ui("Rank")}
                  value={positionOptions.designations.find((d) => d.id === position.designationId)?.name ?? ""}
                />
                <ReviewRow
                  label={ui("Home department")}
                  value={positionOptions.departments.find((d) => d.id === position.primaryDepartmentId)?.name ?? ""}
                />
                <ReviewRow
                  label={ui("Reports to")}
                  value={positionOptions.managers.find((m) => m.id === position.reportsToId)?.name ?? ""}
                />
                <ReviewRow
                  label={ui("Employment type")}
                  value={EMPLOYMENT_TYPE_LABELS[position.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ? ui(EMPLOYMENT_TYPE_LABELS[position.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS]) : ""}
                />
                <ReviewRow label={ui("Staff code")} value={position.employeeCode} />
              </ReviewSection>

              <ReviewSection title={ui("Address & Emergency")} icon={MapPin} onEdit={() => setStep(2)}>
                <ReviewRow label={ui("Address")} value={form.address} />
                <ReviewRow label={ui("City")} value={form.city} />
                <ReviewRow label={ui("Province")} value={form.province ? ui(form.province) : ""} />
                <ReviewRow label={ui("Postal code")} value={form.postalCode} />
                <ReviewRow label={ui("Emergency contact")} value={form.emergencyContact} />
                <ReviewRow label={ui("Emergency phone")} value={form.emergencyPhone} />
              </ReviewSection>

              <Alert tone="warning" icon={Send} compact={false} live="off">
                {ui("This does not create an account. An invitation goes to {0}; they open the link, set a password and finish onboarding before they appear as an active teacher.", [form.email || ui("their email")])}
              </Alert>
            </div>
          )}
    </WizardShell>
  );
}




