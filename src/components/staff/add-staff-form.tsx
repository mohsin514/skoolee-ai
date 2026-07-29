"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Phone,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { addStaff } from "@/app/actions/addStaff";

interface AddStaffFormProps {
  role: "CAMPUS_ADMIN" | "PRINCIPAL";
  onSuccess: () => void;
  onClose: () => void;
}

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Address & Emergency", icon: MapPin },
  { label: "Review & Submit", icon: Check },
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
  CAMPUS_ADMIN: { title: "Add New Admin", eyebrow: "Campus Administration", submitLabel: "Add Admin" },
  PRINCIPAL: { title: "Appoint Principal", eyebrow: "Academic Leadership", submitLabel: "Appoint Principal" },
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
      await addStaff({
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        role,
      });
      toast.success(role === "PRINCIPAL" ? "Principal appointed successfully" : "Admin added successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add staff member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#1f1a23]/45 backdrop-blur-md animate-in fade-in-0" />

      <div className="relative z-[121] flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#cfc2d6]/10 px-7 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-normal text-[#8127cf]">{labels.eyebrow}</p>
            <h3 className="mt-1 text-xl font-black tracking-normal text-[#1f1a23]">{labels.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-[#4d4354]/40 transition-all hover:bg-[#fbf0fe] hover:text-rose-500 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-7 pt-4">
          <div className="flex items-center justify-between gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => { if (i < step) setStep(i); }}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[9px] font-black uppercase tracking-normal transition-all ${
                    active
                      ? "bg-[#8127cf] text-white shadow-md"
                      : done
                        ? "bg-[#fbf0fe] text-[#8127cf] cursor-pointer hover:bg-[#f0e0f8]"
                        : "text-[#4d4354]/30"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[#fbf0fe]">
            <div
              className="h-full rounded-full bg-[#8127cf] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-5 custom-scrollbar">
          {step === 0 && (
            <div className="space-y-4">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-black text-[#1f1a23]">
                <User className="h-4 w-4 text-[#8127cf]" /> Personal Information
              </h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">
                    Full Name <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    value={form.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    placeholder={role === "PRINCIPAL" ? "Principal's full name" : "Admin's full name"}
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                  {errors.fullName && <p className="mt-1 text-xs font-medium text-rose-500">{errors.fullName}</p>}
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">
                    Email <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="official@school.edu"
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                  {errors.email && <p className="mt-1 text-xs font-medium text-rose-500">{errors.email}</p>}
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">
                    Phone <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="03XX-XXXXXXX"
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                  {errors.phone && <p className="mt-1 text-xs font-medium text-rose-500">{errors.phone}</p>}
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">CNIC</Label>
                  <Input
                    value={form.cnic}
                    onChange={(e) => update("cnic", e.target.value)}
                    placeholder="XXXXX-XXXXXXX-X"
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Date of Birth</Label>
                  <Input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => update("dateOfBirth", e.target.value)}
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Gender</Label>
                  <Select
                    value={form.gender}
                    onChange={(e) => update("gender", e.target.value)}
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-black text-[#1f1a23]">
                <MapPin className="h-4 w-4 text-[#8127cf]" /> Address & Emergency Contact
              </h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Address</Label>
                  <Textarea
                    value={form.address}
                    onChange={(e) => update("address", e.target.value)}
                    placeholder="Full residential address"
                    rows={2}
                    className="mt-1 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    placeholder="City"
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Province</Label>
                  <Select
                    value={form.province}
                    onChange={(e) => update("province", e.target.value)}
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  >
                    <option value="">Select province</option>
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Postal Code</Label>
                  <Input
                    value={form.postalCode}
                    onChange={(e) => update("postalCode", e.target.value)}
                    placeholder="Postal code"
                    className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-[#fbf0fe] font-medium shadow-none focus:bg-white focus:ring-2 focus:ring-[#8127cf]/20"
                  />
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/50 p-4">
                <h5 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-normal text-[#8127cf]">
                  <Phone className="h-3.5 w-3.5" /> Emergency Contact
                </h5>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Contact Person</Label>
                    <Input
                      value={form.emergencyContact}
                      onChange={(e) => update("emergencyContact", e.target.value)}
                      placeholder="Contact name"
                      className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-white font-medium shadow-none focus:ring-2 focus:ring-[#8127cf]/20"
                    />
                  </div>
                  <div>
                    <Label className="ml-1 text-[10px] font-black uppercase tracking-normal text-[#4d4354]">Emergency Phone</Label>
                    <Input
                      type="tel"
                      value={form.emergencyPhone}
                      onChange={(e) => update("emergencyPhone", e.target.value)}
                      placeholder="03XX-XXXXXXX"
                      className="mt-1 h-12 rounded-xl border-[#cfc2d6]/20 bg-white font-medium shadow-none focus:ring-2 focus:ring-[#8127cf]/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h4 className="mb-4 flex items-center gap-2 text-sm font-black text-[#1f1a23]">
                <Check className="h-4 w-4 text-[#8127cf]" /> Review & Submit
              </h4>

              <ReviewSection title="Personal Information">
                <ReviewRow label="Full Name" value={form.fullName} />
                <ReviewRow label="Email" value={form.email} />
                <ReviewRow label="Phone" value={form.phone} />
                <ReviewRow label="CNIC" value={form.cnic} />
                <ReviewRow label="Date of Birth" value={form.dateOfBirth} />
                <ReviewRow label="Gender" value={form.gender === "MALE" ? "Male" : form.gender === "FEMALE" ? "Female" : "Other"} />
              </ReviewSection>

              <ReviewSection title="Address & Emergency">
                <ReviewRow label="Address" value={form.address} />
                <ReviewRow label="City" value={form.city} />
                <ReviewRow label="Province" value={form.province} />
                <ReviewRow label="Postal Code" value={form.postalCode} />
                <ReviewRow label="Emergency Contact" value={form.emergencyContact} />
                <ReviewRow label="Emergency Phone" value={form.emergencyPhone} />
              </ReviewSection>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700">
                  Default password <span className="font-black">skoolee123</span> will be set. The {role === "PRINCIPAL" ? "principal" : "admin"} should change it on first login.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#cfc2d6]/10 px-7 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 0 ? onClose : prevStep}
            className="h-12 gap-1.5 rounded-xl px-5 font-bold"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={nextStep} className="h-12 gap-1.5 rounded-xl px-6 font-bold">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="h-12 gap-1.5 rounded-xl px-6 font-bold">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : labels.submitLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#cfc2d6]/10 bg-[#fbf0fe]/50 p-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-normal text-[#8127cf]">{title}</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-normal text-[#4d4354]/45">{label}</p>
      <p className="text-sm font-bold text-[#1f1a23]">{value || "—"}</p>
    </div>
  );
}
