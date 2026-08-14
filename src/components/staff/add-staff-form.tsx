"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  Loader2,
  Send,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { inviteStaff } from "@/app/actions/invite";
import {
  Field,
  FormSection,
  ReviewHero,
  ReviewRow,
  ReviewSection,
  WizardShell,
} from "@/components/shared-admin/wizard-shell";

interface AddStaffFormProps {
  role: "CAMPUS_ADMIN" | "PRINCIPAL" | "ACCOUNTANT" | "LIBRARIAN" | "RECEPTIONIST";
  onSuccess: () => void;
  onClose: () => void;
}

const STEPS = [
  { label: "Personal Info", icon: User, blurb: "Who they are and how the school reaches them." },
  { label: "Address & Emergency", icon: MapPin, blurb: "Where they live and who to call in an emergency." },
  { label: "Review & Submit", icon: Check, blurb: "Check everything, then send the invitation." },
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
  CAMPUS_ADMIN: { title: "Invite Admin", eyebrow: "Campus Administration", submitLabel: "Send Invitation" },
  PRINCIPAL: { title: "Invite Principal", eyebrow: "Academic Leadership", submitLabel: "Send Invitation" },
  ACCOUNTANT: { title: "Invite Accountant", eyebrow: "Finance Team", submitLabel: "Send Invitation" },
  LIBRARIAN: { title: "Invite Librarian", eyebrow: "Library Staff", submitLabel: "Send Invitation" },
  RECEPTIONIST: { title: "Invite Receptionist", eyebrow: "Front Desk", submitLabel: "Send Invitation" },
};

export function AddStaffForm({ role, onSuccess, onClose }: AddStaffFormProps) {
  const labels = ROLE_LABELS[role];
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      toast.error("Please fix errors in the form");
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
        },
      });
      toast.success(`Invitation sent to ${form.email.trim().toLowerCase()}`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send invitation");
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
              <FormSection icon={User} title="Identity" hint="Their name as it should appear on campus records.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Full Name" required error={errors.fullName}>
                      <Input
                        value={form.fullName}
                        onChange={(e) => update("fullName", e.target.value)}
                        placeholder={role === "PRINCIPAL" ? "Principal's full name" : role === "CAMPUS_ADMIN" ? "Admin's full name" : "Staff member's full name"}
                      />
                    </Field>
                  </div>
                  <Field label="CNIC" hint="National ID, if you record it">
                    <Input
                      value={form.cnic}
                      onChange={(e) => update("cnic", e.target.value)}
                      placeholder="XXXXX-XXXXXXX-X"
                    />
                  </Field>
                  <Field label="Date of Birth">
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => update("dateOfBirth", e.target.value)}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Gender">
                      <div className="flex gap-2">
                        {(["MALE", "FEMALE", "OTHER"] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
                              form.gender === g
                                ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
                                : "bg-[#f3f4f9] text-[#4d4354] hover:bg-[#fbf0fe] hover:text-[#8127cf]"
                            }`}
                            onClick={() => update("gender", g)}
                          >
                            {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </div>
                </div>
              </FormSection>

              <FormSection
                icon={Phone}
                title="Contact & Sign-in"
                hint="The invitation goes to this email. It becomes their sign-in address and cannot be changed later."
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Email" required error={errors.email}>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="official@school.edu"
                    />
                  </Field>
                  <Field label="Phone" required error={errors.phone}>
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
              <FormSection icon={MapPin} title="Address" hint="Where they live. Printed on official records.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Address">
                      <Textarea
                        value={form.address}
                        onChange={(e) => update("address", e.target.value)}
                        placeholder="Full residential address"
                        rows={2}
                      />
                    </Field>
                  </div>
                  <Field label="City">
                    <Input
                      value={form.city}
                      onChange={(e) => update("city", e.target.value)}
                      placeholder="City"
                    />
                  </Field>
                  <Field label="Province">
                    <Select
                      value={form.province}
                      onChange={(e) => update("province", e.target.value)}
                    >
                      <option value="">Select province</option>
                      {PROVINCES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Postal Code">
                    <Input
                      value={form.postalCode}
                      onChange={(e) => update("postalCode", e.target.value)}
                      placeholder="Postal code"
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection icon={Phone} title="Emergency Contact" hint="Who the school calls if something happens at work.">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Contact Person">
                    <Input
                      value={form.emergencyContact}
                      onChange={(e) => update("emergencyContact", e.target.value)}
                      placeholder="Contact name"
                    />
                  </Field>
                  <Field label="Emergency Phone">
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

          {step === 2 && (
            <div className="space-y-5">
              <ReviewHero
                icon={User}
                eyebrow="Ready to invite"
                title={form.fullName || "Unnamed"}
                meta={`${labels.title} · ${form.email || "No email"}`}
              />

              <ReviewSection title="Personal Information" icon={User} onEdit={() => setStep(0)}>
                <ReviewRow label="Full Name" value={form.fullName} required />
                <ReviewRow label="Email" value={form.email} required />
                <ReviewRow label="Phone" value={form.phone} />
                <ReviewRow label="CNIC" value={form.cnic} />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth} />
                <ReviewRow label="Gender" value={form.gender === "MALE" ? "Male" : form.gender === "FEMALE" ? "Female" : "Other"} />
              </ReviewSection>

              <ReviewSection title="Address & Emergency" icon={MapPin} onEdit={() => setStep(1)}>
                <ReviewRow label="Address" value={form.address} />
                <ReviewRow label="City" value={form.city} />
                <ReviewRow label="Province" value={form.province} />
                <ReviewRow label="Postal Code" value={form.postalCode} />
                <ReviewRow label="Emergency Contact" value={form.emergencyContact} />
                <ReviewRow label="Emergency Phone" value={form.emergencyPhone} />
              </ReviewSection>

              <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs font-semibold text-amber-800">
                  This does not create an account. An invitation goes to <b>{form.email || "their email"}</b>; they must
                  open the link, set a password and finish onboarding before the role becomes active.
                </p>
              </div>
            </div>
          )}
    </WizardShell>
  );
}




