"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Heart,
  Keyboard,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface ClassRecord {
  id: string;
  name: string;
  section?: string | null;
  academicYear: number;
}

interface ClassGroup {
  key: string;
  name: string;
  academicYear: number | string;
  sections: ClassRecord[];
}

interface AdmissionFormProps {
  classes: ClassRecord[];
  classGroups: ClassGroup[];
  onSuccess?: (student?: any) => void;
  onClose: () => void;
  initialClassId?: string;
  initialSection?: string;
  initialPrefill?: Partial<Record<keyof FormData, string>>;
}

const STEPS = [
  { label: "Personal Info", icon: User },
  { label: "Guardian Details", icon: Users },
  { label: "Address & Medical", icon: MapPin },
  { label: "Review & Submit", icon: Check },
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;

const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu & Kashmir",
];

const RELATIONSHIPS = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "uncle", label: "Uncle" },
  { value: "aunt", label: "Aunt" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  fullName: "",
  nameUr: "",
  dateOfBirth: "",
  gender: "MALE",
  bloodType: "",
  nationality: "Pakistan",
  phone: "",
  studentEmail: "",
  classId: "",
  rollNo: "",
  previousSchool: "",
  guardianName: "",
  guardianNameUr: "",
  guardianRelationship: "",
  guardianPhone: "",
  guardianWhatsapp: "",
  guardianEmail: "",
  guardianOccupation: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  medicalNotes: "",
  specialNeeds: "",
  allergies: "",
  medications: "",
  categoryId: "",
  groupId: "",
  siblingStudentId: "",
};

type FormData = typeof emptyForm;
type FormErrors = Partial<Record<keyof FormData, string>>;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

const TRANSLITERATION_RULES: [string, string][] = [
  ["sh", "ش"], ["ch", "چ"], ["kh", "خ"], ["th", "ث"], ["ph", "ف"],
  ["gh", "غ"], ["zh", "ژ"], ["aa", "ا"], ["ee", "ی"], ["oo", "و"],
  ["ai", "ائ"], ["au", "او"], ["ei", "ائ"],
  ["a", "ا"], ["b", "ب"], ["c", "ک"], ["d", "د"], ["e", "ے"],
  ["f", "ف"], ["g", "گ"], ["h", "ہ"], ["i", "ی"], ["j", "ج"],
  ["k", "ک"], ["l", "ل"], ["m", "م"], ["n", "ن"], ["o", "و"],
  ["p", "پ"], ["q", "ق"], ["r", "ر"], ["s", "س"], ["t", "ت"],
  ["u", "و"], ["v", "و"], ["w", "و"], ["x", "کس"], ["y", "ی"],
  ["z", "ز"],
];

function transliterateToUrdu(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      let result = "";
      let i = 0;
      const lower = word.toLowerCase();
      while (i < lower.length) {
        let matched = false;
        for (const [from, to] of TRANSLITERATION_RULES) {
          if (lower.startsWith(from, i)) {
            result += to;
            i += from.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          result += lower[i];
          i++;
        }
      }
      return result;
    })
    .join(" ");
}

const URDU_KEYS = [
  ["ا", "ب", "پ", "ت", "ٹ", "ث", "ج", "چ", "ح", "خ"],
  ["د", "ڈ", "ذ", "ر", "ڑ", "ز", "ژ", "س", "ش", "ص"],
  ["ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ک", "گ", "ل"],
  ["م", "ن", "ں", "و", "ہ", "ھ", "ء", "ی", "ے", " "],
];

function UrduInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowKeyboard(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir="rtl"
          lang="ur"
          className="flex-1"
        />
        <button
          type="button"
          className={`shrink-0 rounded-xl px-2.5 transition-all ${
            showKeyboard
              ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
              : "bg-[#f3f4f9] text-[#4d4354]/60 hover:bg-[#fbf0fe] hover:text-[#8127cf]"
          }`}
          onClick={() => setShowKeyboard(!showKeyboard)}
          title="Urdu keyboard"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {showKeyboard && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-[#cfc2d6]/25 bg-white p-2.5 shadow-[0_4px_16px_-4px_rgba(31,26,35,0.10),0_12px_32px_-12px_rgba(129,39,207,0.20)]">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-[#4d4354]/50">اردو کی بورڈ</span>
            <button
              type="button"
              className="rounded-lg p-0.5 text-[#4d4354]/30 hover:text-[#8127cf]"
              onClick={() => setShowKeyboard(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {URDU_KEYS.map((row, ri) => (
            <div key={ri} className="flex gap-0.5 mb-0.5">
              {row.map((char, ci) => (
                <button
                  key={ci}
                  type="button"
                  className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-all ${
                    char === " "
                      ? "bg-[#f3f4f9] text-[10px] text-[#4d4354]/40 hover:bg-[#fbf0fe]"
                      : "bg-[#f3f4f9] text-[#1f1a23] hover:bg-[#8127cf] hover:text-white active:scale-95"
                  }`}
                  onClick={() => {
                    onChange(value + char);
                  }}
                >
                  {char === " " ? "Space" : char}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-0.5 flex gap-0.5">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-[#4d4354]/60 hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange(value.slice(0, -1))}
            >
              ← Backspace
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#f3f4f9] py-1.5 text-[10px] font-bold text-[#4d4354]/60 hover:bg-red-50 hover:text-red-500 active:scale-95"
              onClick={() => onChange("")}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function classGroupKey(cls: ClassRecord) {
  return `${cls.academicYear}::${cls.name}`;
}

function sectionLabel(cls: ClassRecord) {
  return cls.section || "Main";
}

export function AdmissionForm({ classes, classGroups, onSuccess, onClose, initialClassId, initialPrefill }: AdmissionFormProps) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(() => ({
    ...emptyForm,
    ...(initialPrefill || {}),
    classId: (initialClassId && classes.some((cls) => cls.id === initialClassId) ? initialClassId : classes[0]?.id) || "",
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tags, setTags] = useState<{ categories: any[]; groups: any[] }>({ categories: [], groups: [] });
  const [siblings, setSiblings] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/student-categories").then((r) => r.json()),
      fetch("/api/student-groups").then((r) => r.json()),
    ])
      .then(([cats, grps]) => {
        if (!active) return;
        setTags({
          categories: cats.success ? cats.data : [],
          groups: grps.success ? grps.data : [],
        });
      })
      .catch(() => {});

    fetch("/api/students/siblings")
      .then((r) => r.json())
      .then((j) => {
        if (active && j.success) setSiblings(j.data || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const nameUrManuallyEdited = useRef(false);
  const guardianNameUrManuallyEdited = useRef(false);
  const rollNoManuallyEdited = useRef(false);
  const rollNoFetchController = useRef<AbortController | null>(null);
  const [rollNoLoading, setRollNoLoading] = useState(false);

  const fetchNextRollNo = useCallback(async (classId: string) => {
    if (!classId) return;
    rollNoFetchController.current?.abort();
    const controller = new AbortController();
    rollNoFetchController.current = controller;
    setRollNoLoading(true);
    try {
      const res = await fetch(`/api/students/next-roll?classId=${classId}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!controller.signal.aborted && !rollNoManuallyEdited.current) {
        setForm((prev) => ({ ...prev, rollNo: data.rollNo }));
      }
    } catch {
    } finally {
      if (!controller.signal.aborted) setRollNoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (form.classId) fetchNextRollNo(form.classId);
  }, [form.classId, fetchNextRollNo]);

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "fullName" && !nameUrManuallyEdited.current) {
        next.nameUr = transliterateToUrdu(value);
      }
      if (field === "guardianName" && !guardianNameUrManuallyEdited.current) {
        next.guardianNameUr = transliterateToUrdu(value);
      }

      return next;
    });

    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

    if (field === "nameUr") nameUrManuallyEdited.current = true;
    if (field === "guardianNameUr") guardianNameUrManuallyEdited.current = true;
    if (field === "rollNo") rollNoManuallyEdited.current = true;
  };

  const regenerateRollNo = () => {
    rollNoManuallyEdited.current = false;
    if (form.classId) fetchNextRollNo(form.classId);
  };

  const selectedClass = classes.find((cls) => cls.id === form.classId);
  const selectedGroupKey = selectedClass ? classGroupKey(selectedClass) : "";
  const selectedGroup = classGroups.find((g) => g.key === selectedGroupKey);
  const age = useMemo(() => calculateAge(form.dateOfBirth), [form.dateOfBirth]);

  const selectClassGroup = (key: string) => {
    const group = classGroups.find((g) => g.key === key);
    const newClassId = group?.sections[0]?.id || "";
    rollNoManuallyEdited.current = false;
    update("classId", newClassId);
  };

  const validateStep = (stepIndex: number): boolean => {
    const newErrors: FormErrors = {};

    if (stepIndex === 0) {
      if (!form.fullName.trim()) newErrors.fullName = "Student name is required";
      if (!form.rollNo.trim()) newErrors.rollNo = "Roll number is required";
      if (!form.classId) newErrors.classId = "Class is required";
      if (form.dateOfBirth) {
        const studentAge = calculateAge(form.dateOfBirth);
        if (studentAge !== null && studentAge < 3) {
          newErrors.dateOfBirth = "Student must be at least 3 years old";
        }
      }
      if (form.studentEmail && !isValidEmail(form.studentEmail)) {
        newErrors.studentEmail = "Enter a valid email address";
      }
    }

    if (stepIndex === 1) {
      if (form.guardianEmail && !isValidEmail(form.guardianEmail)) {
        newErrors.guardianEmail = "Enter a valid email address";
      }
      if (
        form.studentEmail &&
        form.guardianEmail &&
        form.studentEmail.toLowerCase() === form.guardianEmail.toLowerCase()
      ) {
        newErrors.guardianEmail = "Must be different from student email";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep(0) || !validateStep(1)) {
      toast.error("Please fix errors in the form before submitting");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...form,
        gender: form.gender || "OTHER",
        bloodType: form.bloodType || null,
        guardianRelationship: form.guardianRelationship || null,
        studentEmail: form.studentEmail || null,
        guardianEmail: form.guardianEmail || null,
      };

      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not add student");

      toast.success(data.message || "Student added successfully");

      if (data.guardianInviteFailures?.length) {
        toast.warning("Student created, but guardian invite email could not be sent.");
      }
      if (data.studentInviteFailures?.length) {
        toast.warning("Student created, but student login invite email could not be sent.");
      }

      onSuccess?.(data.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add student");
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[#1f1a23]/45 backdrop-blur-md animate-in fade-in-0" onClick={onClose} />

      <div role="dialog" aria-modal="true" className="relative z-[121] flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[34px] border border-[#cfc2d6]/20 bg-white shadow-[0_34px_90px_rgba(31,26,35,0.22)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 group" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 border-b border-[#cfc2d6]/15 bg-[#fbf0fe]/70 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-2 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[#8127cf]/18" />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#8127cf] to-[#9c48ea] shadow-lg shadow-[#8127cf]/20">
                  <GraduationCap className="h-5 w-5 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-black text-[#1f1a23]">Student Admission</h2>
                <p className="text-xs font-semibold text-[#4d4354]/65">
                  Step {step + 1} of {STEPS.length}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-xl p-2 text-[#4d4354]/45 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={s.label}
                  type="button"
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-all ${
                    isActive
                      ? "bg-[#8127cf] text-white shadow-lg shadow-[#8127cf]/20"
                      : isDone
                        ? "bg-[#8127cf]/10 text-[#8127cf]"
                        : "bg-white/60 text-[#4d4354]/45"
                  }`}
                  onClick={() => {
                    if (isDone) setStep(i);
                  }}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Progress bar line */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#cfc2d6]/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#8127cf] to-[#9c48ea] transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="sk-rise flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ animationDelay: "60ms" }}>
          {step === 0 && (
            <StepPersonalInfo
              form={form}
              errors={errors}
              age={age}
              classGroups={classGroups}
              selectedGroupKey={selectedGroupKey}
              selectedGroup={selectedGroup}
              tags={tags}
              siblings={siblings}
              rollNoLoading={rollNoLoading}
              onUpdate={update}
              onSelectClassGroup={selectClassGroup}
              onRegenerateRollNo={regenerateRollNo}
            />
          )}
          {step === 1 && (
            <StepGuardianDetails form={form} errors={errors} onUpdate={update} />
          )}
          {step === 2 && (
            <StepAddressMedical form={form} errors={errors} onUpdate={update} />
          )}
          {step === 3 && (
            <StepReview form={form} selectedClass={selectedClass} age={age} tags={tags} siblings={siblings} onEditStep={setStep} />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#cfc2d6]/15 bg-[#fbf0fe]/40 px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={step === 0 ? onClose : goBack}
              disabled={isSubmitting}
            >
              {step === 0 ? (
                "Cancel"
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </>
              )}
            </Button>

            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Submit Admission
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Personal Info ────────────────────────────────

function StepPersonalInfo({
  form,
  errors,
  age,
  classGroups,
  selectedGroupKey,
  selectedGroup,
  tags,
  siblings,
  rollNoLoading,
  onUpdate,
  onSelectClassGroup,
  onRegenerateRollNo,
}: {
  form: FormData;
  errors: FormErrors;
  age: number | null;
  classGroups: ClassGroup[];
  selectedGroupKey: string;
  selectedGroup: ClassGroup | undefined;
  tags: { categories: any[]; groups: any[] };
  siblings: any[];
  rollNoLoading: boolean;
  onUpdate: (field: keyof FormData, value: string) => void;
  onSelectClassGroup: (key: string) => void;
  onRegenerateRollNo: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Full Name (English) *" error={errors.fullName}>
          <Input
            value={form.fullName}
            onChange={(e) => onUpdate("fullName", e.target.value)}
            placeholder="Ali Ahmed Khan"
          />
        </FieldGroup>
        <FieldGroup label="Full Name (Urdu)" hint="Auto-generated from English name">
          <UrduInput
            value={form.nameUr}
            onChange={(val) => onUpdate("nameUr", val)}
            placeholder="علی احمد خان"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Roll Number *" error={errors.rollNo} hint="Auto-generated, unique across campus">
          <div className="relative">
            <Input
              value={form.rollNo}
              onChange={(e) => onUpdate("rollNo", e.target.value)}
              placeholder="NUR-Y-001"
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#4d4354]/40 transition-all hover:bg-[#fbf0fe] hover:text-[#8127cf]"
              onClick={onRegenerateRollNo}
              title="Regenerate roll number"
            >
              {rollNoLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </FieldGroup>
        <FieldGroup
          label="Date of Birth"
          error={errors.dateOfBirth}
          hint={age !== null ? `Age: ${age} years old` : undefined}
        >
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => onUpdate("dateOfBirth", e.target.value)}
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Class *" error={errors.classId}>
          <Select
            value={selectedGroupKey}
            onChange={(e) => onSelectClassGroup(e.target.value)}
          >
            <option value="">Select class</option>
            {classGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.name} - {group.academicYear}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Section *">
          <Select
            value={form.classId}
            onChange={(e) => onUpdate("classId", e.target.value)}
          >
            <option value="">Select section</option>
            {(selectedGroup?.sections || []).map((cls) => (
              <option key={cls.id} value={cls.id}>
                Section {sectionLabel(cls)}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FieldGroup label="Gender">
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
                onClick={() => onUpdate("gender", g)}
              >
                {g === "MALE" ? "Male" : g === "FEMALE" ? "Female" : "Other"}
              </button>
            ))}
          </div>
        </FieldGroup>
        <FieldGroup label="Blood Type">
          <Select
            value={form.bloodType}
            onChange={(e) => onUpdate("bloodType", e.target.value)}
          >
            <option value="">Not Known</option>
            {BLOOD_TYPES.map((bt) => (
              <option key={bt} value={bt}>
                {bt}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Nationality">
          <Input
            value={form.nationality}
            onChange={(e) => onUpdate("nationality", e.target.value)}
            placeholder="Pakistan"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Student Phone">
          <Input
            value={form.phone}
            onChange={(e) => onUpdate("phone", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
        <FieldGroup label="Student Login Email" error={errors.studentEmail}>
          <Input
            type="email"
            value={form.studentEmail}
            onChange={(e) => onUpdate("studentEmail", e.target.value)}
            placeholder="student@example.com"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Previous School">
        <Input
          value={form.previousSchool}
          onChange={(e) => onUpdate("previousSchool", e.target.value)}
          placeholder="Name of previous school (if any)"
        />
      </FieldGroup>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Category" hint="Fee / scholarship eligibility tag">
          <Select
            value={form.categoryId}
            onChange={(e) => onUpdate("categoryId", e.target.value)}
          >
            <option value="">No category</option>
            {tags.categories
              .filter((c) => c.isActive !== false || c.id === form.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Group" hint="Transport, hostel, house…">
          <Select
            value={form.groupId}
            onChange={(e) => onUpdate("groupId", e.target.value)}
          >
            <option value="">No group</option>
            {tags.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </FieldGroup>
      </div>

      <FieldGroup
        label="Link as sibling of"
        hint="Choose an existing student — they'll share a sibling group automatically. Leave blank for a new family."
      >
        <Select
          value={form.siblingStudentId}
          onChange={(e) => onUpdate("siblingStudentId", e.target.value)}
        >
          <option value="">No sibling link</option>
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} · {s.rollNo || "No roll"} · {[s.class?.name, s.class?.section].filter(Boolean).join(" ") || "Class?"}
            </option>
          ))}
        </Select>
      </FieldGroup>
    </div>
  );
}

// ─── Step 2: Guardian Details ─────────────────────────────

function StepGuardianDetails({
  form,
  errors,
  onUpdate,
}: {
  form: FormData;
  errors: FormErrors;
  onUpdate: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Guardian Full Name (English)">
          <Input
            value={form.guardianName}
            onChange={(e) => onUpdate("guardianName", e.target.value)}
            placeholder="Ahmed Khan"
          />
        </FieldGroup>
        <FieldGroup label="Guardian Full Name (Urdu)" hint="Auto-generated from English name">
          <UrduInput
            value={form.guardianNameUr}
            onChange={(val) => onUpdate("guardianNameUr", val)}
            placeholder="احمد خان"
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Relationship">
          <Select
            value={form.guardianRelationship}
            onChange={(e) => onUpdate("guardianRelationship", e.target.value)}
          >
            <option value="">Select relationship</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FieldGroup>
        <FieldGroup label="Occupation">
          <Input
            value={form.guardianOccupation}
            onChange={(e) => onUpdate("guardianOccupation", e.target.value)}
            placeholder="Engineer, Doctor, Teacher..."
          />
        </FieldGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldGroup label="Guardian Phone (WhatsApp)">
          <Input
            value={form.guardianPhone}
            onChange={(e) => onUpdate("guardianPhone", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
        <FieldGroup label="Guardian WhatsApp (if different)">
          <Input
            value={form.guardianWhatsapp}
            onChange={(e) => onUpdate("guardianWhatsapp", e.target.value)}
            placeholder="+92 300 1234567"
          />
        </FieldGroup>
      </div>

      <FieldGroup label="Guardian Email" error={errors.guardianEmail}>
        <Input
          type="email"
          value={form.guardianEmail}
          onChange={(e) => onUpdate("guardianEmail", e.target.value)}
          placeholder="guardian@example.com"
        />
      </FieldGroup>
    </div>
  );
}

// ─── Step 3: Address & Medical ────────────────────────────

function StepAddressMedical({
  form,
  errors,
  onUpdate,
}: {
  form: FormData;
  errors: FormErrors;
  onUpdate: (field: keyof FormData, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Address Section */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#8127cf]" />
          <span className="text-sm font-black text-[#1f1a23]">Address</span>
        </div>
        <div className="space-y-4">
          <FieldGroup label="Street Address">
            <Input
              value={form.address}
              onChange={(e) => onUpdate("address", e.target.value)}
              placeholder="123 Mosque Lane"
            />
          </FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FieldGroup label="City">
              <Input
                value={form.city}
                onChange={(e) => onUpdate("city", e.target.value)}
                placeholder="Lahore"
              />
            </FieldGroup>
            <FieldGroup label="Province">
              <Select
                value={form.province}
                onChange={(e) => onUpdate("province", e.target.value)}
              >
                <option value="">Select province</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </FieldGroup>
            <FieldGroup label="Postal Code">
              <Input
                value={form.postalCode}
                onChange={(e) => onUpdate("postalCode", e.target.value)}
                placeholder="54000"
              />
            </FieldGroup>
          </div>
        </div>
      </div>

      {/* Medical Section */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Heart className="h-4 w-4 text-[#8127cf]" />
          <span className="text-sm font-black text-[#1f1a23]">Medical Information</span>
        </div>
        <div className="space-y-4">
          <FieldGroup label="Medical Notes">
            <Textarea
              value={form.medicalNotes}
              onChange={(e) => onUpdate("medicalNotes", e.target.value)}
              placeholder="Any medical conditions or notes..."
              rows={2}
            />
          </FieldGroup>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldGroup label="Allergies">
              <Input
                value={form.allergies}
                onChange={(e) => onUpdate("allergies", e.target.value)}
                placeholder="Peanuts, Dairy, Gluten..."
              />
            </FieldGroup>
            <FieldGroup label="Current Medications">
              <Input
                value={form.medications}
                onChange={(e) => onUpdate("medications", e.target.value)}
                placeholder="None"
              />
            </FieldGroup>
          </div>
          <FieldGroup label="Special Needs">
            <Textarea
              value={form.specialNeeds}
              onChange={(e) => onUpdate("specialNeeds", e.target.value)}
              placeholder="Physical disability, learning support, hearing/vision impairment..."
              rows={2}
            />
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Review & Submit ──────────────────────────────

function StepReview({
  form,
  selectedClass,
  age,
  tags,
  siblings,
  onEditStep,
}: {
  form: FormData;
  selectedClass: ClassRecord | undefined;
  age: number | null;
  tags: { categories: any[]; groups: any[] };
  siblings: any[];
  onEditStep: (step: number) => void;
}) {
  const classDisplay = selectedClass
    ? [selectedClass.name, selectedClass.section].filter(Boolean).join(" - ")
    : "Not selected";

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-[#4d4354]/65">
        Please review all information before submitting.
      </p>

      <ReviewSection
        title="Student Information"
        icon={<User className="h-4 w-4" />}
        onEdit={() => onEditStep(0)}
      >
        <ReviewRow label="Name (English)" value={form.fullName} required />
        {form.nameUr && <ReviewRow label="Name (Urdu)" value={form.nameUr} dir="rtl" />}
        <ReviewRow label="Roll Number" value={form.rollNo} required />
        <ReviewRow
          label="Class"
          value={classDisplay}
        />
        <ReviewRow
          label="Date of Birth"
          value={
            form.dateOfBirth
              ? `${new Date(form.dateOfBirth).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}${age !== null ? ` (${age} yrs)` : ""}`
              : ""
          }
        />
        <ReviewRow label="Gender" value={form.gender === "MALE" ? "Male" : form.gender === "FEMALE" ? "Female" : "Other"} />
        {form.bloodType && <ReviewRow label="Blood Type" value={form.bloodType} />}
        {form.nationality && <ReviewRow label="Nationality" value={form.nationality} />}
        {form.phone && <ReviewRow label="Phone" value={form.phone} />}
        {form.studentEmail && <ReviewRow label="Student Email" value={form.studentEmail} />}
        {form.previousSchool && <ReviewRow label="Previous School" value={form.previousSchool} />}
        {form.categoryId || form.groupId ? (
          <>
            <ReviewRow
              label="Category"
              value={tags.categories.find((c) => c.id === form.categoryId)?.name || "None"}
            />
            <ReviewRow
              label="Group"
              value={tags.groups.find((g) => g.id === form.groupId)?.name || "None"}
            />
          </>
        ) : null}
        {form.siblingStudentId ? (
          <ReviewRow label="Sibling link" value={siblings.find((s) => s.id === form.siblingStudentId)?.fullName || "Selected sibling"} />
        ) : null}
      </ReviewSection>

      <ReviewSection
        title="Guardian Information"
        icon={<Users className="h-4 w-4" />}
        onEdit={() => onEditStep(1)}
      >
        {form.guardianName ? (
          <>
            <ReviewRow label="Name" value={form.guardianName} />
            {form.guardianRelationship && (
              <ReviewRow label="Relationship" value={form.guardianRelationship} />
            )}
            {form.guardianPhone && <ReviewRow label="Phone" value={form.guardianPhone} />}
            {form.guardianEmail && <ReviewRow label="Email" value={form.guardianEmail} />}
            {form.guardianOccupation && (
              <ReviewRow label="Occupation" value={form.guardianOccupation} />
            )}
          </>
        ) : (
          <p className="text-sm text-[#4d4354]/45">No guardian details provided</p>
        )}
      </ReviewSection>

      <ReviewSection
        title="Address & Medical"
        icon={<MapPin className="h-4 w-4" />}
        onEdit={() => onEditStep(2)}
      >
        {form.address || form.city || form.province ? (
          <ReviewRow
            label="Address"
            value={[form.address, form.city, form.province, form.postalCode]
              .filter(Boolean)
              .join(", ")}
          />
        ) : (
          <p className="text-sm text-[#4d4354]/45">No address provided</p>
        )}
        {form.allergies && <ReviewRow label="Allergies" value={form.allergies} />}
        {form.medicalNotes && <ReviewRow label="Medical Notes" value={form.medicalNotes} />}
        {form.specialNeeds && <ReviewRow label="Special Needs" value={form.specialNeeds} />}
        {form.medications && <ReviewRow label="Medications" value={form.medications} />}
        {!form.allergies && !form.medicalNotes && !form.specialNeeds && !form.medications && !form.address && !form.city && (
          <p className="text-sm text-[#4d4354]/45">No medical information provided</p>
        )}
      </ReviewSection>
    </div>
  );
}

// ─── Shared Components ────────────────────────────────────

function FieldGroup({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs font-semibold text-rose-500">{error}</p>}
      {hint && !error && <p className="text-xs font-medium text-[#4d4354]/50">{hint}</p>}
    </div>
  );
}

function ReviewSection({
  title,
  icon,
  onEdit,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#cfc2d6]/15 bg-[#fbf0fe]/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-black text-[#1f1a23]">
          <span className="text-[#8127cf]">{icon}</span>
          {title}
        </div>
        <button
          type="button"
          className="rounded-lg px-2.5 py-1 text-[10px] font-black text-[#8127cf] transition-all hover:bg-[#8127cf]/10"
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  required,
  dir,
}: {
  label: string;
  value: string;
  required?: boolean;
  dir?: "rtl" | "ltr";
}) {
  if (!value && !required) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0 font-semibold text-[#4d4354]/65">{label}</span>
      <span className="truncate font-bold text-[#1f1a23]" dir={dir}>
        {value || "—"}
      </span>
    </div>
  );
}
