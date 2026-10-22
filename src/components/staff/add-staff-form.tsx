"use client";

import { fillNodes } from "@/lib/auth/fill-nodes";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  Send,
  MapPin,
  Network,
  Phone,
  User,
} from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { useUiText } from "@/components/locale/LocaleProvider";
import { Alert } from "@/components/ui/alert";
import { inviteStaff } from "@/app/actions/invite";
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


interface AddStaffFormProps {
  role: "CAMPUS_ADMIN" | "PRINCIPAL" | "ACCOUNTANT" | "LIBRARIAN" | "RECEPTIONIST";
  onSuccess: () => void;
  onClose: () => void;
}

const STEPS = [
  { label: "Personal info", icon: User, blurb: "Who they are and how the school reaches them." },
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

const emptyForm = {
  fullName: "",
  email: "",
  phone: "",
  cnic: "",
  dateOfBirth: "",
  gender: "MALE",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  emergencyContact: "",
  emergencyPhone: "",
};

type FormData = typeof emptyForm;

const ROLE_LABELS: Record<string, { title: string; eyebrow: string; submitLabel: string }> = {
  // EN UI keys. A CAMPUS_ADMIN invited from /admin is the single-school owner's deputy (§2.1 row 4).
  CAMPUS_ADMIN: { title: "Invite deputy admin", eyebrow: "School administration", submitLabel: "Send invitation" },
  PRINCIPAL: { title: "Appoint principal", eyebrow: "Academic leadership", submitLabel: "Send invitation" },
  ACCOUNTANT: { title: "Invite accountant", eyebrow: "Finance team", submitLabel: "Send invitation" },
  LIBRARIAN: { title: "Invite librarian", eyebrow: "Library staff", submitLabel: "Send invitation" },
  RECEPTIONIST: { title: "Invite receptionist", eyebrow: "Front desk", submitLabel: "Send invitation" },
};

export function AddStaffForm({ role, onSuccess, onClose }: AddStaffFormProps) {
  const ui = useUiText();
  const labels = ROLE_LABELS[role];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      if (!form.fullName.trim()) errs.fullName = "Full name is required";
      if (!form.email.trim()) errs.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Invalid email";
      if (!form.phone.trim()) errs.phone = "Phone is required";
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
      toast.error(ui("Fix the highlighted fields, then send the invitation again."));
      return;
    }

    setIsSubmitting(true);
    try {
      await inviteStaff({
        email: form.email.trim().toLowerCase(),
        fullName: form.fullName.trim(),
        role,
        profile: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || undefined,
          cnic: form.cnic.trim() || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          address: form.address.trim() || undefined,
          city: form.city.trim() || undefined,
          province: form.province || undefined,
          postalCode: form.postalCode.trim() || undefined,
          emergencyContact: form.emergencyContact.trim() || undefined,
          emergencyPhone: form.emergencyPhone.trim() || undefined,
          // Non-teaching staff belong on the org chart too — an accountant
          // reports to the admin officer, a librarian heads the Library unit.
          designationId: position.designationId || undefined,
          primaryDepartmentId: position.primaryDepartmentId || undefined,
          reportsToId: position.reportsToId || undefined,
          employmentType: (position.employmentType || undefined) as
            | "FULL_TIME" | "PART_TIME" | "VISITING" | "ADJUNCT" | "CONTRACT" | "INTERN" | "VOLUNTEER"
            | undefined,
          employeeCode: position.employeeCode.trim() || undefined,
        },
      });
      toast.success(ui("Invitation sent to {0}", [form.email.trim().toLowerCase()]));
      onSuccess();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not send the invitation. Please try again.")));
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <WizardShell
      eyebrow={labels.title}
      icon={User}
      steps={STEPS}
      step={step}
      onStepChange={setStep}
      onClose={onClose}
      onBack={prevStep}
      onNext={nextStep}
      onSubmit={handleSubmit}
      submitLabel="Send Invitation"
      submitIcon={<Send className="h-4 w-4" />}
      submitting={isSubmitting}
      submittingLabel="Sending…"
    >
          {step === 0 && (
            <div className="space-y-5">
              <FormSection icon={User} title={ui("Identity")} hint={ui("Their name as it should appear on campus records.")}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label={ui("Full Name")} required error={errors.fullName}>
                      <Input
                        value={form.fullName}
                        onChange={(e) => update("fullName", e.target.value)}
                        placeholder={role === "PRINCIPAL" ? ui("Principal's full name") : role === "CAMPUS_ADMIN" ? ui("Admin's full name") : ui("Staff member's full name")}
                      />
                    </Field>
                  </div>
                  <Field label={ui("CNIC")} hint={ui("National ID, if you record it")}>
                    <Input
                      value={form.cnic}
                      onChange={(e) => update("cnic", e.target.value)}
                      placeholder={ui("XXXXX-XXXXXXX-X")}
                    />
                  </Field>
                  <Field label={ui("Date of Birth")}>
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
                            {g === "MALE" ? ui("Male") : g === "FEMALE" ? ui("Female") : ui("Other")}
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
                      placeholder={ui("official@school.edu")}
                    />
                  </Field>
                  <Field label={ui("Phone")} required error={errors.phone}>
                    <Input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder={ui("03XX-XXXXXXX")}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection
                icon={Network}
                title={ui("Position & Reporting")}
                hint={ui("Where they sit in the institution. All of it can be changed later in Staff structure.")}
              >
                <PositionFields value={position} onChange={setPosition} options={positionOptions} />
              </FormSection>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <FormSection icon={MapPin} title={ui("Address")} hint={ui("Where they live. Printed on official records.")}>
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
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={ui("Postal Code")}>
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
                  <Field label={ui("Contact Person")}>
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
                      placeholder={ui("03XX-XXXXXXX")}
                    />
                  </Field>
                </div>
              </FormSection>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <ReviewHero
                icon={User}
                eyebrow={ui("Ready to invite")}
                title={form.fullName || ui("Unnamed")}
                meta={ui("{0} · {1}", [ui(labels.title), form.email || ui("No email")])}
              />

              <ReviewSection title={ui("Personal information")} icon={User} onEdit={() => setStep(0)}>
                <ReviewRow label={ui("Full Name")} value={form.fullName} required />
                <ReviewRow label={ui("Email")} value={form.email} required />
                <ReviewRow label={ui("Phone")} value={form.phone} />
                <ReviewRow label={ui("CNIC")} value={form.cnic} />
                <ReviewRow label={ui("Date of Birth")} value={form.dateOfBirth} />
                <ReviewRow label={ui("Gender")} value={form.gender === "MALE" ? "Male" : form.gender === "FEMALE" ? "Female" : "Other"} />
              </ReviewSection>

              <ReviewSection title={ui("Position & Reporting")} icon={Network} onEdit={() => setStep(0)}>
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
                  value={ui(EMPLOYMENT_TYPE_LABELS[position.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? "")}
                />
                <ReviewRow label={ui("Staff code")} value={position.employeeCode} />
              </ReviewSection>

              <ReviewSection title={ui("Address & Emergency")} icon={MapPin} onEdit={() => setStep(1)}>
                <ReviewRow label={ui("Address")} value={form.address} />
                <ReviewRow label={ui("City")} value={form.city} />
                <ReviewRow label={ui("Province")} value={form.province} />
                <ReviewRow label={ui("Postal Code")} value={form.postalCode} />
                <ReviewRow label={ui("Emergency contact")} value={form.emergencyContact} />
                <ReviewRow label={ui("Emergency phone")} value={form.emergencyPhone} />
              </ReviewSection>

              <Alert tone="warning" compact live="off" title={ui("This sends an invitation, not an account")}>
                {fillNodes(ui("An invitation goes to {0}; they must open the link, set a password and finish onboarding before the role becomes active."), <b><bdi dir="ltr">{form.email || ui("their email")}</bdi></b>)}
              </Alert>
            </div>
          )}
    </WizardShell>
  );
}




